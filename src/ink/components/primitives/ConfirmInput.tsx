import React from 'react'
import { Text, useInput } from 'ink'

export type ConfirmInputProps = {
  onConfirm: () => void
  onCancel: () => void
  isDisabled?: boolean
}

/**
 * y/N confirmation, default stays "no" (ADR-0003): only an explicit `y`
 * confirms, `n` cancels explicitly. Escape (handled by the parent `Panel`)
 * also cancels, so Enter alone never applies anything.
 */
export function ConfirmInput({ onConfirm, onCancel, isDisabled = false }: ConfirmInputProps) {
  useInput(
    (input) => {
      const lower = input.toLowerCase()
      if (lower === 'y') onConfirm()
      else if (lower === 'n') onCancel()
    },
    { isActive: !isDisabled },
  )

  return <Text>Confirm? (y/N)</Text>
}
