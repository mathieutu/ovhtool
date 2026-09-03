import React, { useState } from 'react'
import { Box, Text, useApp } from 'ink'
import { Header } from '../components/Header.tsx'
import { Footer } from '../components/Footer.tsx'
import { ScreenLayout } from '../components/ScreenLayout.tsx'
import { TextInput } from '../components/primitives/TextInput.tsx'
import { useKeymap } from '../hooks/useKeymap.ts'
import { filterRows } from '../../cliPure.ts'
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
  const [filter, setFilter] = useState('')
  const [index, setIndex] = useState(0)
  const { exit } = useApp()

  // Type-to-filter (ADR-0006, ADR-0013): the filter field is always active,
  // same as `Table`/`Select` — a separate `TextInput` below only reacts to
  // printable characters/Backspace, never to ↑/↓/Enter/Escape, so it never
  // fights this `useKeymap` for a key.
  const filtered = filterRows(DOMAINS, filter, (d) => [d.label])
  const clampedIndex = filtered.length === 0 ? -1 : Math.min(index, filtered.length - 1)

  // Escape at home quits (nothing above it to go back to) — except when a
  // domain is pinned: the first Escape forgets it (one extra step, since
  // that's meaningful state the user would otherwise lose by mistake), and
  // only a second Escape (now with nothing pinned) actually quits. `exit()`
  // (not `process.exit`) unmounts through Ink so `runInkApp`'s `finally`
  // still restores the terminal out of the alternate screen buffer.
  const { bindings } = useKeymap([
    { key: 'upArrow', label: 'up', onTrigger: () => setIndex(Math.max(0, clampedIndex - 1)) },
    { key: 'downArrow', label: 'down', onTrigger: () => setIndex(Math.min(filtered.length - 1, clampedIndex + 1)) },
    { key: 'return', label: 'open', when: filtered.length > 0, onTrigger: () => onSelect(filtered[clampedIndex]!.screen) },
    { key: 'escape', label: pinnedDomain ? 'forget domain' : 'quit', onTrigger: () => (pinnedDomain ? onClearPinnedDomain() : exit()) },
  ])

  return (
    <ScreenLayout header={<Header context={pinnedDomain} pinned />} footer={<Footer bindings={bindings} />}>
      <Box flexDirection="column" marginTop={1} paddingX={1}>
        <Box marginBottom={1}>
          <Text dimColor>Filter: </Text>
          <TextInput value={filter} onChange={setFilter} placeholder="(type to filter)" />
        </Box>
        {filtered.length === 0 ? (
          <Text dimColor>(no match)</Text>
        ) : (
          filtered.map((domain, i) => (
            <Text key={domain.screen} color={i === clampedIndex ? themeFor(domain.screen).color : undefined} inverse={i === clampedIndex}>
              {i === clampedIndex ? '❯ ' : '  '}
              {domain.label}
            </Text>
          ))
        )}
      </Box>
    </ScreenLayout>
  )
}
