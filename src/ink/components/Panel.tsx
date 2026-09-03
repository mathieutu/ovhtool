import React from 'react'
import { Box, Text } from 'ink'
import { useTheme } from '../theme.ts'

export type PanelProps = {
  title: string
  children: React.ReactNode
}

/**
 * Common wrapper for the form/diff panel (ADR-0005): replaces
 * only the table in the screen body — Header/Footer stay mounted by the
 * screen itself.
 */
export function Panel({ title, children }: PanelProps) {
  const { color } = useTheme()
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1} paddingY={0}>
      <Text bold>{title}</Text>
      <Box marginTop={1} flexDirection="column">
        {children}
      </Box>
    </Box>
  )
}
