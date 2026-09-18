import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Text } from 'ink'
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
  prepareRemoveMailRedirection,
  applyRemoveMailRedirection,
  planRedirectionRecipients,
  prepareRedirectionChanges,
  applyRedirectionChanges,
  type MailRedirection,
  type RedirectionGroup,
} from '../../commands/mailRedirect.ts'
import { nextActiveIndex } from '../components/formNav.ts'
import { TextInput } from '../components/primitives/TextInput.tsx'
import { useTheme } from '../theme.ts'

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

/** One row of the unified table — a mail account or a single redirection, tagged so actions/columns can branch on `kind` (accounts and redirections don't share a natural row shape, e.g. a redirection has no size/description). One `from` address can have several redirections (several destinations); each still gets its own row so its `to` stays readable, but Enter opens all of them together for editing — see `redirectionGroupOf`. */
type EmailEntry = { kind: 'account'; item: MailAccount } | { kind: 'redirection'; item: MailRedirection }

type PanelKind = EmailInitialPanel['kind'] | 'editRedirection' | null

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

  // One row per redirection (not grouped by `from`) — a `Table` cell is a
  // single line of text (see Table.tsx), so joining several destinations
  // into one cell makes them unreadable past a couple of addresses. Actions
  // (Enter/Delete) still apply to every redirection sharing the selected
  // row's `from`, via `redirectionGroupOf` below.
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

  function redirectionGroupOf(redirection: MailRedirection): RedirectionGroup {
    return { from: redirection.from, redirections: redirections.filter((r) => r.from === redirection.from) }
  }

  const { filter, setFilter, selectedIndex, setSelectedIndex } = useTableSelection(initialFilter ?? '')
  const filtered = visibleTableRows(entries, columns, filter, searchFields)
  const selected = filtered[selectedIndex]

  const [panel, setPanel] = useState<PanelKind>(initialPanel?.kind ?? null)
  const [panelAccount, setPanelAccount] = useState<MailAccount | null>(null)
  // Deleting targets exactly the selected row's single redirection; editing
  // targets every redirection sharing its `from` (see redirectionGroupOf).
  const [panelRedirection, setPanelRedirection] = useState<MailRedirection | null>(null)
  const [panelRedirectionGroup, setPanelRedirectionGroup] = useState<RedirectionGroup | null>(null)
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
    setPanelRedirectionGroup(null)
    setPanelError(undefined)
  }

  function onAccountMutationDone(message: string, name: string, change: MailAccount | 'deleted') {
    accountsPendingRef.current.set(name, change)
    closePanel()
    mutateAccounts((current) => (current ? applyPendingOverrides(current, new Map([[name, change]]), (a) => a.accountName) : current))
    reloadAccounts()
    setStatusMessage(message)
  }

  // A redirection edit/create/delete can touch several redirections (one per
  // recipient) at once, so — unlike accounts — there's no single id to patch
  // optimistically into the cached list; just reload it.
  function onRedirectionsMutationDone(message: string) {
    closePanel()
    reloadRedirections()
    setStatusMessage(message)
  }

  function openEdit() {
    if (!selected) return
    if (selected.kind === 'account') {
      setPanelAccount(selected.item)
      setPanel('editAccount')
    } else {
      setPanelRedirectionGroup(redirectionGroupOf(selected.item))
      setPanel('editRedirection')
    }
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

  // OVH has no update endpoint for a redirection itself — editing one below
  // (RedirectionRecipientsPanel) works by diffing the desired recipient list
  // against the existing redirections and issuing the needed creates/deletes.
  const { bindings } = useKeymap(
    [
      { key: 'return', label: selected?.kind === 'account' ? 'change password' : 'edit redirection', when: Boolean(selected) && panel === null, onTrigger: openEdit },
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
        <RedirectionRecipientsPanel
          domain={domain}
          from={initialPanel?.kind === 'addRedirection' ? (initialPanel.values?.from ?? '') : ''}
          fromEditable
          existing={[]}
          initialTos={initialPanel?.kind === 'addRedirection' && initialPanel.values?.to ? [initialPanel.values.to] : undefined}
          client={client}
          onDone={onRedirectionsMutationDone}
          onCancel={closePanel}
          onError={setPanelError}
          error={panelError}
        />
      ) : panel === 'editRedirection' && panelRedirectionGroup ? (
        <RedirectionRecipientsPanel
          domain={domain}
          from={panelRedirectionGroup.from}
          fromEditable={false}
          existing={panelRedirectionGroup.redirections}
          client={client}
          onDone={onRedirectionsMutationDone}
          onCancel={closePanel}
          onError={setPanelError}
          error={panelError}
        />
      ) : panel === 'deleteRedirection' && panelRedirection ? (
        <DeleteRedirectionPanel
          domain={domain}
          redirection={panelRedirection}
          client={client}
          onDone={onRedirectionsMutationDone}
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

/**
 * Create or edit every redirection for one `from` address at once. There's
 * no OVH endpoint to change a redirection's `to` in place, so "editing"
 * means computing which existing redirections are no longer wanted and
 * which new destinations need creating (`planRedirectionRecipients`), then
 * previewing that as a batch of create/delete diffs before applying it.
 * `existing` is empty (and `fromEditable` true) when creating a brand new
 * group; editing an existing one keeps `from` fixed, since renaming it isn't
 * a thing OVH supports either — the recipients list is the only editable part.
 */
function RedirectionRecipientsPanel({
  domain,
  from: initialFrom,
  fromEditable,
  existing,
  initialTos,
  client,
  onDone,
  onCancel,
  onError,
  error,
}: Omit<MutationPanelProps, 'onDone'> & {
  from: string
  fromEditable: boolean
  existing: MailRedirection[]
  initialTos?: string[]
  onDone: (message: string) => void
}) {
  const { color } = useTheme()
  const [from, setFrom] = useState(initialFrom)
  const [tos, setTos] = useState<string[]>(existing.length ? existing.map((r) => r.to) : (initialTos?.length ? initialTos : ['']))
  const [activeIndex, setActiveIndex] = useState(0)
  const [diffs, setDiffs] = useState<ActionDiff[] | null>(null)
  const [applying, setApplying] = useState(false)

  const toStart = fromEditable ? 1 : 0
  const fieldCount = toStart + tos.length
  const advance = (delta: number) => setActiveIndex((i) => nextActiveIndex(i, fieldCount, delta))

  function setTo(index: number, value: string) {
    setTos((current) => current.map((v, i) => (i === index ? value : v)))
  }

  function addRecipient() {
    setTos((current) => [...current, ''])
    setActiveIndex(toStart + tos.length)
  }

  function removeRecipient(index: number) {
    setTos((current) => (current.length <= 1 ? [''] : current.filter((_, i) => i !== index)))
    setActiveIndex((i) => Math.max(toStart, i - 1))
  }

  function submit() {
    const trimmedFrom = from.trim()
    if (!trimmedFrom) {
      onError('"From" is required.')
      return
    }
    const desiredTos = [...new Set(tos.map((t) => t.trim()).filter(Boolean))]
    if (desiredTos.length === 0 && existing.length === 0) {
      onError('At least one recipient is required.')
      return
    }
    const { toDelete, toCreate } = planRedirectionRecipients(existing, desiredTos)
    const prepared = prepareRedirectionChanges({ domain, from: ensureEmailDomain(trimmedFrom, domain), toDelete, toCreate })
    if (prepared.length === 0) {
      onError('No changes to apply.')
      return
    }
    onError(undefined)
    setDiffs(prepared)
  }

  async function confirm() {
    if (!client || !diffs) return
    setApplying(true)
    try {
      const desiredTos = [...new Set(tos.map((t) => t.trim()).filter(Boolean))]
      const { toDelete, toCreate } = planRedirectionRecipients(existing, desiredTos)
      await applyRedirectionChanges(client, { domain, from: ensureEmailDomain(from.trim(), domain), toDelete, toCreate })
      onDone(`✔ Redirections updated for ${ensureEmailDomain(from.trim(), domain)}`)
    } catch (err) {
      setApplying(false)
      onError(toOvhtoolError(err).message)
      setDiffs(null)
    }
  }

  const { bindings } = useKeymap(
    [
      { key: 'tab', label: 'next field', onTrigger: () => advance(1) },
      { key: 'tab', shift: true, label: 'previous field', onTrigger: () => advance(-1) },
      { key: 'downArrow', label: 'next field', onTrigger: () => advance(1) },
      { key: 'upArrow', label: 'previous field', onTrigger: () => advance(-1) },
      { ctrl: 'n', label: 'add recipient', onTrigger: addRecipient },
      { key: 'delete', label: 'remove recipient', when: activeIndex >= toStart, onTrigger: () => removeRecipient(activeIndex - toStart) },
    ],
    { isActive: diffs === null },
  )

  return (
    <Panel title={fromEditable ? 'Add a redirection' : `Edit redirections for ${from}`}>
      {error ? <Alert message={error} /> : null}
      {diffs ? (
        applying ? (
          <Spinner label="Applying…" />
        ) : (
          <Box flexDirection="column">
            {diffs.map((diff, index) => (
              <Diff key={index} diff={diff} />
            ))}
            <ConfirmInput onConfirm={confirm} onCancel={() => setDiffs(null)} />
          </Box>
        )
      ) : (
        <Box flexDirection="column">
          {fromEditable ? (
            <Box>
              <Box width={16}>
                <Text bold={activeIndex === 0} color={activeIndex === 0 ? color : undefined}>
                  {`From (@${domain})`}
                </Text>
              </Box>
              <TextInput value={from} onChange={setFrom} onSubmit={() => advance(1)} isDisabled={activeIndex !== 0} />
            </Box>
          ) : null}
          {tos.map((to, index) => {
            const fieldIndex = toStart + index
            const isActive = activeIndex === fieldIndex
            const isLast = fieldIndex === fieldCount - 1
            return (
              <Box key={index}>
                <Box width={16}>
                  <Text bold={isActive} color={isActive ? color : undefined}>
                    {index === 0 ? 'To' : ''}
                  </Text>
                </Box>
                <TextInput value={to} onChange={(v) => setTo(index, v)} onSubmit={() => (isLast ? submit() : advance(1))} isDisabled={!isActive} />
              </Box>
            )
          })}
          <Box marginTop={1}>
            <Text dimColor>{bindings.join(' · ')} · ↵ confirm field (last field = submit)</Text>
          </Box>
        </Box>
      )}
    </Panel>
  )
}

function DeleteRedirectionPanel({ domain, redirection, client, onDone, onCancel, onError, error }: MutationPanelProps & { redirection: MailRedirection; onDone: (message: string) => void }) {
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
    <Panel title={`Delete ${redirection.from} → ${redirection.to}`}>
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
