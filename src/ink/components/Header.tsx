import React from 'react'
import { Box, Text } from 'ink'
import { useTheme } from '../theme.ts'

export type HeaderProps = {
  /** Zone or domain currently in scope. */
  context?: string
  /**
   * True only when `context` is the session-pinned domain (`ovhtool
   * <domain>`, cli.ts) — shows it *before* the service, mirroring the CLI's
   * own domain-first order, since that domain applies "no matter what you do
   * inside". A one-shot qualified domain (`ovhtool dns bar.fr`) or one
   * picked from within a screen isn't pinned: the service stays first there,
   * `<service> · <domain>` (ADR-0007).
   */
  pinned?: boolean
}

/**
 * Persistent context banner (ADR-0005): the service segment
 * and its color come from the current `ThemeProvider` (set once per screen
 * in `app.tsx`), so every screen stays visually identifiable at a glance.
 */
export function Header({ context, pinned }: HeaderProps) {
  const { color, label } = useTheme()
  const parts = (pinned ? [context, label] : [label, context]).filter((part): part is string => Boolean(part))
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text bold color={color}>
        {parts.join(' · ')}
      </Text>
    </Box>
  )
}
