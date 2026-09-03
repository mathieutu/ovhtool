import React from 'react'
import { Box, Text } from 'ink'
import { Spinner } from './primitives/Spinner.tsx'

export type FooterProps = {
  bindings: string[]
  status?: string
  /** Shows a small inline spinner instead of a status line — for a background revalidation (`useAsyncData`'s `revalidating`) while already-cached data stays on screen. */
  revalidating?: boolean
}

/**
 * Fixed help bar (ADR-0006): only the bindings actually active
 * on the current screen, plus a transient status message after an action.
 */
export function Footer({ bindings, status, revalidating }: FooterProps) {
  return (
    <Box flexDirection="column" paddingX={1}>
      {status ? <Text color="green">{status}</Text> : revalidating ? <Spinner label="refreshing…" /> : null}
      <Text dimColor>{bindings.join(' · ')}</Text>
    </Box>
  )
}
