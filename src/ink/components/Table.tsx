import React, { useEffect, useState } from 'react'
import { Box, Text, useInput, useStdout } from 'ink'
import { fitColumnWidths, truncatePad, computeScrollWindow, hyperlink, visibleRows } from '../../cliPure.ts'
import { TextInput } from './primitives/TextInput.tsx'
import { useTheme } from '../theme.ts'

export type TableColumn<T> = {
  header: string
  render: (item: T) => string
  /** Fixed character width, or `null` to share the remaining terminal width (long free-text columns truncate instead of overflowing). At most one column should be `null`. */
  width: number | null
  /** Optional: makes the cell a clickable terminal hyperlink pointing at this URL. */
  href?: (item: T) => string
}

/**
 * The exact filter+sort transformation `Table` applies before rendering (the
 * pure logic lives in `cliPure.ts`'s `visibleRows`, tested natively without
 * mounting Ink). Exported so a screen's own "what row is currently
 * selected"/"copy this to the clipboard" logic can reuse the *same* order
 * `Table` renders — computing it separately (e.g. filtering without
 * sorting) would desync `selectedIndex` from the row actually highlighted
 * on screen.
 */
export function visibleTableRows<T>(rows: T[], columns: TableColumn<T>[], filter: string, searchFields: (item: T) => (string | number)[]): T[] {
  return visibleRows(rows, filter, searchFields, columns[1]?.render)
}

export type TableProps<T> = {
  columns: TableColumn<T>[]
  rows: T[]
  searchFields: (item: T) => (string | number)[]
  filter: string
  onFilterChange: (filter: string) => void
  selectedIndex: number
  onSelectedIndexChange: (index: number) => void
  emptyLabel?: string
  isActive?: boolean
  /** Overrides the auto-computed (terminal-height-based) row budget — for a screen stacking more than one `Table` (e.g. `accounts`), where each only gets a share of the terminal. */
  maxVisibleRows?: number
}

/**
 * Extra terminal rows already spent outside the data rows: the parent
 * screen's `Header` (3: top border, content, bottom border), this
 * component's own filter + blank margin + column-header lines (3), the
 * parent's `Footer` (2: its worst case, a status/revalidating line above the
 * binding hints — budgeting for the common 1-line case instead would make
 * the whole fixed-height frame overflow by a row the moment that second line
 * appears, which is exactly what a background revalidation's spinner did:
 * a visible "jump" instead of a readable indicator), and the scroll-position
 * indicator line (`12-27 / 340`) that appears once the list needs to scroll.
 * Tuned to exactly this budget rather than padded "to be safe": an
 * over-generous reserve quietly wastes a row of screen space on every single
 * table, permanently.
 */
const RESERVED_ROWS = 3 + 3 + 2 + 1
const MIN_VISIBLE_ROWS = 3

export function useTerminalSize(): { rows: number; columns: number } {
  const { stdout } = useStdout()
  const [size, setSize] = useState({ rows: stdout.rows || 24, columns: stdout.columns || 100 })

  useEffect(() => {
    const onResize = () => setSize({ rows: stdout.rows || 24, columns: stdout.columns || 100 })
    stdout.on('resize', onResize)
    return () => {
      stdout.off('resize', onResize)
    }
  }, [stdout])

  return size
}

/**
 * Data-browser table (ADR-0005, ADR-0006): the
 * filter `TextInput` stays mounted and active at all times (never disabled),
 * while a second, independent `useInput` handles ↑/↓ and Enter — the two
 * never fight over a key. Columns are aligned to fixed/flex widths
 * (`fitColumnWidths`/`truncatePad`) and only a page of rows around the
 * selection is rendered (`computeScrollWindow`), so a long list scrolls
 * within the table instead of growing past the terminal height and pushing
 * the parent's Header/Footer off-screen.
 */
export function Table<T>({ columns, rows, searchFields, filter, onFilterChange, selectedIndex, onSelectedIndexChange, emptyLabel = '(empty)', isActive = true, maxVisibleRows }: TableProps<T>) {
  const { color } = useTheme()
  const { rows: terminalRows, columns: terminalColumns } = useTerminalSize()
  const filtered = visibleTableRows(rows, columns, filter, searchFields)
  const clampedIndex = filtered.length === 0 ? -1 : Math.min(selectedIndex, filtered.length - 1)

  useInput(
    (_input, key) => {
      if (key.upArrow) onSelectedIndexChange(Math.max(0, clampedIndex - 1))
      else if (key.downArrow) onSelectedIndexChange(Math.min(filtered.length - 1, clampedIndex + 1))
    },
    { isActive },
  )

  const widths = fitColumnWidths(
    columns.map((c) => c.width),
    terminalColumns,
  )
  const visibleRowCount = Math.max(maxVisibleRows ?? terminalRows - RESERVED_ROWS, MIN_VISIBLE_ROWS)
  const { start, end } = computeScrollWindow(Math.max(clampedIndex, 0), filtered.length, visibleRowCount)
  const visible = filtered.slice(start, end)

  const headerLine = columns.map((c, i) => truncatePad(c.header, widths[i]!)).join('  ')
  const dataLine = (item: T) =>
    columns
      .map((c, i) => {
        const padded = truncatePad(c.render(item), widths[i]!)
        return c.href ? hyperlink(c.href(item), padded) : padded
      })
      .join('  ')

  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>Filter: </Text>
        <TextInput value={filter} onChange={onFilterChange} isDisabled={!isActive} placeholder="(type to filter)" />
      </Box>
      <Box marginTop={1}>
        <Text bold>{headerLine}</Text>
      </Box>
      {filtered.length === 0 ? (
        <Text dimColor>{emptyLabel}</Text>
      ) : (
        visible.map((item, i) => {
          const index = start + i
          return (
            <Text key={index} color={index === clampedIndex ? color : undefined} inverse={index === clampedIndex}>
              {dataLine(item)}
            </Text>
          )
        })
      )}
      {filtered.length > visibleRowCount ? (
        <Text dimColor>
          {start + 1}-{end} / {filtered.length}
        </Text>
      ) : null}
    </Box>
  )
}

export function useTableSelection(initialFilter = '') {
  const [filter, setFilter] = useState(initialFilter)
  const [selectedIndex, setSelectedIndex] = useState(0)
  return { filter, setFilter, selectedIndex, setSelectedIndex }
}
