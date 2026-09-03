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

/** Sorts `rows` alphabetically by `columnValue(item)` (stable, case-sensitive `localeCompare`) — used to give every `Table` a predictable default order (its second column) regardless of API response order. */
export function sortRowsByColumn<T>(rows: T[], columnValue: (item: T) => string): T[] {
  return [...rows].sort((a, b) => columnValue(a).localeCompare(columnValue(b)))
}

/**
 * The exact filter+sort transformation a `Table` applies before rendering:
 * case-insensitive substring filter, then (if `sortKey` is given — a
 * `Table`'s second column) an alphabetical sort. A screen's own "what row is
 * selected"/"copy this to the clipboard" logic must reuse this *same*
 * function (with the same `sortKey`) rather than filtering separately —
 * otherwise `selectedIndex` (which indexes the row order the user actually
 * sees on screen) would desync from the unsorted list and resolve to the
 * wrong row.
 */
export function visibleRows<T>(rows: T[], filter: string | undefined, searchFields: (item: T) => (string | number)[], sortKey?: (item: T) => string): T[] {
  const filtered = filterRows(rows, filter, searchFields)
  return sortKey ? sortRowsByColumn(filtered, sortKey) : filtered
}

/** Full domain name for a record (e.g. "www.example.com", or "example.com" for the root). */
export function fullDomain(zone: string, subDomain: string): string {
  return subDomain && subDomain !== '@' ? `${subDomain}.${zone}` : zone
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

const ESC = String.fromCharCode(27)
const BEL = String.fromCharCode(7)

/** Wraps already-visible `text` in an OSC 8 terminal hyperlink escape sequence pointing at `url`. */
export function hyperlink(url: string, text: string): string {
  const osc = `${ESC}]8;;`
  return `${osc}${url}${BEL}${text}${osc}${BEL}`
}
