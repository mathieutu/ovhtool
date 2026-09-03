import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box } from 'ink'
import { Header } from '../components/Header.tsx'
import { Footer } from '../components/Footer.tsx'
import { ScreenLayout } from '../components/ScreenLayout.tsx'
import { Table, useTableSelection, visibleTableRows, type TableColumn } from '../components/Table.tsx'
import { Panel } from '../components/Panel.tsx'
import { Form, type FormField } from '../components/Form.tsx'
import { Diff } from '../components/Diff.tsx'
import { ConfirmInput } from '../components/primitives/ConfirmInput.tsx'
import { Spinner } from '../components/primitives/Spinner.tsx'
import { Alert } from '../components/primitives/Alert.tsx'
import { DomainContextGate } from '../components/DomainContextGate.tsx'
import { useKeymap } from '../hooks/useKeymap.ts'
import { useAsyncData } from '../hooks/useAsyncData.ts'
import { useDomainContext } from '../hooks/useDomainContext.ts'
import { toMarkdownTable } from '../../cliPure.ts'
import { type Profile } from '../../config.ts'
import { createOvhClient } from '../../ovhClient.ts'
import { copyToClipboard } from '../../clipboard.ts'
import { toOvhtoolError } from '../../errors.ts'
import { type ActionDiff } from '../../diff.ts'
import { listMailDomains } from '../../commands/mail.ts'
import {
  listMailRedirections,
  prepareAddMailRedirection,
  applyAddMailRedirection,
  prepareRemoveMailRedirection,
  applyRemoveMailRedirection,
  type MailRedirection,
} from '../../commands/mailRedirect.ts'

export type MailRedirectInitialPanel = { kind: 'add' | 'delete'; id?: string; values?: Record<string, string | undefined> }

export type MailRedirectScreenProps = {
  initialFilter?: string
  initialDomain?: string
  initialAccount?: string
  initialPanel?: MailRedirectInitialPanel
  /** Session-pinned domain (`ovhtool <domain>`, cli.ts) — only when the resolved domain still matches this is it shown domain-first and does Escape fall back home instead of to the domain picker. */
  pinnedDomain?: string
  onHome: () => void
}

type PanelKind = 'add' | 'delete' | null

export function MailRedirectScreen({ initialDomain, initialAccount, initialPanel, onHome, initialFilter, pinnedDomain }: MailRedirectScreenProps) {
  const domainContext = useDomainContext(initialDomain, initialAccount, listMailDomains)
  const { phase, revealDomainPicker, goBack } = domainContext

  if (phase.kind !== 'ready') {
    return <DomainContextGate domainLabel="domain" domainContext={domainContext} onHome={onHome} />
  }

  return (
    <MailRedirectDashboard
      domain={phase.domain}
      accountName={phase.account}
      profile={phase.profile}
      initialPanel={initialPanel}
      initialFilter={initialFilter}
      isDomainPinned={phase.domain === pinnedDomain}
      onHome={onHome}
      onBack={goBack}
      onRevealPicker={revealDomainPicker}
    />
  )
}

function MailRedirectDashboard({
  domain,
  accountName,
  profile,
  initialPanel,
  initialFilter,
  isDomainPinned,
  onHome,
  onBack,
  onRevealPicker,
}: {
  domain: string
  accountName: string
  profile: Profile
  initialPanel?: MailRedirectInitialPanel
  initialFilter?: string
  isDomainPinned: boolean
  onHome: () => void
  onBack: () => boolean
  onRevealPicker: () => void
}) {
  const client = useMemo(() => createOvhClient(profile), [profile])
  const { status, data, error: loadError, revalidating, reload } = useAsyncData(async () => listMailRedirections(client, domain), [client, domain], `mailRedirect:${accountName}:${domain}`)
  const redirections = data ?? []

  const columns: TableColumn<MailRedirection>[] = [
    { header: 'id', render: (r) => r.id, width: 18 },
    { header: 'from', render: (r) => r.from, width: 30 },
    { header: 'to', render: (r) => r.to, width: null },
  ]
  const searchFields = (r: MailRedirection) => [r.id, r.from, r.to]

  const { filter, setFilter, selectedIndex, setSelectedIndex } = useTableSelection(initialFilter ?? '')
  const filtered = visibleTableRows(redirections, columns, filter, searchFields)
  const selected = filtered[selectedIndex]

  const [panel, setPanel] = useState<PanelKind>(initialPanel?.kind ?? null)
  const [panelRedirection, setPanelRedirection] = useState<MailRedirection | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | undefined>()
  const [panelError, setPanelError] = useState<string | undefined>()
  const initialPanelRef = useRef(initialPanel)

  useEffect(() => {
    const spec = initialPanelRef.current
    if (!spec || status !== 'ready') return
    if (spec.kind === 'delete') {
      const found = redirections.find((r) => r.id === spec.id)
      if (found) setPanelRedirection(found)
      else setPanel(null)
    }
    initialPanelRef.current = undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  function closePanel() {
    setPanel(null)
    setPanelRedirection(null)
    setPanelError(undefined)
  }

  function openDelete() {
    if (!selected) return
    setPanelRedirection(selected)
    setPanel('delete')
  }

  async function copyMarkdown() {
    const markdown = toMarkdownTable(
      ['id', 'from', 'to'],
      filtered.map((r) => [r.id, r.from, r.to]),
    )
    try {
      await copyToClipboard(markdown)
      setStatusMessage(`✔ ${filtered.length} row(s) copied`)
    } catch (err) {
      setPanelError(toOvhtoolError(err).message)
    }
  }

  // No update endpoint exists for redirections: Enter has no binding here,
  // only Del (delete) and Ctrl+N (add).
  const { bindings } = useKeymap(
    [
      { key: 'delete', label: 'delete', when: Boolean(selected) && panel === null, onTrigger: openDelete },
      { ctrl: 'n', label: 'add', when: panel === null, onTrigger: () => setPanel('add') },
      { ctrl: 'y', label: 'copy', when: panel === null, onTrigger: () => void copyMarkdown() },
      {
        key: 'escape',
        label: 'back',
        onTrigger: () => {
          if (panel !== null) closePanel()
          else if (filter !== '') setFilter('')
          else if (!onBack()) (isDomainPinned ? onHome() : onRevealPicker())
        },
      },
    ],
  )

  return (
    <ScreenLayout header={<Header context={domain} pinned={isDomainPinned} revalidating={revalidating && data !== null} />} footer={<Footer bindings={bindings} status={statusMessage} />}>
      {status === 'loading' && !data ? (
        <Spinner label="Loading redirections…" />
      ) : loadError ? (
        <Alert message={toOvhtoolError(loadError).message} />
      ) : panel === null ? (
        <Table
          columns={columns}
          rows={redirections}
          searchFields={searchFields}
          filter={filter}
          onFilterChange={setFilter}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={setSelectedIndex}
          emptyLabel="No redirection."
        />
      ) : panel === 'add' ? (
        <AddRedirectionPanel domain={domain} initialValues={initialPanel?.kind === 'add' ? initialPanel.values : undefined} client={client} onDone={(message) => { closePanel(); reload(); setStatusMessage(message) }} onCancel={closePanel} onError={setPanelError} error={panelError} />
      ) : panel === 'delete' && panelRedirection ? (
        <DeleteRedirectionPanel domain={domain} redirection={panelRedirection} client={client} onDone={(message) => { closePanel(); reload(); setStatusMessage(message) }} onCancel={closePanel} onError={setPanelError} error={panelError} />
      ) : (
        <Spinner label="Loading…" />
      )}
    </ScreenLayout>
  )
}

type MutationPanelProps = {
  domain: string
  client: ReturnType<typeof createOvhClient>
  onDone: (message: string) => void
  onCancel: () => void
  onError: (message: string | undefined) => void
  error?: string | undefined
}

function AddRedirectionPanel({ domain, initialValues, client, onDone, onError, error }: MutationPanelProps & { initialValues?: Record<string, string | undefined> }) {
  const [from, setFrom] = useState(initialValues?.from ?? '')
  const [to, setTo] = useState(initialValues?.to ?? '')
  const [diff, setDiff] = useState<ActionDiff | null>(null)
  const [applying, setApplying] = useState(false)

  const fields: FormField[] = [
    { name: 'from', label: 'From', kind: 'text', value: from, onChange: setFrom },
    { name: 'to', label: 'To', kind: 'text', value: to, onChange: setTo },
  ]

  function submit() {
    if (!from.trim() || !to.trim()) {
      onError('"From" and "To" are required.')
      return
    }
    onError(undefined)
    setDiff(prepareAddMailRedirection({ domain, from, to }))
  }

  async function confirm() {
    if (!client) return
    setApplying(true)
    try {
      await applyAddMailRedirection(client, { domain, from, to })
      onDone('✔ Redirection added')
    } catch (err) {
      setApplying(false)
      onError(toOvhtoolError(err).message)
      setDiff(null)
    }
  }

  return (
    <Panel title="Add a redirection">
      {error ? <Alert message={error} /> : null}
      {diff ? (
        applying ? (
          <Spinner label="Applying…" />
        ) : (
          <Box flexDirection="column">
            <Diff diff={diff} />
            <ConfirmInput onConfirm={confirm} onCancel={() => setDiff(null)} />
          </Box>
        )
      ) : (
        <Form fields={fields} onSubmit={submit} />
      )}
    </Panel>
  )
}

function DeleteRedirectionPanel({ domain, redirection, client, onDone, onCancel, onError, error }: MutationPanelProps & { redirection: MailRedirection }) {
  const [applying, setApplying] = useState(false)
  const diff = prepareRemoveMailRedirection(redirection)

  async function confirm() {
    if (!client) return
    setApplying(true)
    try {
      await applyRemoveMailRedirection(client, domain, redirection.id)
      onDone('✔ Redirection deleted')
    } catch (err) {
      setApplying(false)
      onError(toOvhtoolError(err).message)
    }
  }

  return (
    <Panel title={`Delete #${redirection.id}`}>
      {error ? <Alert message={error} /> : null}
      {applying ? (
        <Spinner label="Applying…" />
      ) : (
        <Box flexDirection="column">
          <Diff diff={diff} />
          <ConfirmInput onConfirm={confirm} onCancel={onCancel} />
        </Box>
      )}
    </Panel>
  )
}
