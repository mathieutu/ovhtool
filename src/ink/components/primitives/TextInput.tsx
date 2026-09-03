import React from 'react'
import { Box, Text, useInput } from 'ink'
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
 * Maison text input (ADR-0001): only reacts to printable
 * characters and Backspace, plus Enter when `onSubmit` is given. Never
 * consumes Delete (reserved globally for row deletion), arrows, Tab or
 * Ctrl+letter combos, so it can stay mounted permanently (e.g. as the
 * `Table` filter, ADR-0006) alongside
 * other `useInput` consumers without stealing their keys.
 */
export function TextInput({ value, onChange, onSubmit, isDisabled = false, placeholder = '', mask = false }: TextInputProps) {
  const { color } = useTheme()
  useInput(
    (input, key) => {
      if (key.return) {
        onSubmit?.()
        return
      }
      if (key.backspace) {
        onChange(value.slice(0, -1))
        return
      }
      // Delete is reserved globally for row deletion (ADR-0006):
      // never consumed here, only Backspace edits the field.
      if (key.delete || key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow || key.escape) {
        return
      }
      if (input) onChange(value + input)
    },
    { isActive: !isDisabled },
  )

  const shown = mask ? '•'.repeat(value.length) : value
  const cursor = isDisabled ? '' : '▏'

  if (!value && placeholder) {
    return (
      <Text dimColor={isDisabled}>
        {isDisabled ? placeholder : (
          <>
            <Text color={color}>{placeholder}</Text>
            {cursor}
          </>
        )}
      </Text>
    )
  }

  return (
    <Box>
      <Text dimColor={isDisabled}>
        {shown}
        {cursor}
      </Text>
    </Box>
  )
}
