import React, { type ReactNode } from 'react'
import { Box } from 'ink'
import { useTerminalSize } from './Table.tsx'

export type ScreenLayoutProps = {
  header: ReactNode
  footer: ReactNode
  children: ReactNode
}

/**
 * Pins the header to the very first terminal row and the footer to the very
 * last one, vim/less-style, regardless of how much (or how little) content
 * sits between them: the outer box is given the terminal's exact height, and
 * the body is wrapped in a `flexGrow` box that always claims the leftover
 * space — a short list, a one-line spinner or an error banner all still
 * push the footer down to the bottom row instead of leaving it floating
 * right under a handful of rows.
 */
export function ScreenLayout({ header, footer, children }: ScreenLayoutProps) {
  const { rows } = useTerminalSize()
  return (
    <Box flexDirection="column" height={rows}>
      {header}
      <Box flexDirection="column" flexGrow={1}>
        {children}
      </Box>
      {footer}
    </Box>
  )
}
