import React from 'react'
import { Box, Text } from 'ink'
import { formatDiffLines, type ActionDiff } from '../../diff.ts'

export type DiffProps = { diff: ActionDiff }

/** Renders an `ActionDiff` (src/diff.ts) as colored +/-/~ lines. */
export function Diff({ diff }: DiffProps) {
  const lines = formatDiffLines(diff)
  if (lines.length === 0) {
    return <Text dimColor>(no changes)</Text>
  }
  return (
    <Box flexDirection="column">
      {lines.map((line, index) => (
        <Text key={index} color={line.startsWith('+') ? 'green' : line.startsWith('-') ? 'red' : 'yellow'}>
          {line}
        </Text>
      ))}
    </Box>
  )
}
