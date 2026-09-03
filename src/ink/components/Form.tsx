import React, { useState } from 'react'
import { Box, Text } from 'ink'
import { useKeymap } from '../hooks/useKeymap.ts'
import { TextInput } from './primitives/TextInput.tsx'
import { PasswordInput } from './primitives/PasswordInput.tsx'
import { Select, type SelectOption } from './primitives/Select.tsx'
import { nextActiveIndex } from './formNav.ts'
import { useTheme } from '../theme.ts'

export { nextActiveIndex } from './formNav.ts'

export type FormField = {
  name: string
  label: string
  kind: 'text' | 'password' | 'select'
  options?: SelectOption[]
  value: string
  onChange: (value: string) => void
}

export type FormProps = {
  fields: FormField[]
  /** Called once the last field is validated (Enter on the last field, or Ctrl+S). */
  onSubmit: () => void
}

/**
 * Maison multi-field form (ADR-0001): all fields shown at once,
 * only the field at `activeIndex` listens to the keyboard
 * (`isDisabled={index !== activeIndex}`). Enter on a field advances to the
 * next one, or submits the form if it is the last field. Tab/Shift+Tab
 * navigate freely without validating anything. Escape is handled by the
 * parent `Panel`, never here.
 */
export function Form({ fields, onSubmit }: FormProps) {
  const { color } = useTheme()
  const [activeIndex, setActiveIndex] = useState(0)

  const advance = (delta: number) => setActiveIndex((i) => nextActiveIndex(i, fields.length, delta))

  const handleFieldSubmit = (index: number) => {
    if (index === fields.length - 1) onSubmit()
    else advance(1)
  }

  // Up/Down also move focus between fields, like Tab/Shift+Tab — except when
  // the active field is a `Select`, which already uses Up/Down to move its
  // own highlighted option (never both at once, so the two never fight).
  const activeIsSelect = fields[activeIndex]?.kind === 'select'
  const { bindings } = useKeymap([
    { key: 'tab', label: 'next field', onTrigger: () => advance(1) },
    { key: 'tab', shift: true, label: 'previous field', onTrigger: () => advance(-1) },
    { key: 'downArrow', label: 'next field', when: !activeIsSelect, onTrigger: () => advance(1) },
    { key: 'upArrow', label: 'previous field', when: !activeIsSelect, onTrigger: () => advance(-1) },
  ])

  return (
    <Box flexDirection="column">
      {fields.map((field, index) => {
        const isActive = index === activeIndex
        return (
          <Box key={field.name}>
            <Box width={16}>
              <Text bold={isActive} color={isActive ? color : undefined}>
                {field.label}
              </Text>
            </Box>
            {field.kind === 'select' ? (
              <Select
                options={field.options ?? []}
                value={field.value}
                onChange={(v) => {
                  field.onChange(v)
                  handleFieldSubmit(index)
                }}
                isDisabled={!isActive}
              />
            ) : field.kind === 'password' ? (
              <PasswordInput value={field.value} onChange={field.onChange} onSubmit={() => handleFieldSubmit(index)} isDisabled={!isActive} />
            ) : (
              <TextInput value={field.value} onChange={field.onChange} onSubmit={() => handleFieldSubmit(index)} isDisabled={!isActive} />
            )}
          </Box>
        )
      })}
      <Box marginTop={1}>
        <Text dimColor>{bindings.join(' · ')} · ↵ confirm field (last field = submit form)</Text>
      </Box>
    </Box>
  )
}
