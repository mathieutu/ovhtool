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
import { toMarkdownTable, stripEmailDomain, ensureEmailDomain, applyPendingOverrides } from '../../cliPure.ts'
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
import {
  listMailRedirections,
  prepareAddMailRedirection,
  applyAddMailRedirection,
  prepareRemoveMailRedirection,
  applyRemoveMailRedirection,
  type MailRedirection,
} from '../../commands/mailRedirect.ts'

export type EmailInitialPanel =
  | { kind: 'addAccount' | 'editAccount' | 'deleteAccount'; id?: string; values?: Record<string, string | undefined> }
  | { kind: 'addRedirection' | 'deleteRedirection'; id?: string; values?: Record<string, string | undefined> }

export type EmailScreenProps = {
  initialFilter?: string
  initialDomain?: string
  initialAccount?: string
  initialPanel?: EmailInitialPanel
  /** Session-pinned domain (`ovhtool <domain>`, cli.ts) — only when the resolved domain still matches this is it shown domain-first and does Escape fall back home instead of to the domain picker. */
  pinnedDomain?: string
  onHome: () => void
}

/** One row of the unified table — a mail account or a redirection, tagged so actions/columns can branch on `kind` (accounts and redirections don't share a natural row shape, e.g. a redirection has no size/description). */
type EmailEntry = { kind: 'account'; item: MailAccount } | { kind: 'redirection'; item: MailRedirection }

type PanelKind = EmailInitialPanel['kind'] | null

export function EmailScreen({ initialDomain, initialAccount, initialPanel, onHome, initialFilter, pinnedDomain }: EmailScreenProps) {
  const domainContext = useDomainContext(initialDomain, initialAccount, listMailDomains)
  const { phase, revealDomainPicker, goBack } = domainContext

  if (phase.kind !== 'ready') {
    return <DomainContextGate domainLabel="domain" domainContext={domainContext} onHome={onHome} />
  }

  return (
    <EmailDashboard
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

function EmailDashboard({
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
  initialPanel?: EmailInitialPanel
  initialFilter?: string
  isDomainPinned: boolean
  onHome: () => void
  onBack: () => boolean
  onRevealPicker: () => void
}) {
  const client = useMemo(() => createOvhClient(profile), [profile])

  // Two independent fetches (OVH exposes accounts and redirections as
  // separate endpoints) reconciled into one table below — each keeps its own
  // pending-overrides map (see mail.ts/mailRedirect.ts) since a mutation on
  // one never touches the other's listing.
  const accountsPendingRef = useRef(new Map<string, MailAccount | 'deleted'>())
  const {
    status: accountsStatus,
    data: accountsData,
    error: accountsError,
    revalidating: accountsRevalidating,
    reload: reloadAccounts,
    mutate: mutateAccounts,
  } = useAsyncData(
    async () => applyPendingOverrides(await listMailAccounts(client, domain), accountsPendingRef.current, (a) => a.accountName),
    [client, domain],
    `mail:${accountName}:${domain}`,
  )
  const accounts = accountsData ?? []

  const redirectionsPendingRef = useRef(new Map<string, MailRedirection | 'deleted'>())
  const {
    status: redirectionsStatus,
    data: redirectionsData,
    error: redirectionsError,
    revalidating: redirectionsRevalidating,
    reload: reloadRedirections,
    mutate: mutateRedirections,
  } = useAsyncData(
    async () => applyPendingOverrides(await listMailRedirections(client, domain), redirectionsPendingRef.current, (r) => r.id),
    [client, domain],
    `mailRedirect:${accountName}:${domain}`,
  )
  const redirections = redirectionsData ?? []

  const hasData = accountsData !== null || redirectionsData !== null
  const status = accountsStatus === 'error' && redirectionsStatus === 'error' ? 'error' : accountsStatus === 'loading' || redirectionsStatus === 'loading' ? 'loading' : 'ready'
  const loadError = accountsData === null ? accountsError : redirectionsData === null ? redirectionsError : null
  const revalidating = accountsRevalidating || redirectionsRevalidating

  function reload() {
    reloadAccounts()
    reloadRedirections()
  }

  const entries: EmailEntry[] = useMemo(
    () => [...accounts.map((item): EmailEntry => ({ kind: 'account', item })), ...redirections.map((item): EmailEntry => ({ kind: 'redirection', item }))],
    [accounts, redirections],
  )

  const columns: TableColumn<EmailEntry>[] = [
    { header: 'type', render: (e) => (e.kind === 'account' ? 'account' : 'redirect'), width: 10 },
    { header: 'address', render: (e) => (e.kind === 'account' ? e.item.email : e.item.from), width: 32 },
    { header: 'to / size', render: (e) => (e.kind === 'account' ? `${e.item.size} MB` : e.item.to), width: 24 },
    { header: 'description', render: (e) => (e.kind === 'account' ? e.item.description || '' : ''), width: null },
  ]
  const searchFields = (e: EmailEntry) =>
    e.kind === 'account' ? [e.item.accountName, e.item.email, e.item.description || ''] : [e.item.id, e.item.from, e.item.to]

  const { filter, setFilter, selectedIndex, setSelectedIndex } = useTableSelection(initialFilter ?? '')
  const filtered = visibleTableRows(entries, columns, filter, searchFields)
  const selected = filtered[selectedIndex]

  const [panel, setPanel] = useState<PanelKind>(initialPanel?.kind ?? null)
  const [panelAccount, setPanelAccount] = useState<MailAccount | null>(null)
  const [panelRedirection, setPanelRedirection] = useState<MailRedirection | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | undefined>()
  const [panelError, setPanelError] = useState<string | undefined>()
  const initialPanelRef = useRef(initialPanel)

  useEffect(() => {
    const spec = initialPanelRef.current
    if (!spec || status !== 'ready') return
    if (spec.kind === 'editAccount' || spec.kind === 'deleteAccount') {
      const found = accounts.find((a) => a.accountName === spec.id)
      if (found) setPanelAccount(found)
      else setPanel(null)
    } else if (spec.kind === 'deleteRedirection') {
      const found = redirections.find((r) => r.id === spec.id)
      if (found) setPanelRedirection(found)
      else setPanel(null)
    }
    initialPanelRef.current = undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  function closePanel() {
    setPanel(null)
    setPanelAccount(null)
    setPanelRedirection(null)
    setPanelError(undefined)
  }

  function onAccountMutationDone(message: string, name: string, change: MailAccount | 'deleted') {
    accountsPendingRef.current.set(name, change)
    closePanel()
    mutateAccounts((current) => (current ? applyPendingOverrides(current, new Map([[name, change]]), (a) => a.accountName) : current))
    reloadAccounts()
    setStatusMessage(message)
  }

  function onRedirectionMutationDone(message: string, id: string, change: MailRedirection | 'deleted') {
    redirectionsPendingRef.current.set(id, change)
    closePanel()
    mutateRedirections((current) => (current ? applyPendingOverrides(current, new Map([[id, change]]), (r) => r.id) : current))
    reloadRedirections()
    setStatusMessage(message)
  }

  function openEdit() {
    if (!selected || selected.kind !== 'account') return
    setPanelAccount(selected.item)
    setPanel('editAccount')
  }

  function openDelete() {
    if (!selected) return
    if (selected.kind === 'account') {
      setPanelAccount(selected.item)
      setPanel('deleteAccount')
    } else {
      setPanelRedirection(selected.item)
      setPanel('deleteRedirection')
    }
  }

  async function copyMarkdown() {
    const markdown = toMarkdownTable(
      ['type', 'address', 'to / size', 'description'],
      filtered.map((e) => [
        e.kind === 'account' ? 'account' : 'redirect',
        e.kind === 'account' ? e.item.email : e.item.from,
        e.kind === 'account' ? `${e.item.size} MB` : e.item.to,
        e.kind === 'account' ? e.item.description || '' : '',
      ]),
    )
    try {
      await copyToClipboard(markdown)
      setStatusMessage(`✔ ${filtered.length} row(s) copied`)
    } catch (err) {
      setPanelError(toOvhtoolError(err).message)
    }
  }

  // No update endpoint exists for redirections, so "change password" only
  // applies when the selected row is an account.
  const { bindings } = useKeymap(
    [
      { key: 'return', label: 'change password', when: selected?.kind === 'account' && panel === null, onTrigger: openEdit },
      { key: 'delete', label: 'delete', when: Boolean(selected) && panel === null, onTrigger: openDelete },
      { ctrl: 'n', label: 'add account', when: panel === null, onTrigger: () => setPanel('addAccount') },
      { ctrl: 'a', label: 'add redirect', when: panel === null, onTrigger: () => setPanel('addRedirection') },
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
    ],
  )

  return (
    <ScreenLayout header={<Header context={domain} pinned={isDomainPinned} revalidating={revalidating && hasData} />} footer={<Footer bindings={bindings} status={statusMessage} />}>
      {status === 'loading' && !hasData ? (
        <Spinner label="Loading mail…" />
      ) : loadError ? (
        <Alert message={toOvhtoolError(loadError).message} />
      ) : panel === null ? (
        <Table
          columns={columns}
          rows={entries}
          searchFields={searchFields}
          filter={filter}
          onFilterChange={setFilter}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={setSelectedIndex}
          emptyLabel="No mail account or redirection."
        />
      ) : panel === 'addAccount' ? (
        <CreateMailPanel
          domain={domain}
          initialValues={initialPanel?.kind === 'addAccount' ? initialPanel.values : undefined}
          client={client}
          onDone={(message, created) => onAccountMutationDone(message, created.accountName, created)}
          onCancel={closePanel}
          onError={setPanelError}
          error={panelError}
        />
      ) : panel === 'editAccount' && panelAccount ? (
        <PasswdMailPanel
          domain={domain}
          account={panelAccount}
          client={client}
          onDone={(message) => {
            closePanel()
            reloadAccounts()
            setStatusMessage(message)
          }}
          onCancel={closePanel}
          onError={setPanelError}
          error={panelError}
        />
      ) : panel === 'deleteAccount' && panelAccount ? (
        <DeleteMailPanel
          domain={domain}
          account={panelAccount}
          client={client}
          onDone={(message) => onAccountMutationDone(message, panelAccount.accountName, 'deleted')}
          onCancel={closePanel}
          onError={setPanelError}
          error={panelError}
        />
      ) : panel === 'addRedirection' ? (
        <AddRedirectionPanel
          domain={domain}
          initialValues={initialPanel?.kind === 'addRedirection' ? initialPanel.values : undefined}
          client={client}
          onDone={(message, created) => onRedirectionMutationDone(message, created.id, created)}
          onCancel={closePanel}
          onError={setPanelError}
          error={panelError}
        />
      ) : panel === 'deleteRedirection' && panelRedirection ? (
        <DeleteRedirectionPanel
          domain={domain}
          redirection={panelRedirection}
          client={client}
          onDone={(message) => onRedirectionMutationDone(message, panelRedirection.id, 'deleted')}
          onCancel={closePanel}
          onError={setPanelError}
          error={panelError}
        />
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

function CreateMailPanel({ domain, initialValues, client, onDone, onError, error }: Omit<MutationPanelProps, 'onDone'> & { onDone: (message: string, created: MailAccount) => void; initialValues?: Record<string, string | undefined> }) {
  const [accountName, setAccountName] = useState(initialValues?.accountName ?? '')
  const [password, setPassword] = useState('')
  const [size, setSize] = useState(initialValues?.size ?? '')
  const [description, setDescription] = useState(initialValues?.description ?? '')
  const [diff, setDiff] = useState<ActionDiff | null>(null)
  const [applying, setApplying] = useState(false)

  const fields: FormField[] = [
    { name: 'accountName', label: `Account name (@${domain})`, kind: 'text', value: accountName, onChange: setAccountName },
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
    setDiff(prepareCreateMailAccount({ domain, accountName: stripEmailDomain(accountName, domain), password, size: size ? parseInt(size, 10) : undefined, description: description || undefined }))
  }

  async function confirm() {
    if (!client) return
    setApplying(true)
    try {
      const created = await applyCreateMailAccount(client, { domain, accountName: stripEmailDomain(accountName, domain), password, size: size ? parseInt(size, 10) : undefined, description: description || undefined })
      onDone('✔ Mail account created', created)
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

function AddRedirectionPanel({ domain, initialValues, client, onDone, onError, error }: Omit<MutationPanelProps, 'onDone'> & { onDone: (message: string, created: MailRedirection) => void; initialValues?: Record<string, string | undefined> }) {
  const [from, setFrom] = useState(initialValues?.from ?? '')
  const [to, setTo] = useState(initialValues?.to ?? '')
  const [diff, setDiff] = useState<ActionDiff | null>(null)
  const [applying, setApplying] = useState(false)

  const fields: FormField[] = [
    { name: 'from', label: `From (@${domain})`, kind: 'text', value: from, onChange: setFrom },
    { name: 'to', label: 'To', kind: 'text', value: to, onChange: setTo },
  ]

  function submit() {
    if (!from.trim() || !to.trim()) {
      onError('"From" and "To" are required.')
      return
    }
    onError(undefined)
    setDiff(prepareAddMailRedirection({ domain, from: ensureEmailDomain(from, domain), to }))
  }

  async function confirm() {
    if (!client) return
    setApplying(true)
    try {
      const created = await applyAddMailRedirection(client, { domain, from: ensureEmailDomain(from, domain), to })
      onDone('✔ Redirection added', created)
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
