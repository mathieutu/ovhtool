import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { wordBoundaryBefore, wordBoundaryAfter } from '../../../cliPure.ts'
import { useTheme } from '../../theme.ts'

export type TextInputProps = {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  isDisabled?: boolean
  placeholder?: string
  mask?: boolean
}

/**
 * Maison text input (ADR-0001), edited at a real cursor position rather than
 * always appending at the end — the same navigation any terminal line editor
 * (bash/zsh's readline) already gives for free, not a bespoke scheme: ←/→
 * move the cursor one character, Option/Alt+←/→ jump a whole word (a
 * terminal encodes that either as an arrow with the Alt modifier or as the
 * classic Esc+b/Esc+f, so both are handled), Home/End jump to the line's
 * edges. Still only reacts to printable characters, Backspace, these
 * navigation keys, and Enter when `onSubmit` is given — never Delete
 * (reserved globally for row deletion), Tab, ↑/↓ or Ctrl+letter combos, so
 * it can stay mounted permanently (e.g. as the `Table` filter, ADR-0006)
 * alongside other `useInput` consumers without stealing their keys.
 */
export function TextInput({ value, onChange, onSubmit, isDisabled = false, placeholder = '', mask = false }: TextInputProps) {
  const { color } = useTheme()
  const [cursor, setCursor] = useState(value.length)
  const at = Math.min(cursor, value.length)

  useInput(
    (input, key) => {
      if (key.return) {
        onSubmit?.()
        return
      }
      if ((key.leftArrow && key.meta) || (key.meta && input === 'b')) {
        setCursor(wordBoundaryBefore(value, at))
        return
      }
      if ((key.rightArrow && key.meta) || (key.meta && input === 'f')) {
        setCursor(wordBoundaryAfter(value, at))
        return
      }
      if (key.leftArrow) {
        setCursor(Math.max(0, at - 1))
        return
      }
      if (key.rightArrow) {
        setCursor(Math.min(value.length, at + 1))
        return
      }
      if (key.home) {
        setCursor(0)
        return
      }
      if (key.end) {
        setCursor(value.length)
        return
      }
      if (key.backspace) {
        if (at === 0) return
        onChange(value.slice(0, at - 1) + value.slice(at))
        setCursor(at - 1)
        return
      }
      // Delete is reserved globally for row deletion (ADR-0006):
      // never consumed here, only Backspace edits the field.
      if (key.delete || key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow || key.escape) {
        return
      }
      if (input) {
        onChange(value.slice(0, at) + input + value.slice(at))
        setCursor(at + input.length)
      }
    },
    { isActive: !isDisabled },
  )

  if (!value && placeholder) {
    return (
      <Text dimColor={isDisabled}>
        {isDisabled ? placeholder : (
          <>
            <Text color={color}>{placeholder}</Text>
            {'▏'}
          </>
        )}
      </Text>
    )
  }

  const shown = mask ? '•'.repeat(value.length) : value
  const before = shown.slice(0, at)
  const atChar = shown.slice(at, at + 1)
  const after = shown.slice(at + 1)

  return (
    <Box>
      <Text dimColor={isDisabled}>
        {before}
        {isDisabled ? atChar : <Text inverse>{atChar || ' '}</Text>}
        {after}
      </Text>
    </Box>
  )
}
