import React, { useState } from 'react'
import { Header } from './Header.tsx'
import { Footer } from './Footer.tsx'
import { ScreenLayout } from './ScreenLayout.tsx'
import { Table, useTableSelection, visibleTableRows, type TableColumn } from './Table.tsx'
import { Panel } from './Panel.tsx'
import { Form, type FormField } from './Form.tsx'
import { Select } from './primitives/Select.tsx'
import { Spinner } from './primitives/Spinner.tsx'
import { Alert } from './primitives/Alert.tsx'
import { useKeymap } from '../hooks/useKeymap.ts'
import type { DomainContext, DomainOption } from '../hooks/useDomainContext.ts'

export type DomainContextGateProps = {
  /** Noun used in prompts/labels ("zone" for DNS, "domain" for mail/mail-redirect). */
  domainLabel: string
  domainContext: DomainContext
  onHome: () => void
}

/**
 * Renders every phase of `useDomainContext` except `ready`: a single
 * filterable picker combining every configured account's domains (account +
 * domain columns, never a blind text field) — with a manual-entry escape
 * hatch (Ctrl+N) for a domain the account API wouldn't list. The caller only
 * mounts this while `domainContext.phase.kind !== 'ready'`.
 */
export function DomainContextGate({ domainLabel, domainContext, onHome }: DomainContextGateProps) {
  const { phase, pickDomain, chooseCandidate, goBack } = domainContext
  const [manualEntry, setManualEntry] = useState(false)
  const [manualAccount, setManualAccount] = useState('')
  const [manualDomain, setManualDomain] = useState('')
  const { filter, setFilter, selectedIndex, setSelectedIndex } = useTableSelection()

  const columns: TableColumn<DomainOption>[] = [
    { header: 'account', render: (o) => o.account, width: 16 },
    { header: domainLabel, render: (o) => o.domain, width: null },
  ]
  const searchFields = (o: DomainOption) => [o.account, o.domain]

  const options = phase.kind === 'pick-domain' ? phase.options : []
  const filtered = visibleTableRows(options, columns, filter, searchFields)
  const selected = filtered[selectedIndex]

  // Escape always steps back exactly one level (ADR-0005): a
  // pending manual entry or filter is cleared first, then `goBack()` unwinds
  // the resolution chain built by `useDomainContext` one phase at a time —
  // only falling back to the home screen once there is no earlier level left.
  const { bindings } = useKeymap([
    { key: 'return', label: 'open', when: phase.kind === 'pick-domain' && !manualEntry && Boolean(selected), onTrigger: () => selected && pickDomain(selected) },
    { ctrl: 'n', label: `enter a ${domainLabel} manually`, when: phase.kind === 'pick-domain' && !manualEntry, onTrigger: () => setManualEntry(true) },
    {
      key: 'escape',
      label: 'back',
      onTrigger: () => {
        if (manualEntry) setManualEntry(false)
        else if (phase.kind === 'pick-domain' && filter !== '') setFilter('')
        else if (!goBack()) onHome()
      },
    },
  ])

  if (phase.kind === 'error') {
    return (
      <ScreenLayout header={<Header />} footer={<Footer bindings={bindings} />}>
        <Alert message={phase.message} />
      </ScreenLayout>
    )
  }

  if (phase.kind === 'listing-domains' || phase.kind === 'resolving') {
    return (
      <ScreenLayout header={<Header />} footer={<Footer bindings={bindings} />}>
        <Spinner label="Loading…" />
      </ScreenLayout>
    )
  }

  if (phase.kind === 'pick-candidate') {
    return (
      <ScreenLayout header={<Header />} footer={<Footer bindings={['↑↓ choose', '↵ confirm', ...bindings]} />}>
        <Panel title="Several accounts have access to this domain">
          <Select options={phase.candidates.map((c) => ({ label: c, value: c }))} value={phase.candidates[0] ?? ''} onChange={chooseCandidate} />
        </Panel>
      </ScreenLayout>
    )
  }

  // phase.kind === 'pick-domain'
  return (
    <ScreenLayout header={<Header />} footer={<Footer bindings={bindings} />}>
      {manualEntry ? (
        <Panel title={`Enter a ${domainLabel}`}>
          <Form
            fields={
              [
                { name: 'account', label: 'Account', kind: 'text', value: manualAccount, onChange: setManualAccount },
                { name: 'domain', label: domainLabel.charAt(0).toUpperCase() + domainLabel.slice(1), kind: 'text', value: manualDomain, onChange: setManualDomain },
              ] satisfies FormField[]
            }
            onSubmit={() => {
              if (manualAccount.trim() !== '' && manualDomain.trim() !== '') pickDomain({ account: manualAccount.trim(), domain: manualDomain.trim() })
            }}
          />
        </Panel>
      ) : (
        <Table
          columns={columns}
          rows={options}
          searchFields={searchFields}
          filter={filter}
          onFilterChange={setFilter}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={setSelectedIndex}
          emptyLabel={`No ${domainLabel} found.`}
        />
      )}
    </ScreenLayout>
  )
}
