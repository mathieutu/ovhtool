import React, { useState } from 'react'
import { Box, Text, useApp } from 'ink'
import { Header } from '../components/Header.tsx'
import { Footer } from '../components/Footer.tsx'
import { ScreenLayout } from '../components/ScreenLayout.tsx'
import { useKeymap } from '../hooks/useKeymap.ts'
import { themeFor } from '../theme.ts'
import type { ScreenName } from '../app.tsx'

export type HomeScreenProps = {
  onSelect: (screen: ScreenName) => void
  /** Session-pinned domain (`ovhtool <domain>`, see cli.ts) — shown in the header even at home, so it's clear it'll apply to whichever service is opened next. */
  pinnedDomain?: string
  onClearPinnedDomain: () => void
}

const DOMAINS: { screen: ScreenName; label: string }[] = [
  { screen: 'dns', label: 'DNS' },
  { screen: 'mail', label: 'Mail' },
  { screen: 'mailRedirect', label: 'Redirections' },
  { screen: 'accounts', label: 'Accounts' },
]

/** Home screen (ADR-0005): a menu of the domains, selecting one opens its dashboard. */
export function HomeScreen({ onSelect, pinnedDomain, onClearPinnedDomain }: HomeScreenProps) {
  const [index, setIndex] = useState(0)
  const { exit } = useApp()

  // Escape at home quits (nothing above it to go back to) — except when a
  // domain is pinned: the first Escape forgets it (one extra step, since
  // that's meaningful state the user would otherwise lose by mistake), and
  // only a second Escape (now with nothing pinned) actually quits. `exit()`
  // (not `process.exit`) unmounts through Ink so `runInkApp`'s `finally`
  // still restores the terminal out of the alternate screen buffer.
  const { bindings } = useKeymap([
    { key: 'upArrow', label: 'up', onTrigger: () => setIndex((i) => Math.max(0, i - 1)) },
    { key: 'downArrow', label: 'down', onTrigger: () => setIndex((i) => Math.min(DOMAINS.length - 1, i + 1)) },
    { key: 'return', label: 'open', onTrigger: () => onSelect(DOMAINS[index]!.screen) },
    { key: 'escape', label: pinnedDomain ? 'forget domain' : 'quit', onTrigger: () => (pinnedDomain ? onClearPinnedDomain() : exit()) },
  ])

  return (
    <ScreenLayout header={<Header context={pinnedDomain} pinned />} footer={<Footer bindings={bindings} />}>
      <Box flexDirection="column" marginTop={1} paddingX={1}>
        {DOMAINS.map((domain, i) => (
          <Text key={domain.screen} color={i === index ? themeFor(domain.screen).color : undefined} inverse={i === index}>
            {i === index ? '❯ ' : '  '}
            {domain.label}
          </Text>
        ))}
      </Box>
    </ScreenLayout>
  )
}
