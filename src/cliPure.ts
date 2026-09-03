import { ValidationError } from './errors.ts'

// Pure presentation/validation logic used by the CLI. Kept dependency-free
// (no Ink/React) so it can be unit-tested natively, without a build step.

export function assertNotConflictingFlags(yes: boolean, dryRun: boolean): void {
  if (yes && dryRun) {
    throw new ValidationError('--yes and --dry-run are mutually exclusive.', 'conflicting_flags')
  }
}

/** Case-insensitive substring filter across whatever fields `searchFields` extracts from each row. */
export function filterRows<T>(rows: T[], term: string | undefined, searchFields: (row: T) => (string | number)[]): T[] {
  if (!term) return rows
  const needle = term.toLowerCase()
  return rows.filter((row) => searchFields(row).some((field) => String(field).toLowerCase().includes(needle)))
}

/**
 * Renders a header + rows as a Markdown table (`| col | col |` with a
 * `| --- | --- |` separator row), with every column padded to its widest
 * cell so the pipes line up when viewed as raw text, not just once rendered.
 */
export function toMarkdownTable(header: string[], rows: (string | number)[][]): string {
  const cell = (value: string | number) => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
  const cellRows = [header.map(cell), ...rows.map((row) => row.map(cell))]
  const widths = header.map((_, i) => Math.max(3, ...cellRows.map((row) => (row[i] ?? '').length)))
  const line = (cells: string[]) => `| ${cells.map((c, i) => c.padEnd(widths[i]!)).join(' | ')} |`
  const separator = `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`
  return [line(cellRows[0]!), separator, ...cellRows.slice(1).map(line)].join('\n')
}

/**
 * Sorts `rows` alphabetically by `columnValues[0](item)` (case-sensitive
 * `localeCompare`), falling back to the next `columnValues` entries to break
 * ties — used to give every `Table` a predictable default order regardless
 * of API response order. Without the fallbacks, two rows tied on the primary
 * key would keep whatever relative order the API happened to return them in
 * that call, which can vary from one fetch to the next and looks like a
 * random shuffle on screen.
 */
export function sortRowsByColumn<T>(rows: T[], columnValues: ((item: T) => string)[]): T[] {
  return [...rows].sort((a, b) => {
    for (const columnValue of columnValues) {
      const diff = columnValue(a).localeCompare(columnValue(b))
      if (diff !== 0) return diff
    }
    return 0
  })
}

/**
 * The exact filter+sort transformation a `Table` applies before rendering:
 * case-insensitive substring filter, then (if `sortKeys` is given — a
 * `Table`'s columns from the second one onward) an alphabetical sort using
 * later columns to break ties on earlier ones. A screen's own "what row is
 * selected"/"copy this to the clipboard" logic must reuse this *same*
 * function (with the same `sortKeys`) rather than filtering separately —
 * otherwise `selectedIndex` (which indexes the row order the user actually
 * sees on screen) would desync from the unsorted list and resolve to the
 * wrong row.
 */
export function visibleRows<T>(rows: T[], filter: string | undefined, searchFields: (item: T) => (string | number)[], sortKeys?: ((item: T) => string)[]): T[] {
  const filtered = filterRows(rows, filter, searchFields)
  return sortKeys?.length ? sortRowsByColumn(filtered, sortKeys) : filtered
}

/**
 * Reconciles a freshly fetched row list with mutations the app already knows
 * succeeded but the server's own listing endpoint hasn't caught up with yet
 * (OVH's list/get endpoints can echo a just-applied add/edit/delete for a
 * beat) — `pending` maps a row id to either its known-correct replacement or
 * `'deleted'`. A row present in `pending` is replaced/dropped regardless of
 * what `rows` says; a pending row absent from `rows` (an add the listing
 * hasn't picked up yet) is appended.
 */
export function applyPendingOverrides<T, K>(rows: T[], pending: Map<K, T | 'deleted'>, idOf: (row: T) => K): T[] {
  const seen = new Set<K>()
  const reconciled = rows.flatMap((row) => {
    const id = idOf(row)
    seen.add(id)
    const override = pending.get(id)
    if (override === 'deleted') return []
    return [override ?? row]
  })
  const added = [...pending].filter(([id, value]) => value !== 'deleted' && !seen.has(id)).map(([, value]) => value as T)
  return [...reconciled, ...added]
}

/** Full domain name for a record (e.g. "www.example.com", or "example.com" for the root). */
export function fullDomain(zone: string, subDomain: string): string {
  return subDomain && subDomain !== '@' ? `${subDomain}.${zone}` : zone
}

/**
 * Loose sanity check for the CLI's bare `[domain]` argument: every domain
 * this tool ever deals with is a registered zone bought through OVH, always
 * at least a `label.tld` — so a value with no "." at all is never a real
 * domain, and near-certainly a mistyped subcommand (`ovhtool redirections`
 * meaning `mail-redirect`) landing here instead, since Commander only falls
 * through to this bare-argument handler when the word didn't match any
 * registered subcommand. Deliberately not a full domain-syntax validator —
 * OVH's own API is the source of truth for whether a dotted string is an
 * actual, accessible domain; this only catches the "obviously not a domain"
 * case early, with a clearer message than a downstream API 404 would give.
 */
export function isPlausibleDomain(value: string): boolean {
  return value.includes('.')
}

/**
 * Strips an accidentally-typed `domain` suffix from a local-part-only field
 * (e.g. a DNS subdomain input) — so typing "www.example.com" while the zone
 * is "example.com" still resolves to "www" instead of doubling up into
 * "www.example.com.example.com". Typing the bare domain collapses to '' (the
 * zone root).
 */
export function stripDomainSuffix(value: string, domain: string): string {
  const trimmed = value.trim()
  if (trimmed === domain) return ''
  if (trimmed.endsWith(`.${domain}`)) return trimmed.slice(0, -(domain.length + 1))
  return trimmed
}

/**
 * Strips an accidentally-typed `@domain` suffix from a local-part-only email
 * field (e.g. a mail account name input) — so typing "contact@example.com"
 * while the domain is "example.com" still resolves to "contact".
 */
export function stripEmailDomain(value: string, domain: string): string {
  const trimmed = value.trim()
  const suffix = `@${domain}`
  return trimmed.endsWith(suffix) ? trimmed.slice(0, -suffix.length) : trimmed
}

/**
 * The inverse of `stripEmailDomain`, for a field that's normally a local
 * part but may still receive a full address (e.g. a mail redirection's
 * "from", pre-filled from the CLI) — appends `@domain` unless one is
 * already present.
 */
export function ensureEmailDomain(value: string, domain: string): string {
  return value.includes('@') ? value : `${value}@${domain}`
}

/**
 * Builds column widths that fit within `availableWidth`: every width in
 * `fixed` is used as-is, and any `null` entry shares the remaining width
 * evenly (used for the one free-text column of a `Table`, e.g. a DNS
 * record's value, so long content truncates instead of overflowing the
 * terminal). `separator` is the number of characters rendered between two
 * columns. Takes `availableWidth` explicitly (rather than reading
 * `process.stdout.columns` itself) so it stays a pure, deterministic function.
 */
export function fitColumnWidths(fixed: (number | null)[], availableWidth: number, separator = 2): number[] {
  const overhead = Math.max(fixed.length - 1, 0) * separator
  const fixedTotal = fixed.reduce<number>((sum, w) => sum + (w ?? 0), 0)
  const flexCount = fixed.filter((w) => w === null).length
  const remaining = Math.max(availableWidth - fixedTotal - overhead, flexCount * 20)
  const flexWidth = flexCount > 0 ? Math.floor(remaining / flexCount) : 0
  return fixed.map((w) => w ?? flexWidth)
}

/**
 * The width a column actually needs: the longest of its header and every
 * rendered value — used to size a `Table`'s fixed columns to their real
 * content instead of a hardcoded guess, which otherwise leaves a column
 * (often the first, an id/short code) mostly empty padding for no reason.
 */
export function naturalColumnWidth(header: string, values: string[]): number {
  return Math.max(header.length, ...values.map((v) => v.length))
}

/** Truncates `text` with an ellipsis and pads it to exactly `width` characters. */
export function truncatePad(text: string, width: number): string {
  if (width <= 0) return ''
  const clipped = text.length > width ? text.slice(0, Math.max(width - 1, 0)) + '…' : text
  return clipped.padEnd(width)
}

/** Current terminal width, falling back to a sane default when not a TTY (e.g. piped). */
export function terminalWidth(): number {
  return process.stdout.columns && process.stdout.columns > 40 ? process.stdout.columns : 100
}

/**
 * Scrolling window `[start, end)` of `visibleCount` rows out of `total` that
 * keeps `selectedIndex` in view, centering on it once the list is longer
 * than the viewport — used by `Table` to keep the header/footer fixed while
 * only a page of rows scrolls (never lets the row list grow taller than the
 * terminal and push the header off-screen).
 */
export function computeScrollWindow(selectedIndex: number, total: number, visibleCount: number): { start: number; end: number } {
  if (visibleCount <= 0 || total <= visibleCount) return { start: 0, end: total }
  const half = Math.floor(visibleCount / 2)
  const start = Math.max(0, Math.min(selectedIndex - half, total - visibleCount))
  return { start, end: start + visibleCount }
}

/**
 * Encodes `text` as a minimal RTF document in a monospace font — used by
 * `clipboard.ts` to give a copied table a second, rich-text flavor that
 * keeps its column alignment when pasted into an app that doesn't itself
 * compose in a monospace font (Mail.app, Outlook, Gmail...); a plain
 * terminal paste doesn't need this because the terminal's own font already
 * is monospace. Non-ASCII characters are escaped as RTF's own `\uN?`
 * Unicode escape (decimal, signed 16-bit, with a literal `?` fallback for
 * readers that ignore `\u`) rather than relying on a specific 8-bit code
 * page, so accented text (café, à, é...) round-trips correctly regardless
 * of the reading app's locale.
 */
export function textToRtf(text: string): string {
  const toSigned16 = (n: number) => (n > 0x7fff ? n - 0x10000 : n)
  let body = ''
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (char === '\\' || char === '{' || char === '}') body += `\\${char}`
    else if (char === '\n') body += '\\par\n'
    else if (char === '\r') continue
    else if (char === '\t') body += '\\tab '
    else if (code < 128) body += char
    else if (code <= 0xffff) body += `\\u${toSigned16(code)}?`
    else {
      const high = 0xd800 + ((code - 0x10000) >> 10)
      const low = 0xdc00 + ((code - 0x10000) & 0x3ff)
      body += `\\u${toSigned16(high)}?\\u${toSigned16(low)}?`
    }
  }
  return `{\\rtf1\\ansi\\ansicpg1252\\uc1\\deff0{\\fonttbl{\\f0\\fmodern\\fcharset0 Courier New;}}\\f0\\fs20 ${body}}`
}

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)

/** Wraps already-visible `text` in an OSC 8 terminal hyperlink escape sequence pointing at `url`. */
export function hyperlink(url: string, text: string): string {
  const osc = `${ESC}]8;;`
  return `${osc}${url}${BEL}${text}${osc}${BEL}`
}
