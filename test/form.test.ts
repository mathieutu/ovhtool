import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextActiveIndex } from '../src/ink/components/formNav.ts'

test('nextActiveIndex advances by delta within bounds', () => {
  assert.equal(nextActiveIndex(0, 4, 1), 1)
  assert.equal(nextActiveIndex(1, 4, 1), 2)
  assert.equal(nextActiveIndex(0, 4, -1), 0)
})

test('nextActiveIndex clamps at the last field (Tab past the end)', () => {
  assert.equal(nextActiveIndex(3, 4, 1), 3)
})

test('nextActiveIndex clamps at the first field (Shift+Tab before the start)', () => {
  assert.equal(nextActiveIndex(0, 4, -1), 0)
})

test('nextActiveIndex handles a single-field form', () => {
  assert.equal(nextActiveIndex(0, 1, 1), 0)
  assert.equal(nextActiveIndex(0, 1, -1), 0)
})

test('nextActiveIndex returns 0 for an empty field list', () => {
  assert.equal(nextActiveIndex(0, 0, 1), 0)
})
