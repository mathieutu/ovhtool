import { spawn } from 'node:child_process'
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

/** Copies `text` to the system clipboard by shelling out to the OS's own clipboard utility (no extra dependency). */
export async function copyToClipboard(text: string): Promise<void> {
  for (const candidate of candidateCommands()) {
    if (await tryCopy(candidate, text)) return
  }
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
