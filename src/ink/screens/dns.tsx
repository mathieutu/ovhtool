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
import { fullDomain, toMarkdownTable, stripDomainSuffix, applyPendingOverrides } from '../../cliPure.ts'
import { type Profile } from '../../config.ts'
import { createOvhClient } from '../../ovhClient.ts'
import { copyToClipboard } from '../../clipboard.ts'
import { toOvhtoolError } from '../../errors.ts'
import { type ActionDiff } from '../../diff.ts'
import {
  DNS_RECORD_TYPES,
  isValidRecordType,
  listZones,
  listDnsRecords,
  prepareAddDnsRecord,
  applyAddDnsRecord,
  prepareUpdateDnsRecord,
  applyUpdateDnsRecord,
  prepareDeleteDnsRecord,
  applyDeleteDnsRecord,
  type DnsRecord,
} from '../../commands/dns.ts'

export type DnsInitialPanel = { kind: 'add' | 'edit' | 'delete'; id?: string; values?: Record<string, string | undefined> }

export type DnsScreenProps = {
  initialFilter?: string
  initialZone?: string
  initialAccount?: string
  initialPanel?: DnsInitialPanel
  /** Session-pinned domain (`ovhtool <domain>`, cli.ts) — only when the resolved zone still matches this is it shown domain-first and does Escape fall back home instead of to the zone picker. */
  pinnedDomain?: string
  onHome: () => void
}

type PanelKind = 'add' | 'edit' | 'delete' | null

export function DnsScreen({ initialZone, initialAccount, initialPanel, onHome, initialFilter, pinnedDomain }: DnsScreenProps) {
  const domainContext = useDomainContext(initialZone, initialAccount, listZones)
  const { phase, revealDomainPicker, goBack } = domainContext

  if (phase.kind !== 'ready') {
    return <DomainContextGate domainLabel="zone" domainContext={domainContext} onHome={onHome} />
  }

  return (
    <DnsDashboard
      zone={phase.domain}
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

function DnsDashboard({
  zone,
  accountName,
  profile,
  initialPanel,
  initialFilter,
  isDomainPinned,
  onHome,
  onBack,
  onRevealPicker,
}: {
  zone: string
  accountName: string
  profile: Profile
  initialPanel?: DnsInitialPanel
  initialFilter?: string
  isDomainPinned: boolean
  onHome: () => void
  onBack: () => boolean
  onRevealPicker: () => void
}) {
  const client = useMemo(() => createOvhClient(profile), [profile])
  // OVH's record-listing endpoint can echo a just-applied add/edit/delete for
  // a beat, so a `reload()` right after one could undo what the app already
  // knows happened — every confirmed mutation is recorded here and
  // reconciled into whatever the next fetch returns (applyPendingOverrides).
  const pendingRef = useRef(new Map<number, DnsRecord | 'deleted'>())
  const { status, data, error: loadError, revalidating, reload, mutate } = useAsyncData(
    async () => applyPendingOverrides(await listDnsRecords(client, zone), pendingRef.current, (r) => r.id),
    [client, zone],
    `dns:${accountName}:${zone}`,
  )
  const records = data ?? []

  const columns: TableColumn<DnsRecord>[] = [
    { header: 'id', render: (r) => String(r.id), width: 12 },
    { header: 'type', render: (r) => r.fieldType, width: 7 },
    { header: 'domain', render: (r) => fullDomain(zone, r.subDomain), href: (r) => `https://${fullDomain(zone, r.subDomain)}`, width: 28 },
    { header: 'value', render: (r) => r.target, width: null },
    { header: 'ttl', render: (r) => String(r.ttl), width: 6 },
  ]
  const searchFields = (r: DnsRecord) => [r.id, r.fieldType, fullDomain(zone, r.subDomain), r.target]

  const { filter, setFilter, selectedIndex, setSelectedIndex } = useTableSelection(initialFilter ?? '')
  // Must match exactly what `Table` renders (filter *and* its second-column
  // sort) — otherwise `selectedIndex` (which indexes the row order the user
  // actually sees) would point at the wrong item here.
  const filtered = visibleTableRows(records, columns, filter, searchFields)
  const selected = filtered[selectedIndex]

  const [panel, setPanel] = useState<PanelKind>(initialPanel?.kind ?? null)
  const [panelRecord, setPanelRecord] = useState<DnsRecord | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | undefined>()
  const [panelError, setPanelError] = useState<string | undefined>()
  const initialPanelRef = useRef(initialPanel)

  // Once the record list for a fully-qualified `dns update`/`dns delete --id`
  // is loaded, resolve which row the initial panel refers to.
  useEffect(() => {
    const spec = initialPanelRef.current
    if (!spec || status !== 'ready') return
    if (spec.kind === 'edit' || spec.kind === 'delete') {
      const found = records.find((r) => String(r.id) === spec.id)
      if (found) setPanelRecord(found)
      else setPanel(null)
    }
    initialPanelRef.current = undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  function closePanel() {
    setPanel(null)
    setPanelRecord(null)
    setPanelError(undefined)
  }

  function onMutationDone(message: string, id: number, change: DnsRecord | 'deleted') {
    pendingRef.current.set(id, change)
    closePanel()
    mutate((current) => (current ? applyPendingOverrides(current, new Map([[id, change]]), (r) => r.id) : current))
    reload()
    setStatusMessage(message)
  }

  function openEdit() {
    if (!selected) return
    setPanelRecord(selected)
    setPanel('edit')
  }

  function openDelete() {
    if (!selected) return
    setPanelRecord(selected)
    setPanel('delete')
  }

  async function copyMarkdown() {
    const markdown = toMarkdownTable(
      ['id', 'type', 'domain', 'value', 'ttl'],
      filtered.map((r) => [r.id, r.fieldType, fullDomain(zone, r.subDomain), r.target, r.ttl]),
    )
    try {
      await copyToClipboard(markdown)
      setStatusMessage(`✔ ${filtered.length} row(s) copied`)
    } catch (err) {
      setPanelError(toOvhtoolError(err).message)
    }
  }

  const { bindings } = useKeymap([
    { key: 'return', label: 'edit', when: Boolean(selected) && panel === null, onTrigger: openEdit },
    { key: 'delete', label: 'delete', when: Boolean(selected) && panel === null, onTrigger: openDelete },
    { ctrl: 'n', label: 'add', when: panel === null, onTrigger: () => setPanel('add') },
    { ctrl: 'y', label: 'copy', when: panel === null, onTrigger: () => void copyMarkdown() },
    { ctrl: 'r', label: 'refresh', when: panel === null, onTrigger: reload },
    {
      key: 'escape',
      label: 'back',
      onTrigger: () => {
        if (panel !== null) closePanel()
        else if (filter !== '') setFilter('')
        else if (!onBack()) (isDomainPinned ? onHome() : onRevealPicker())
      },
    },
  ])

  return (
    <ScreenLayout header={<Header context={zone} pinned={isDomainPinned} revalidating={revalidating && data !== null} />} footer={<Footer bindings={bindings} status={statusMessage} />}>
      {status === 'loading' && !data ? (
        <Spinner label="Loading records…" />
      ) : loadError ? (
        <Alert message={toOvhtoolError(loadError).message} />
      ) : panel === null ? (
        <Table
          columns={columns}
          rows={records}
          searchFields={searchFields}
          filter={filter}
          onFilterChange={setFilter}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={setSelectedIndex}
          emptyLabel="No record."
        />
      ) : panel === 'add' ? (
        <AddDnsPanel zone={zone} initialValues={initialPanel?.kind === 'add' ? initialPanel.values : undefined} client={client} onDone={(message, created) => onMutationDone(message, created.id, created)} onCancel={closePanel} onError={setPanelError} error={panelError} />
      ) : panel === 'edit' && panelRecord ? (
        <EditDnsPanel zone={zone} record={panelRecord} client={client} onDone={(message, updated) => onMutationDone(message, updated.id, updated)} onCancel={closePanel} onError={setPanelError} error={panelError} />
      ) : panel === 'delete' && panelRecord ? (
        <DeleteDnsPanel zone={zone} record={panelRecord} client={client} onDone={(message) => onMutationDone(message, panelRecord.id, 'deleted')} onCancel={closePanel} onError={setPanelError} error={panelError} />
      ) : (
        <Spinner label="Loading…" />
      )}
    </ScreenLayout>
  )
}

type MutationPanelProps = {
  zone: string
  client: ReturnType<typeof createOvhClient>
  onCancel: () => void
  onError: (message: string | undefined) => void
  error?: string | undefined
}

/** `record` carries the resulting row, so the caller can apply it locally instead of trusting the next fetch to reflect it. */
type AddOrEditPanelProps = MutationPanelProps & { onDone: (message: string, record: DnsRecord) => void }

function AddDnsPanel({ zone, initialValues, client, onDone, onError, error }: AddOrEditPanelProps & { initialValues?: Record<string, string | undefined> }) {
  const [subDomain, setSubDomain] = useState(initialValues?.subdomain ?? '')
  const [target, setTarget] = useState(initialValues?.value ?? '')
  const [fieldType, setFieldType] = useState(initialValues?.type && isValidRecordType(initialValues.type) ? initialValues.type : DNS_RECORD_TYPES[0])
  const [ttl, setTtl] = useState(initialValues?.ttl ?? '')
  const [diff, setDiff] = useState<ActionDiff | null>(null)
  const [applying, setApplying] = useState(false)

  const fields: FormField[] = [
    { name: 'subDomain', label: `Subdomain (.${zone})`, kind: 'text', value: subDomain, onChange: setSubDomain },
    { name: 'target', label: 'Value', kind: 'text', value: target, onChange: setTarget },
    { name: 'fieldType', label: 'Type', kind: 'select', options: DNS_RECORD_TYPES.map((t) => ({ label: t, value: t })), value: fieldType, onChange: (v) => setFieldType(v as typeof fieldType) },
    { name: 'ttl', label: 'TTL', kind: 'text', value: ttl, onChange: setTtl },
  ]

  function submit() {
    if (!target.trim()) {
      onError('Value is required.')
      return
    }
    onError(undefined)
    setDiff(prepareAddDnsRecord({ zone, subDomain: stripDomainSuffix(subDomain, zone), target, fieldType, ttl: ttl ? parseInt(ttl, 10) : undefined }))
  }

  async function confirm() {
    if (!client) return
    setApplying(true)
    try {
      const created = await applyAddDnsRecord(client, { zone, subDomain: stripDomainSuffix(subDomain, zone), target, fieldType, ttl: ttl ? parseInt(ttl, 10) : undefined })
      onDone('✔ Record added', created)
    } catch (err) {
      setApplying(false)
      onError(toOvhtoolError(err).message)
      setDiff(null)
    }
  }

  return (
    <Panel title="Add a DNS record">
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

function EditDnsPanel({ zone, record, client, onDone, onError, error }: AddOrEditPanelProps & { record: DnsRecord }) {
  const [subDomain, setSubDomain] = useState(record.subDomain)
  const [target, setTarget] = useState(record.target)
  const [ttl, setTtl] = useState(String(record.ttl))
  const [diff, setDiff] = useState<ActionDiff | null>(null)
  const [applying, setApplying] = useState(false)

  const fields: FormField[] = [
    { name: 'subDomain', label: `Subdomain (.${zone})`, kind: 'text', value: subDomain, onChange: setSubDomain },
    { name: 'target', label: 'Value', kind: 'text', value: target, onChange: setTarget },
    { name: 'ttl', label: 'TTL', kind: 'text', value: ttl, onChange: setTtl },
  ]

  function submit() {
    onError(undefined)
    setDiff(prepareUpdateDnsRecord(record, { zone, id: record.id, subDomain: stripDomainSuffix(subDomain, zone), target, ttl: ttl ? parseInt(ttl, 10) : undefined }))
  }

  async function confirm() {
    if (!client) return
    setApplying(true)
    try {
      const params = { zone, id: record.id, subDomain: stripDomainSuffix(subDomain, zone), target, ttl: ttl ? parseInt(ttl, 10) : undefined }
      await applyUpdateDnsRecord(client, params)
      onDone('✔ Record updated', { ...record, subDomain: params.subDomain, target: params.target, ttl: params.ttl ?? record.ttl })
    } catch (err) {
      setApplying(false)
      onError(toOvhtoolError(err).message)
      setDiff(null)
    }
  }

  return (
    <Panel title={`Edit #${record.id}`}>
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

function DeleteDnsPanel({ zone, record, client, onDone, onCancel, onError, error }: MutationPanelProps & { record: DnsRecord; onDone: (message: string) => void }) {
  const [applying, setApplying] = useState(false)
  const diff = prepareDeleteDnsRecord(record)

  async function confirm() {
    if (!client) return
    setApplying(true)
    try {
      await applyDeleteDnsRecord(client, zone, record.id)
      onDone('✔ Record deleted')
    } catch (err) {
      setApplying(false)
      onError(toOvhtoolError(err).message)
    }
  }

  return (
    <Panel title={`Delete #${record.id}`}>
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
