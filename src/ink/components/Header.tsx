import React from 'react'
import { Box, Text } from 'ink'
import { useTheme } from '../theme.ts'
import { Spinner } from './primitives/Spinner.tsx'
import { Rainbow } from './primitives/Rainbow.tsx'

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
  /**
   * Shows a small right-aligned spinner for a background revalidation
   * (`useAsyncData`'s `revalidating`) while already-cached data stays on
   * screen — lives here rather than in the `Footer` because this bordered
   * box is always exactly 3 rows tall regardless of its content, so it can
   * never grow into an extra terminal row the way a conditional `Footer`
   * line would (that used to visibly "jump" the whole fixed-height layout
   * for the duration of every background refresh).
   */
  revalidating?: boolean
}

/**
 * Persistent context banner (ADR-0005): the service segment
 * and its color come from the current `ThemeProvider` (set once per screen
 * in `app.tsx`), so every screen stays visually identifiable at a glance.
 */
export function Header({ context, pinned, revalidating }: HeaderProps) {
  const { color, label } = useTheme()
  const parts = (pinned ? [context, label] : [label, context]).filter((part): part is string => Boolean(part))
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
      <Text bold>
        {parts.map((part, i) => (
          <React.Fragment key={part}>
            {i > 0 ? <Text color={color}> · </Text> : null}
            {part === label && label === 'ovhtool' ? <Rainbow text={part} bold /> : <Text color={color}>{part}</Text>}
          </React.Fragment>
        ))}
      </Text>
      {revalidating ? <Spinner label="refreshing…" /> : null}
    </Box>
  )
}
