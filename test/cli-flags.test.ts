import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertNotConflictingFlags } from '../src/cliPure.ts'
import { ValidationError } from '../src/errors.ts'

test('--yes and --dry-run together throw an explicit ValidationError', () => {
  assert.throws(() => assertNotConflictingFlags(true, true), (error: unknown) => {
    assert.ok(error instanceof ValidationError)
    assert.match(error.message, /mutually exclusive/)
    return true
  })
})

test('--yes alone, --dry-run alone, or neither throw nothing', () => {
  assert.doesNotThrow(() => assertNotConflictingFlags(true, false))
  assert.doesNotThrow(() => assertNotConflictingFlags(false, true))
  assert.doesNotThrow(() => assertNotConflictingFlags(false, false))
})
