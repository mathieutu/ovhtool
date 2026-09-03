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
import {
  listMailDomains,
  listMailAccounts,
  prepareCreateMailAccount,
  applyCreateMailAccount,
  prepareDeleteMailAccount,
  applyDeleteMailAccount,
  preparePasswdMailAccount,
  applyChangeMailPassword,
  type MailAccount,
} from '../../commands/mail.ts'

export type MailInitialPanel = { kind: 'add' | 'edit' | 'delete'; id?: string; values?: Record<string, string | undefined> }

export type MailScreenProps = {
  initialFilter?: string
  initialDomain?: string
  initialAccount?: string
  initialPanel?: MailInitialPanel
  /** Session-pinned domain (`ovhtool <domain>`, cli.ts) — only when the resolved domain still matches this is it shown domain-first and does Escape fall back home instead of to the domain picker. */
  pinnedDomain?: string
  onHome: () => void
}

type PanelKind = 'add' | 'edit' | 'delete' | null

export function MailScreen({ initialDomain, initialAccount, initialPanel, onHome, initialFilter, pinnedDomain }: MailScreenProps) {
  const domainContext = useDomainContext(initialDomain, initialAccount, listMailDomains)
  const { phase, revealDomainPicker, goBack } = domainContext

  if (phase.kind !== 'ready') {
    return <DomainContextGate domainLabel="domain" domainContext={domainContext} onHome={onHome} />
  }

  return (
    <MailDashboard
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

function MailDashboard({
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
  initialPanel?: MailInitialPanel
  initialFilter?: string
  isDomainPinned: boolean
  onHome: () => void
  onBack: () => boolean
  onRevealPicker: () => void
}) {
  const client = useMemo(() => createOvhClient(profile), [profile])
  const { status, data, error: loadError, revalidating, reload } = useAsyncData(async () => listMailAccounts(client, domain), [client, domain], `mail:${accountName}:${domain}`)
  const accounts = data ?? []

  const columns: TableColumn<MailAccount>[] = [
    { header: 'accountName', render: (a) => a.accountName, width: 20 },
    { header: 'email', render: (a) => a.email, width: 32 },
    { header: 'size (MB)', render: (a) => String(a.size), width: 12 },
    { header: 'description', render: (a) => a.description || '', width: null },
  ]
  const searchFields = (a: MailAccount) => [a.accountName, a.email, a.description || '']

  const { filter, setFilter, selectedIndex, setSelectedIndex } = useTableSelection(initialFilter ?? '')
  const filtered = visibleTableRows(accounts, columns, filter, searchFields)
  const selected = filtered[selectedIndex]

  const [panel, setPanel] = useState<PanelKind>(initialPanel?.kind ?? null)
  const [panelAccount, setPanelAccount] = useState<MailAccount | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | undefined>()
  const [panelError, setPanelError] = useState<string | undefined>()
  const initialPanelRef = useRef(initialPanel)

  useEffect(() => {
    const spec = initialPanelRef.current
    if (!spec || status !== 'ready') return
    if (spec.kind === 'edit' || spec.kind === 'delete') {
      const found = accounts.find((a) => a.accountName === spec.id)
      if (found) setPanelAccount(found)
      else setPanel(null)
    }
    initialPanelRef.current = undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  function closePanel() {
    setPanel(null)
    setPanelAccount(null)
    setPanelError(undefined)
  }

  function openEdit() {
    if (!selected) return
    setPanelAccount(selected)
    setPanel('edit')
  }

  function openDelete() {
    if (!selected) return
    setPanelAccount(selected)
    setPanel('delete')
  }

  async function copyMarkdown() {
    const markdown = toMarkdownTable(
      ['accountName', 'email', 'size (MB)', 'description'],
      filtered.map((a) => [a.accountName, a.email, a.size, a.description || '']),
    )
    try {
      await copyToClipboard(markdown)
      setStatusMessage(`✔ ${filtered.length} row(s) copied`)
    } catch (err) {
      setPanelError(toOvhtoolError(err).message)
    }
  }

  const { bindings } = useKeymap(
    [
      { key: 'return', label: 'change password', when: Boolean(selected) && panel === null, onTrigger: openEdit },
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
        <Spinner label="Loading mail accounts…" />
      ) : loadError ? (
        <Alert message={toOvhtoolError(loadError).message} />
      ) : panel === null ? (
        <Table
          columns={columns}
          rows={accounts}
          searchFields={searchFields}
          filter={filter}
          onFilterChange={setFilter}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={setSelectedIndex}
          emptyLabel="No mail account."
        />
      ) : panel === 'add' ? (
        <CreateMailPanel domain={domain} initialValues={initialPanel?.kind === 'add' ? initialPanel.values : undefined} client={client} onDone={(message) => { closePanel(); reload(); setStatusMessage(message) }} onCancel={closePanel} onError={setPanelError} error={panelError} />
      ) : panel === 'edit' && panelAccount ? (
        <PasswdMailPanel domain={domain} account={panelAccount} client={client} onDone={(message) => { closePanel(); reload(); setStatusMessage(message) }} onCancel={closePanel} onError={setPanelError} error={panelError} />
      ) : panel === 'delete' && panelAccount ? (
        <DeleteMailPanel domain={domain} account={panelAccount} client={client} onDone={(message) => { closePanel(); reload(); setStatusMessage(message) }} onCancel={closePanel} onError={setPanelError} error={panelError} />
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

function CreateMailPanel({ domain, initialValues, client, onDone, onError, error }: MutationPanelProps & { initialValues?: Record<string, string | undefined> }) {
  const [accountName, setAccountName] = useState(initialValues?.accountName ?? '')
  const [password, setPassword] = useState('')
  const [size, setSize] = useState(initialValues?.size ?? '')
  const [description, setDescription] = useState(initialValues?.description ?? '')
  const [diff, setDiff] = useState<ActionDiff | null>(null)
  const [applying, setApplying] = useState(false)

  const fields: FormField[] = [
    { name: 'accountName', label: 'Account name', kind: 'text', value: accountName, onChange: setAccountName },
    { name: 'password', label: 'Password', kind: 'password', value: password, onChange: setPassword },
    { name: 'size', label: 'Size (MB)', kind: 'text', value: size, onChange: setSize },
    { name: 'description', label: 'Description', kind: 'text', value: description, onChange: setDescription },
  ]

  function submit() {
    if (!accountName.trim()) {
      onError('Account name is required.')
      return
    }
    if (!password.trim()) {
      onError('Password is required.')
      return
    }
    onError(undefined)
    setDiff(prepareCreateMailAccount({ domain, accountName, password, size: size ? parseInt(size, 10) : undefined, description: description || undefined }))
  }

  async function confirm() {
    if (!client) return
    setApplying(true)
    try {
      await applyCreateMailAccount(client, { domain, accountName, password, size: size ? parseInt(size, 10) : undefined, description: description || undefined })
      onDone('✔ Mail account created')
    } catch (err) {
      setApplying(false)
      onError(toOvhtoolError(err).message)
      setDiff(null)
    }
  }

  return (
    <Panel title="Create a mail account">
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

function PasswdMailPanel({ domain, account, client, onDone, onCancel, onError, error }: MutationPanelProps & { account: MailAccount }) {
  const [password, setPassword] = useState('')
  const [diff, setDiff] = useState<ActionDiff | null>(null)
  const [applying, setApplying] = useState(false)

  const fields: FormField[] = [{ name: 'password', label: 'New password', kind: 'password', value: password, onChange: setPassword }]

  function submit() {
    if (!password.trim()) {
      onError('Password is required.')
      return
    }
    onError(undefined)
    setDiff(preparePasswdMailAccount())
  }

  async function confirm() {
    if (!client) return
    setApplying(true)
    try {
      await applyChangeMailPassword(client, { domain, accountName: account.accountName, password })
      onDone('✔ Password changed')
    } catch (err) {
      setApplying(false)
      onError(toOvhtoolError(err).message)
      setDiff(null)
    }
  }

  return (
    <Panel title={`Change password for ${account.accountName}`}>
      {error ? <Alert message={error} /> : null}
      {diff ? (
        applying ? (
          <Spinner label="Applying…" />
        ) : (
          <Box flexDirection="column">
            <Diff diff={diff} />
            <ConfirmInput onConfirm={confirm} onCancel={onCancel} />
          </Box>
        )
      ) : (
        <Form fields={fields} onSubmit={submit} />
      )}
    </Panel>
  )
}

function DeleteMailPanel({ domain, account, client, onDone, onCancel, onError, error }: MutationPanelProps & { account: MailAccount }) {
  const [applying, setApplying] = useState(false)
  const diff = prepareDeleteMailAccount(account)

  async function confirm() {
    if (!client) return
    setApplying(true)
    try {
      await applyDeleteMailAccount(client, domain, account.accountName)
      onDone('✔ Mail account deleted')
    } catch (err) {
      setApplying(false)
      onError(toOvhtoolError(err).message)
    }
  }

  return (
    <Panel title={`Delete ${account.accountName}`}>
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
