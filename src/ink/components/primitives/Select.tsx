import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { filterRows } from '../../../cliPure.ts'
import { useTheme } from '../../theme.ts'

export type SelectOption = { label: string; value: string }

export type SelectProps = {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  isDisabled?: boolean
}

/**
 * Maison select: ↑/↓ move the highlighted option, Enter fires `onChange`
 * (ADR-0001). Typing any other character filters the option
 * list live (case-insensitive substring on the label, same filter-always
 * philosophy as `Table`) and jumps the highlight to the first match —
 * Backspace narrows it back.
 */
export function Select({ options, value, onChange, isDisabled = false }: SelectProps) {
  const { color } = useTheme()
  const [filter, setFilter] = useState('')
  const filtered = filterRows(options, filter, (o) => [o.label])
  const initialIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )
  const [highlighted, setHighlighted] = useState(initialIndex)
  const clampedHighlighted = filtered.length === 0 ? -1 : Math.min(highlighted, filtered.length - 1)

  useInput(
    (input, key) => {
      if (key.upArrow) setHighlighted(Math.max(0, clampedHighlighted - 1))
      else if (key.downArrow) setHighlighted(Math.min(filtered.length - 1, clampedHighlighted + 1))
      else if (key.return) {
        const chosen = filtered[clampedHighlighted]
        if (chosen) onChange(chosen.value)
      } else if (key.backspace) {
        setFilter((f) => f.slice(0, -1))
        setHighlighted(0)
      } else if (input && !key.ctrl && !key.meta && !key.tab && !key.escape) {
        setFilter((f) => f + input)
        setHighlighted(0)
      }
    },
    { isActive: !isDisabled },
  )

  if (isDisabled) {
    const current = options.find((o) => o.value === value)
    return <Text dimColor>{current?.label ?? value ?? '(none)'}</Text>
  }

  return (
    <Box flexDirection="column">
      {filter ? <Text dimColor>Filter: {filter}▏</Text> : null}
      {filtered.length === 0 ? (
        <Text dimColor>(no results)</Text>
      ) : (
        filtered.map((option, index) => (
          <Text key={option.value} color={index === clampedHighlighted ? color : undefined} inverse={index === clampedHighlighted}>
            {index === clampedHighlighted ? '❯ ' : '  '}
            {option.label}
          </Text>
        ))
      )}
    </Box>
  )
}
