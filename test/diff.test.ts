import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffCreate, diffDelete, diffUpdate, isNoop, formatDiffLines } from '../src/diff.ts'

test('diffCreate exposes every field as "after"', () => {
  const diff = diffCreate({ subDomain: 'www', ttl: 3600 })
  assert.equal(diff.action, 'create')
  assert.deepEqual(diff.changes, [
    { field: 'subDomain', before: undefined, after: 'www' },
    { field: 'ttl', before: undefined, after: 3600 },
  ])
})

test('diffDelete exposes every field as "before"', () => {
  const diff = diffDelete({ subDomain: 'www', ttl: 3600 })
  assert.equal(diff.action, 'delete')
  assert.deepEqual(diff.changes, [
    { field: 'subDomain', before: 'www', after: undefined },
    { field: 'ttl', before: 3600, after: undefined },
  ])
})

test('diffUpdate only keeps fields that actually changed', () => {
  const diff = diffUpdate({ subDomain: 'www', target: '1.2.3.4', ttl: 3600 }, { subDomain: 'www', target: '5.6.7.8', ttl: 3600 })
  assert.equal(diff.action, 'update')
  assert.deepEqual(diff.changes, [{ field: 'target', before: '1.2.3.4', after: '5.6.7.8' }])
})

test('diffUpdate compares values by structural equality (objects/arrays)', () => {
  const diff = diffUpdate({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })
  assert.deepEqual(diff.changes, [])
})

test('isNoop is true only for an update with no change', () => {
  assert.equal(isNoop(diffUpdate({ a: 1 }, { a: 1 })), true)
  assert.equal(isNoop(diffUpdate({ a: 1 }, { a: 2 })), false)
  assert.equal(isNoop(diffCreate({ a: 1 })), false)
  assert.equal(isNoop(diffDelete({ a: 1 })), false)
})

test('formatDiffLines produces readable lines per action', () => {
  assert.deepEqual(formatDiffLines(diffCreate({ target: '1.2.3.4' })), ['+ target: 1.2.3.4'])
  assert.deepEqual(formatDiffLines(diffDelete({ target: '1.2.3.4' })), ['- target: 1.2.3.4'])
  assert.deepEqual(formatDiffLines(diffUpdate({ target: '1.2.3.4' }, { target: '5.6.7.8' })), ['~ target: 1.2.3.4 → 5.6.7.8'])
})

test('formatDiffLines shows ∅ for null/undefined values', () => {
  assert.deepEqual(formatDiffLines(diffUpdate({ ttl: 3600 }, { ttl: undefined })), ['~ ttl: 3600 → ∅'])
})
