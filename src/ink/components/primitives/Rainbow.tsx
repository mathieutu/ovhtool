import React from 'react'
import { Text } from 'ink'

const RAINBOW = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta']

/** Renders `text` one color per letter, cycling through the rainbow — used for service names so each stays visually distinct without needing its own flat color. */
export function Rainbow({ text, bold, inverse }: { text: string; bold?: boolean; inverse?: boolean }) {
  return (
    <>
      {text.split('').map((char, i) => (
        <Text key={i} bold={bold} inverse={inverse} color={RAINBOW[i % RAINBOW.length]}>
          {char}
        </Text>
      ))}
    </>
  )
}
