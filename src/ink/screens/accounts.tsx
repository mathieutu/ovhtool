import React, { useState } from 'react'
import { Box, Text } from 'ink'
import { Header } from '../components/Header.tsx'
import { Footer } from '../components/Footer.tsx'
import { ScreenLayout } from '../components/ScreenLayout.tsx'
import { Table, useTableSelection, useTerminalSize, visibleTableRows, type TableColumn } from '../components/Table.tsx'
import { Panel } from '../components/Panel.tsx'
import { Form, type FormField } from '../components/Form.tsx'
import { TextInput } from '../components/primitives/TextInput.tsx'
import { ConfirmInput } from '../components/primitives/ConfirmInput.tsx'
import { Spinner } from '../components/primitives/Spinner.tsx'
import { Alert } from '../components/primitives/Alert.tsx'
import { useKeymap } from '../hooks/useKeymap.ts'
import { useAsyncData } from '../hooks/useAsyncData.ts'
import { toMarkdownTable } from '../../cliPure.ts'
import { loadConfig, saveConfig, requireProfile, clearTableCache } from '../../config.ts'
import { createOvhClient } from '../../ovhClient.ts'
import { copyToClipboard } from '../../clipboard.ts'
import { toOvhtoolError } from '../../errors.ts'
import { listAccounts, setDefaultAccount, removeAccount, forgetDomain, whoami, type AccountSummary } from '../../commands/accounts.ts'
import { useTheme } from '../theme.ts'
import { AuthSetupPanel, type AuthSetupValues } from '../components/AuthSetupPanel.tsx'

export type AccountsInitialPanel = { kind: 'whoami'; domain?: string } | ({ kind: 'auth' } & AuthSetupValues)

export type AccountsScreenProps = {
  initialPanel?: AccountsInitialPanel
  onHome: () => void
}

type ActiveTable = 'profiles' | 'cache'
type PanelKind = 'whoami' | 'auth' | null

type CacheRow = { domain: string; account: string }

export function AccountsScreen({ initialPanel, onHome }: AccountsScreenProps) {
  const { color } = useTheme()
  const [reloadKey, setReloadKey] = useState(0)
  const { status, data, error: loadError } = useAsyncData(async () => loadConfig(), [reloadKey])
  const config = data
  const profiles: AccountSummary[] = config ? listAccounts(config) : []
  const cacheRows: CacheRow[] = config ? Object.entries(config.domainCache).map(([domain, account]) => ({ domain, account })) : []

  const [activeTable, setActiveTable] = useState<ActiveTable>('profiles')
  const profilesSel = useTableSelection()
  const cacheSel = useTableSelection()

  // Two tables share one screen: each gets half of
  // the rows a single full-screen `Table` would (its own reserved-rows
  // budget already accounts for Header/Footer, split further by the extra
  // section-title lines and the second table's own filter/header lines).
  const { rows: terminalRows } = useTerminalSize()
  const halfTableRows = Math.max(Math.floor((terminalRows - 13) / 2), 3)

  const profileColumns: TableColumn<AccountSummary>[] = [
    { header: 'name', render: (a) => a.name, width: 20 },
    { header: 'endpoint', render: (a) => a.endpoint, width: 12 },
    { header: 'default', render: (a) => (a.isDefault ? 'yes' : 'no'), width: null },
  ]
  const profileSearchFields = (a: AccountSummary) => [a.name, a.endpoint]

  const cacheColumns: TableColumn<CacheRow>[] = [
    { header: 'domain', render: (c) => c.domain, width: 30 },
    { header: 'account', render: (c) => c.account, width: null },
  ]
  const cacheSearchFields = (c: CacheRow) => [c.domain, c.account]

  const filteredProfiles = visibleTableRows(profiles, profileColumns, profilesSel.filter, profileSearchFields)
  const filteredCache = visibleTableRows(cacheRows, cacheColumns, cacheSel.filter, cacheSearchFields)
  const selectedProfile = filteredProfiles[profilesSel.selectedIndex]
  const selectedCache = filteredCache[cacheSel.selectedIndex]

  const [panel, setPanel] = useState<PanelKind>(initialPanel?.kind ?? null)
  const [statusMessage, setStatusMessage] = useState<string | undefined>()
  const [panelError, setPanelError] = useState<string | undefined>()

  function reload() {
    setReloadKey((k) => k + 1)
  }

  function closePanel() {
    setPanel(null)
    setPanelError(undefined)
  }

  function setDefault() {
    if (!selectedProfile || !config) return
    saveConfig(setDefaultAccount(config, selectedProfile.name))
    setStatusMessage(`✔ "${selectedProfile.name}" is now the default account`)
    reload()
  }

  function removeProfile() {
    if (!selectedProfile || !config) return
    saveConfig(removeAccount(config, selectedProfile.name))
    setStatusMessage(`✔ Account "${selectedProfile.name}" removed`)
    reload()
  }

  function forgetCacheDomain() {
    if (!selectedCache || !config) return
    saveConfig(forgetDomain(config, selectedCache.domain))
    setStatusMessage(`✔ "${selectedCache.domain}" removed from cache`)
    reload()
  }

  /** Clears the DNS/Mail/Redirections table-response cache (persisted alongside profiles/domainCache in config.json) — never touches profiles or the domain→account cache above. */
  function clearCache() {
    if (!config) return
    saveConfig(clearTableCache(config))
    setStatusMessage('✔ Table cache cleared')
    reload()
  }

  const currentFilter = activeTable === 'profiles' ? profilesSel.filter : cacheSel.filter
  const setCurrentFilter = activeTable === 'profiles' ? profilesSel.setFilter : cacheSel.setFilter

  async function copyMarkdown() {
    const markdown =
      activeTable === 'profiles'
        ? toMarkdownTable(
            ['name', 'endpoint', 'default'],
            filteredProfiles.map((a) => [a.name, a.endpoint, a.isDefault ? 'yes' : 'no']),
          )
        : toMarkdownTable(
            ['domain', 'account'],
            filteredCache.map((c) => [c.domain, c.account]),
          )
    const count = activeTable === 'profiles' ? filteredProfiles.length : filteredCache.length
    try {
      await copyToClipboard(markdown)
      setStatusMessage(`✔ ${count} row(s) copied`)
    } catch (err) {
      setPanelError(toOvhtoolError(err).message)
    }
  }

  const { bindings } = useKeymap([
    { key: 'return', label: 'set as default', when: activeTable === 'profiles' && Boolean(selectedProfile) && panel === null, onTrigger: setDefault },
    { key: 'delete', label: 'remove', when: activeTable === 'profiles' && Boolean(selectedProfile) && panel === null, onTrigger: removeProfile },
    { key: 'delete', label: 'forget', when: activeTable === 'cache' && Boolean(selectedCache) && panel === null, onTrigger: forgetCacheDomain },
    { ctrl: 'n', label: 'whoami (domain)', when: activeTable === 'cache' && panel === null, onTrigger: () => setPanel('whoami') },
    { ctrl: 'n', label: 'new account', when: activeTable === 'profiles' && panel === null, onTrigger: () => setPanel('auth') },
    { ctrl: 'x', label: 'clear cache', when: panel === null, onTrigger: clearCache },
    { ctrl: 'y', label: 'copy', when: panel === null, onTrigger: () => void copyMarkdown() },
    { ctrl: 'r', label: 'refresh', when: panel === null, onTrigger: reload },
    { key: 'tab', label: 'switch table', when: panel === null, onTrigger: () => setActiveTable((t) => (t === 'profiles' ? 'cache' : 'profiles')) },
    {
      key: 'escape',
      label: 'back',
      onTrigger: () => {
        if (panel !== null) closePanel()
        else if (currentFilter !== '') setCurrentFilter('')
        else onHome()
      },
    },
  ])

  if (status === 'loading' && !config) {
    return (
      <ScreenLayout header={<Header />} footer={<Footer bindings={[]} />}>
        <Spinner label="Loading configuration…" />
      </ScreenLayout>
    )
  }

  if (loadError || !config) {
    return (
      <ScreenLayout header={<Header />} footer={<Footer bindings={['Esc back']} />}>
        <Alert message={loadError ? toOvhtoolError(loadError).message : 'Configuration not found'} />
      </ScreenLayout>
    )
  }

  return (
    <ScreenLayout header={<Header />} footer={<Footer bindings={bindings} status={statusMessage} />}>
      {panel === 'whoami' ? (
        <WhoamiPanel initialDomain={initialPanel?.kind === 'whoami' ? initialPanel.domain : undefined} onDone={(message) => { closePanel(); reload(); setStatusMessage(message) }} onCancel={closePanel} onError={setPanelError} error={panelError} />
      ) : panel === 'auth' ? (
        <AuthSetupPanel initial={initialPanel?.kind === 'auth' ? initialPanel : undefined} onDone={(message) => { closePanel(); reload(); setStatusMessage(message) }} />
      ) : (
        <Box flexDirection="column">
          <Text bold color={activeTable === 'profiles' ? color : undefined}>
            Configured accounts {activeTable === 'profiles' ? '(active)' : ''}
          </Text>
          <Table
            columns={profileColumns}
            rows={profiles}
            searchFields={profileSearchFields}
            filter={profilesSel.filter}
            onFilterChange={profilesSel.setFilter}
            selectedIndex={profilesSel.selectedIndex}
            onSelectedIndexChange={profilesSel.setSelectedIndex}
            emptyLabel="No account configured."
            isActive={activeTable === 'profiles'}
            maxVisibleRows={halfTableRows}
          />
          <Box marginTop={1}>
            <Text bold color={activeTable === 'cache' ? color : undefined}>
              Domain → account cache {activeTable === 'cache' ? '(active)' : ''}
            </Text>
          </Box>
          <Table
            columns={cacheColumns}
            rows={cacheRows}
            searchFields={cacheSearchFields}
            filter={cacheSel.filter}
            onFilterChange={cacheSel.setFilter}
            selectedIndex={cacheSel.selectedIndex}
            onSelectedIndexChange={cacheSel.setSelectedIndex}
            emptyLabel="Empty cache."
            isActive={activeTable === 'cache'}
            maxVisibleRows={halfTableRows}
          />
        </Box>
      )}
    </ScreenLayout>
  )
}

function WhoamiPanel({ initialDomain, onDone, onCancel, onError, error }: { initialDomain?: string | undefined; onDone: (message: string) => void; onCancel: () => void; onError: (message: string | undefined) => void; error?: string | undefined }) {
  const [domain, setDomain] = useState(initialDomain ?? '')
  const [result, setResult] = useState<{ candidates: string[]; cached: boolean } | null>(null)
  const [applying, setApplying] = useState(false)

  const fields: FormField[] = [{ name: 'domain', label: 'Domain', kind: 'text', value: domain, onChange: setDomain }]

  async function submit() {
    if (!domain.trim()) {
      onError('Domain is required.')
      return
    }
    onError(undefined)
    setApplying(true)
    try {
      const config = loadConfig()
      const { result: whoamiResult, updatedConfig } = await whoami(config, domain, (name) => createOvhClient(requireProfile(config, name)))
      if (updatedConfig !== config) saveConfig(updatedConfig)
      setResult(whoamiResult)
      setApplying(false)
    } catch (err) {
      setApplying(false)
      onError(toOvhtoolError(err).message)
    }
  }

  return (
    <Panel title="Find an account by domain (whoami)">
      {error ? <Alert message={error} /> : null}
      {applying ? (
        <Spinner label="Searching…" />
      ) : result ? (
        <Box flexDirection="column">
          {result.candidates.length === 0 ? (
            <Text color="yellow">No account has access to "{domain}".</Text>
          ) : (
            <Text color="green">
              Accounts with access to "{domain}": {result.candidates.join(', ')}
              {result.cached ? ' (cached)' : ''}
            </Text>
          )}
          <ConfirmInput onConfirm={() => onDone('✔ Search complete')} onCancel={onCancel} />
        </Box>
      ) : (
        <Form fields={fields} onSubmit={submit} />
      )}
    </Panel>
  )
}
