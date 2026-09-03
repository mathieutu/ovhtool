import React from 'react'
import { Box, Text } from 'ink'

export type FooterProps = {
  bindings: string[]
  status?: string
}

/**
 * Fixed help bar (ADR-0006): only the bindings actually active
 * on the current screen, plus a transient status message after an action.
 */
export function Footer({ bindings, status }: FooterProps) {
  return (
    <Box flexDirection="column" paddingX={1}>
      {status ? <Text color="green">{status}</Text> : null}
      {/* truncate-middle, not -end: the last binding is always "Esc back" (the one universal, most-relied-on hint) — losing it to truncation would be worse than losing one of the less critical bindings in the middle. */}
      <Text dimColor wrap="truncate-middle">{bindings.join(' · ')}</Text>
    </Box>
  )
}
