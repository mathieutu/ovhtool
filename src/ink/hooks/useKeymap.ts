import { useInput, type Key } from 'ink'

// A single keyboard binding. Never a bare printable letter (ADR-0006):
// either a special key (`key`) or a Ctrl+letter combo (`ctrl`).
export type KeyBinding = {
  key?: 'return' | 'delete' | 'escape' | 'tab' | 'upArrow' | 'downArrow' | 'leftArrow' | 'rightArrow'
  /** Only meaningful together with `key: 'tab'`, to distinguish Tab from Shift+Tab. */
  shift?: boolean
  /** Single letter, e.g. 'n' for Ctrl+N. */
  ctrl?: string
  label: string
  /** Binding is active (and shown in the help bar) only when this is true or omitted. */
  when?: boolean
  onTrigger: () => void
}

function keyHint(binding: KeyBinding): string {
  if (binding.ctrl) return `Ctrl+${binding.ctrl.toUpperCase()}`
  switch (binding.key) {
    case 'return':
      return '↵'
    case 'delete':
      return 'Del'
    case 'escape':
      return 'Esc'
    case 'tab':
      return binding.shift ? 'Shift+Tab' : 'Tab'
    case 'upArrow':
      return '↑'
    case 'downArrow':
      return '↓'
    case 'leftArrow':
      return '←'
    case 'rightArrow':
      return '→'
    default:
      return ''
  }
}

/**
 * Pure projection of a bindings list to the strings the `Footer` displays,
 * keeping only bindings whose `when` is true or omitted. Extracted so it can
 * be unit-tested without mounting any Ink component (ADR-0006).
 */
export function visibleBindings(bindings: KeyBinding[]): string[] {
  return bindings.filter((binding) => binding.when === undefined || binding.when).map((binding) => `${keyHint(binding)} ${binding.label}`)
}

function matches(binding: KeyBinding, input: string, key: Key): boolean {
  if (binding.ctrl) {
    return key.ctrl && input.toLowerCase() === binding.ctrl.toLowerCase()
  }
  switch (binding.key) {
    case 'return':
      return key.return
    case 'delete':
      return key.delete
    case 'escape':
      return key.escape
    case 'tab':
      return key.tab && Boolean(key.shift) === Boolean(binding.shift)
    case 'upArrow':
      return key.upArrow
    case 'downArrow':
      return key.downArrow
    case 'leftArrow':
      return key.leftArrow
    case 'rightArrow':
      return key.rightArrow
    default:
      return false
  }
}

/**
 * Single source of truth for keyboard handling + help bar (ADR-0006):
 * declare bindings once, `useKeymap` wires them to Ink's `useInput` and
 * returns the same list already projected to help-bar strings.
 */
export function useKeymap(bindings: KeyBinding[], options?: { isActive?: boolean }): { bindings: string[] } {
  useInput(
    (input, key) => {
      for (const binding of bindings) {
        if (binding.when === false) continue
        if (matches(binding, input, key)) {
          binding.onTrigger()
          return
        }
      }
    },
    { isActive: options?.isActive ?? true },
  )
  return { bindings: visibleBindings(bindings) }
}
