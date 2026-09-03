import { test } from 'node:test'
import assert from 'node:assert/strict'
import { visibleBindings, type KeyBinding } from '../src/ink/hooks/useKeymap.ts'

test('visibleBindings formats special keys and Ctrl+letter combos', () => {
  const bindings: KeyBinding[] = [
    { key: 'return', label: 'edit', onTrigger: () => {} },
    { key: 'delete', label: 'delete', onTrigger: () => {} },
    { ctrl: 'n', label: 'add', onTrigger: () => {} },
    { ctrl: 'y', label: 'copy', onTrigger: () => {} },
    { key: 'escape', label: 'back', onTrigger: () => {} },
  ]
  assert.deepEqual(visibleBindings(bindings), ['↵ edit', 'Del delete', 'Ctrl+N add', 'Ctrl+Y copy', 'Esc back'])
})

test('visibleBindings drops bindings whose `when` is false', () => {
  const bindings: KeyBinding[] = [
    { key: 'return', label: 'edit', when: false, onTrigger: () => {} },
    { ctrl: 'n', label: 'add', when: true, onTrigger: () => {} },
  ]
  assert.deepEqual(visibleBindings(bindings), ['Ctrl+N add'])
})

test('visibleBindings keeps bindings whose `when` is omitted', () => {
  const bindings: KeyBinding[] = [{ ctrl: 'a', label: 'switch context', onTrigger: () => {} }]
  assert.deepEqual(visibleBindings(bindings), ['Ctrl+A switch context'])
})

test('visibleBindings distinguishes Tab from Shift+Tab', () => {
  const bindings: KeyBinding[] = [
    { key: 'tab', label: 'next field', onTrigger: () => {} },
    { key: 'tab', shift: true, label: 'previous field', onTrigger: () => {} },
  ]
  assert.deepEqual(visibleBindings(bindings), ['Tab next field', 'Shift+Tab previous field'])
})
