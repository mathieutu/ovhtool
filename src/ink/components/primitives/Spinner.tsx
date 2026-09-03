import React, { useEffect, useState } from 'react'
import { Text } from 'ink'
import { useTheme } from '../../theme.ts'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export type SpinnerProps = { label?: string }

/** Animated loading indicator: never a static "Loading…" text. */
export function Spinner({ label }: SpinnerProps) {
  const { color } = useTheme()
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 80)
    return () => clearInterval(timer)
  }, [])

  return (
    <Text color={color}>
      {FRAMES[frame]}
      {label ? ` ${label}` : ''}
    </Text>
  )
}
