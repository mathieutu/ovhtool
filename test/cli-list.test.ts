import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterRows, toMarkdownTable, fitColumnWidths, truncatePad, computeScrollWindow, sortRowsByColumn, visibleRows, stripDomainSuffix, stripEmailDomain, ensureEmailDomain, isPlausibleDomain, applyPendingOverrides, naturalColumnWidth } from '../src/cliPure.ts'

type Row = { name: string; email: string }

const rows: Row[] = [
  { name: 'contact', email: 'contact@bar.fr' },
  { name: 'admin', email: 'admin@bar.fr' },
  { name: 'billing', email: 'billing@client-x.fr' },
]

test('filterRows returns every row when no search term is given', () => {
  assert.deepEqual(filterRows(rows, undefined, (r) => [r.name, r.email]), rows)
  assert.deepEqual(filterRows(rows, '', (r) => [r.name, r.email]), rows)
})

test('filterRows matches case-insensitively across any searched field', () => {
  assert.deepEqual(
    filterRows(rows, 'CLIENT-X', (r) => [r.name, r.email]).map((r) => r.name),
    ['billing'],
  )
  assert.deepEqual(
    filterRows(rows, 'admin', (r) => [r.name, r.email]).map((r) => r.name),
    ['admin'],
  )
})

test('filterRows returns an empty array when nothing matches', () => {
  assert.deepEqual(filterRows(rows, 'nope', (r) => [r.name, r.email]), [])
})

test('toMarkdownTable pads every column to its widest cell, header included', () => {
  const table = toMarkdownTable(
    ['id', 'name'],
    [
      ['1', 'ab'],
      ['22', 'abcde'],
    ],
  )
  // col widths: max(3, 'id'/'1'/'22') = 3 ; max(3, 'name'/'ab'/'abcde') = 5
  const expected = [
    `| ${'id'.padEnd(3)} | ${'name'.padEnd(5)} |`,
    `| ${'-'.repeat(3)} | ${'-'.repeat(5)} |`,
    `| ${'1'.padEnd(3)} | ${'ab'.padEnd(5)} |`,
    `| ${'22'.padEnd(3)} | ${'abcde'.padEnd(5)} |`,
  ].join('\n')
  assert.equal(table, expected)
})

test('toMarkdownTable never uses fewer than 3 dashes in the separator, even for narrow columns', () => {
  const table = toMarkdownTable(['a'], [['x']])
  assert.equal(table, ['| a   |', '| --- |', '| x   |'].join('\n'))
})

test('toMarkdownTable escapes pipes and strips newlines within cell values', () => {
  const table = toMarkdownTable(['field'], [['a|b\nc']])
  const width = Math.max(3, 'field'.length, 'a\\|b c'.length)
  const expected = [`| ${'field'.padEnd(width)} |`, `| ${'-'.repeat(width)} |`, `| ${'a\\|b c'.padEnd(width)} |`].join('\n')
  assert.equal(table, expected)
})

test('fitColumnWidths keeps fixed widths and shares the rest evenly across null (flex) columns', () => {
  // availableWidth 100, two fixed columns (10 + 20 = 30), one separator (2) between each of the 3 columns (4 total)
  assert.deepEqual(fitColumnWidths([10, null, 20], 100), [10, 100 - 30 - 4, 20])
})

test('fitColumnWidths shares flex width evenly across several flex columns', () => {
  // availableWidth 44, one separator (2) between the two columns => remaining 42, split evenly
  assert.deepEqual(fitColumnWidths([null, null], 44), [21, 21])
})

test('fitColumnWidths never lets flex columns go below a 20-char floor even on a narrow terminal', () => {
  assert.deepEqual(fitColumnWidths([50, null], 40), [50, 20])
})

test('fitColumnWidths with only fixed columns ignores availableWidth', () => {
  assert.deepEqual(fitColumnWidths([5, 10], 1000), [5, 10])
})

test('naturalColumnWidth is the longest of the header and every value', () => {
  assert.equal(naturalColumnWidth('id', ['1', '204070', '42']), 6)
  assert.equal(naturalColumnWidth('exercice_debut_date', ['2015-04-26']), 'exercice_debut_date'.length)
})

test('naturalColumnWidth handles an empty value list (falls back to the header length)', () => {
  assert.equal(naturalColumnWidth('name', []), 4)
})

test('truncatePad pads short text with trailing spaces to the exact width', () => {
  assert.equal(truncatePad('ab', 5), 'ab   ')
  assert.equal(truncatePad('ab', 5).length, 5)
})

test('truncatePad truncates long text with an ellipsis and keeps the exact width', () => {
  assert.equal(truncatePad('abcdefgh', 5), 'abcd…')
  assert.equal(truncatePad('abcdefgh', 5).length, 5)
})

test('truncatePad returns an empty string for a non-positive width', () => {
  assert.equal(truncatePad('abc', 0), '')
  assert.equal(truncatePad('abc', -3), '')
})

test('computeScrollWindow shows everything when the list already fits the viewport', () => {
  assert.deepEqual(computeScrollWindow(0, 5, 10), { start: 0, end: 5 })
  assert.deepEqual(computeScrollWindow(4, 5, 5), { start: 0, end: 5 })
})

test('computeScrollWindow centers the window on the selected row once the list overflows', () => {
  assert.deepEqual(computeScrollWindow(50, 100, 10), { start: 45, end: 55 })
})

test('computeScrollWindow clamps the window at the start and end of the list', () => {
  assert.deepEqual(computeScrollWindow(0, 100, 10), { start: 0, end: 10 })
  assert.deepEqual(computeScrollWindow(99, 100, 10), { start: 90, end: 100 })
})

test('sortRowsByColumn sorts alphabetically by the given column value', () => {
  const sorted = sortRowsByColumn(rows, [(r) => r.email])
  assert.deepEqual(
    sorted.map((r) => r.email),
    ['admin@bar.fr', 'billing@client-x.fr', 'contact@bar.fr'],
  )
})

test('sortRowsByColumn does not mutate the original array', () => {
  const original = [...rows]
  sortRowsByColumn(rows, [(r) => r.email])
  assert.deepEqual(rows, original)
})

test('applyPendingOverrides drops a row marked "deleted" even if the fetch still lists it', () => {
  const fresh = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }]
  const pending = new Map([[1, 'deleted' as const]])
  assert.deepEqual(applyPendingOverrides(fresh, pending, (r) => r.id), [{ id: 2, name: 'b' }])
})

test('applyPendingOverrides replaces a row with its known-correct value even if the fetch still lists the stale one', () => {
  const fresh = [{ id: 1, name: 'stale' }]
  const pending = new Map([[1, { id: 1, name: 'fresh' }]])
  assert.deepEqual(applyPendingOverrides(fresh, pending, (r) => r.id), [{ id: 1, name: 'fresh' }])
})

test('applyPendingOverrides appends a known-added row the fetch has not picked up yet', () => {
  const fresh = [{ id: 1, name: 'a' }]
  const pending = new Map([[2, { id: 2, name: 'b' }]])
  assert.deepEqual(applyPendingOverrides(fresh, pending, (r) => r.id), [{ id: 1, name: 'a' }, { id: 2, name: 'b' }])
})

test('applyPendingOverrides leaves rows untouched once the fetch reflects a pending change', () => {
  const fresh = [{ id: 1, name: 'fresh' }]
  const pending = new Map([[1, { id: 1, name: 'fresh' }]])
  assert.deepEqual(applyPendingOverrides(fresh, pending, (r) => r.id), [{ id: 1, name: 'fresh' }])
})

test('applyPendingOverrides is a no-op with an empty pending map', () => {
  assert.deepEqual(applyPendingOverrides(rows, new Map(), (r) => r.email), rows)
})

test('sortRowsByColumn breaks ties on the primary column using the next column(s), instead of leaving them in API response order', () => {
  const withTies = [
    { from: 'contact@bar.fr', to: 'zzz@bar.fr' },
    { from: 'contact@bar.fr', to: 'aaa@bar.fr' },
    { from: 'admin@bar.fr', to: 'mmm@bar.fr' },
  ]
  const sorted = sortRowsByColumn(withTies, [(r) => r.from, (r) => r.to])
  assert.deepEqual(
    sorted.map((r) => `${r.from}|${r.to}`),
    ['admin@bar.fr|mmm@bar.fr', 'contact@bar.fr|aaa@bar.fr', 'contact@bar.fr|zzz@bar.fr'],
  )
})

test('sortRowsByColumn is stable when every column is tied', () => {
  const withTies = [
    { name: 'first', email: 'same@bar.fr' },
    { name: 'second', email: 'same@bar.fr' },
    { name: 'third', email: 'same@bar.fr' },
  ]
  const sorted = sortRowsByColumn(withTies, [(r) => r.email])
  assert.deepEqual(
    sorted.map((r) => r.name),
    ['first', 'second', 'third'],
  )
})

test('visibleRows filters then sorts by the given keys, matching what a Table renders', () => {
  const result = visibleRows(rows, undefined, (r) => [r.name, r.email], [(r) => r.email])
  assert.deepEqual(
    result.map((r) => r.name),
    ['admin', 'billing', 'contact'],
  )
})

test('visibleRows without sortKeys only filters, preserving original order (same as Table with a single column)', () => {
  const result = visibleRows(rows, undefined, (r) => [r.name, r.email])
  assert.deepEqual(result, rows)
})

test('visibleRows applies the filter before sorting (a row excluded by the filter never resurfaces via sort)', () => {
  const result = visibleRows(rows, 'bar.fr', (r) => [r.name, r.email], [(r) => r.email])
  assert.deepEqual(
    result.map((r) => r.name),
    ['admin', 'contact'],
  )
})

test('visibleRows: a caller building `selected = result[index]` must get the exact row shown at that position — regression test for the DNS table bug where selecting the 2nd displayed (sorted) row resolved to the 2nd row of the unsorted list instead', () => {
  const items = [
    { account: 'perso', domain: 'comera-sarl.fr' },
    { account: 'ffs', domain: 'ecole-francaise-de-speleologie.com' },
    { account: 'ffs', domain: 'ffcanyon.fr' },
  ]
  const result = visibleRows(items, undefined, (i) => [i.account, i.domain], [(i) => i.domain])
  // Sorted by domain: comera-sarl.fr, ecole-francaise-de-speleologie.com, ffcanyon.fr
  assert.deepEqual(
    result.map((i) => i.domain),
    ['comera-sarl.fr', 'ecole-francaise-de-speleologie.com', 'ffcanyon.fr'],
  )
  // Picking the 2nd row on screen (index 1) must resolve to ecole-francaise's ffs entry, not perso's.
  assert.equal(result[1]?.account, 'ffs')
  assert.equal(result[1]?.domain, 'ecole-francaise-de-speleologie.com')
})

test('stripDomainSuffix leaves a bare local part untouched', () => {
  assert.equal(stripDomainSuffix('www', 'example.com'), 'www')
})

test('stripDomainSuffix strips a trailing ".domain" the user accidentally typed', () => {
  assert.equal(stripDomainSuffix('www.example.com', 'example.com'), 'www')
})

test('stripDomainSuffix collapses the bare domain to the zone root', () => {
  assert.equal(stripDomainSuffix('example.com', 'example.com'), '')
})

test('stripDomainSuffix does not strip an unrelated domain suffix', () => {
  assert.equal(stripDomainSuffix('www.other.com', 'example.com'), 'www.other.com')
})

test('stripEmailDomain leaves a bare local part untouched', () => {
  assert.equal(stripEmailDomain('contact', 'example.com'), 'contact')
})

test('stripEmailDomain strips a trailing "@domain" the user accidentally typed', () => {
  assert.equal(stripEmailDomain('contact@example.com', 'example.com'), 'contact')
})

test('stripEmailDomain does not strip an unrelated email domain', () => {
  assert.equal(stripEmailDomain('contact@other.com', 'example.com'), 'contact@other.com')
})

test('ensureEmailDomain appends "@domain" to a bare local part', () => {
  assert.equal(ensureEmailDomain('contact', 'example.com'), 'contact@example.com')
})

test('ensureEmailDomain leaves a full address untouched', () => {
  assert.equal(ensureEmailDomain('contact@other.com', 'example.com'), 'contact@other.com')
})

test('isPlausibleDomain accepts a dotted domain', () => {
  assert.equal(isPlausibleDomain('example.com'), true)
  assert.equal(isPlausibleDomain('www.example.co.uk'), true)
})

test('isPlausibleDomain rejects a bare word (likely a mistyped subcommand)', () => {
  assert.equal(isPlausibleDomain('redirections'), false)
  assert.equal(isPlausibleDomain('dns'), false)
})
