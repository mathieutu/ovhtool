import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { textToRtf } from './cliPure.ts'
import { ValidationError } from './errors.ts'

type ClipboardCommand = { command: string; args: string[] }

function candidateCommands(): ClipboardCommand[] {
  switch (process.platform) {
    case 'darwin':
      return [{ command: 'pbcopy', args: [] }]
    case 'win32':
      return [{ command: 'clip', args: [] }]
    default:
      return [
        { command: 'wl-copy', args: [] },
        { command: 'xclip', args: ['-selection', 'clipboard'] },
        { command: 'xsel', args: ['--clipboard', '--input'] },
      ]
  }
}

/**
 * Copies `text` to the system clipboard, plain-text only, by shelling out to
 * the OS's own clipboard utility (no extra dependency).
 */
async function copyPlainText(text: string): Promise<boolean> {
  for (const candidate of candidateCommands()) {
    if (await tryCopy(candidate, text)) return true
  }
  return false
}

/**
 * Copies `text` to the system clipboard. On macOS and Windows, also attaches
 * a monospace-styled HTML flavor (plus RTF) alongside the plain text:
 * pasting from a terminal already looks aligned because the terminal's own
 * font is monospace, but a Markdown table pasted into a rich-text compose
 * box otherwise renders in that destination's own proportional font, which
 * breaks the column padding. HTML is what a browser-based compose box reads
 * on paste (Gmail, Slack, this very chat's own input — they read the
 * `text/html` clipboard flavor, not RTF); RTF is what a native desktop app
 * reads (Mail.app, Word, Outlook). Both are offered side by side with the
 * plain text so every destination gets a flavor it understands. Falls back
 * to plain text if the rich path fails for any reason (missing
 * `osascript`/PowerShell, an unsupported platform, ...).
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (process.platform === 'darwin' && (await copyMonospaceRtfMac(text))) return
  if (process.platform === 'win32' && (await copyMonospaceRtfWindows(text))) return
  if (await copyPlainText(text)) return
  throw new ValidationError(
    'No clipboard utility found. Install pbcopy (macOS), clip (Windows), or xclip/xsel/wl-copy (Linux).',
    'clipboard_unavailable',
  )
}

function tryCopy(candidate: ClipboardCommand, text: string): Promise<boolean> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(candidate.command, candidate.args, { stdio: ['pipe', 'ignore', 'ignore'] })
    } catch {
      resolve(false)
      return
    }
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
    child.stdin?.end(text) ?? resolve(false)
  })
}

/** Runs `command`, resolving to whether it exited with code 0, or `false` on any failure (missing binary, ...). */
function runToCompletion(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(command, args, { stdio: 'ignore' })
    } catch {
      resolve(false)
      return
    }
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A monospace-styled HTML fragment wrapping `text` — the flavor a browser-based compose box (Gmail, Slack, chat inputs...) reads on paste. */
const htmlOf = (text: string) => `<pre style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre;">${escapeHtml(text)}</pre>`

/**
 * The JXA (JavaScript for Automation) program that puts a plain-text, an
 * HTML, and an RTF representation onto the macOS pasteboard all at once —
 * `pbcopy` only ever sets one flavor, and `pbcopy -Prefer rtf` would replace
 * the plain text flavor entirely, breaking a paste into any plain-text-only
 * target (e.g. a terminal). Takes the source files as script arguments so
 * `text` never has to survive shell-argument quoting.
 */
const SET_PASTEBOARD_JXA = `
ObjC.import('AppKit')
function run(argv) {
  var txtPath = argv[0], htmlPath = argv[1], rtfPath = argv[2]
  var plainText = $.NSString.stringWithContentsOfFileEncodingError(txtPath, $.NSUTF8StringEncoding, null)
  var htmlData = $.NSData.dataWithContentsOfFile(htmlPath)
  var rtfData = $.NSData.dataWithContentsOfFile(rtfPath)
  var pasteboard = $.NSPasteboard.generalPasteboard
  pasteboard.clearContents
  pasteboard.setStringForType(plainText, $.NSPasteboardTypeString)
  pasteboard.setDataForType(htmlData, $.NSPasteboardTypeHTML)
  pasteboard.setDataForType(rtfData, $.NSPasteboardTypeRTF)
}
`

/**
 * The equivalent for Windows: `System.Windows.Forms.DataObject` can hold
 * several flavors at once (unlike `clip.exe`, which only ever sets plain
 * text), but `Clipboard`/`DataObject` require an STA thread, hence
 * `powershell -STA` below. Untested against a real Windows clipboard
 * consumer (this tool was written and run on macOS) — if it turns out to be
 * wrong in practice, `copyToClipboard` still falls back to plain `clip.exe`
 * text.
 */
const SET_CLIPBOARD_PS1 = `
param([string]$TxtPath, [string]$HtmlPath, [string]$RtfPath)
Add-Type -AssemblyName System.Windows.Forms
$plain = [System.IO.File]::ReadAllText($TxtPath, [System.Text.Encoding]::UTF8)
$html = [System.IO.File]::ReadAllText($HtmlPath, [System.Text.Encoding]::UTF8)
$rtf = [System.IO.File]::ReadAllText($RtfPath, [System.Text.Encoding]::ASCII)
$data = New-Object System.Windows.Forms.DataObject
$data.SetText($plain, [System.Windows.Forms.TextDataFormat]::UnicodeText)
$data.SetText($html, [System.Windows.Forms.TextDataFormat]::Html)
$data.SetText($rtf, [System.Windows.Forms.TextDataFormat]::Rtf)
[System.Windows.Forms.Clipboard]::SetDataObject($data, $true)
`

/** Writes `text`, `htmlOf(text)` and `textToRtf(text)` to temp files under a fresh temp dir, runs `run(dir, txtPath, htmlPath, rtfPath)`, and always cleans the dir up afterwards. */
async function withTextHtmlAndRtfFiles<R>(text: string, run: (dir: string, txtPath: string, htmlPath: string, rtfPath: string) => Promise<R>): Promise<R> {
  const dir = await mkdtemp(join(tmpdir(), 'ovhtool-clip-'))
  try {
    const txtPath = join(dir, 'table.txt')
    const htmlPath = join(dir, 'table.html')
    const rtfPath = join(dir, 'table.rtf')
    await Promise.all([writeFile(txtPath, text, 'utf8'), writeFile(htmlPath, htmlOf(text), 'utf8'), writeFile(rtfPath, textToRtf(text), 'ascii')])
    return await run(dir, txtPath, htmlPath, rtfPath)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/** Puts `text` on the macOS pasteboard as plain text, HTML, and RTF flavors. Returns whether it succeeded. */
function copyMonospaceRtfMac(text: string): Promise<boolean> {
  return withTextHtmlAndRtfFiles(text, async (dir, txtPath, htmlPath, rtfPath) => {
    const scriptPath = join(dir, 'set-pasteboard.js')
    await writeFile(scriptPath, SET_PASTEBOARD_JXA, 'utf8')
    return runToCompletion('osascript', ['-l', 'JavaScript', scriptPath, txtPath, htmlPath, rtfPath])
  })
}

/** Puts `text` on the Windows clipboard as plain text, HTML, and RTF flavors. Returns whether it succeeded. */
function copyMonospaceRtfWindows(text: string): Promise<boolean> {
  return withTextHtmlAndRtfFiles(text, async (dir, txtPath, htmlPath, rtfPath) => {
    const scriptPath = join(dir, 'set-clipboard.ps1')
    await writeFile(scriptPath, SET_CLIPBOARD_PS1, 'utf8')
    for (const shell of ['powershell', 'pwsh']) {
      if (await runToCompletion(shell, ['-NoProfile', '-STA', '-File', scriptPath, txtPath, htmlPath, rtfPath])) return true
    }
    return false
  })
}
