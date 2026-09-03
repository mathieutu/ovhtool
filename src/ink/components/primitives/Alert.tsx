import React from 'react'
import { Box, Text } from 'ink'

export type AlertProps = {
  message: string
  variant?: 'error' | 'info' | 'success'
}

/** Inline error/status banner: never ejects the user from their current context. */
export function Alert({ message, variant = 'error' }: AlertProps) {
  const color = variant === 'error' ? 'red' : variant === 'success' ? 'green' : 'yellow'
  const prefix = variant === 'error' ? '✖' : variant === 'success' ? '✔' : 'ℹ'
  return (
    <Box>
      <Text color={color}>
        {prefix} {message}
      </Text>
    </Box>
  )
}
