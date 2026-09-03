import React from 'react'
import { TextInput, type TextInputProps } from './TextInput.tsx'

export type PasswordInputProps = Omit<TextInputProps, 'mask'>

/** Same as `TextInput`, masked — in the same form as any other field, not a separate screen. */
export function PasswordInput(props: PasswordInputProps) {
  return <TextInput {...props} mask />
}
