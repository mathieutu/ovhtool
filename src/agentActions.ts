// Agent-mode command orchestration: flag-driven, never prompts, no Ink/React
// involvement whatsoever — this is what runs under --json or off a TTY.

import { assertNotConflictingFlags, filterRows, toMarkdownTable } from './cliPure.ts'
import { fullDomain } from './cliPure.ts'
import { copyToClipboard } from './clipboard.ts'
import { ENDPOINTS, type Config, type Endpoint, loadConfig, saveConfig, requireProfile, withCachedAccount } from './config.ts'
import { createOvhClient, createBootstrapOvhClient, type OvhClient } from './ovhClient.ts'
import { resolveAccount, type ResolvedAccount } from './accountResolver.ts'
import { ValidationError } from './errors.ts'
import { type ActionDiff, isNoop } from './diff.ts'

import {
  DNS_RECORD_TYPES,
  type DnsRecord,
  type DnsRecordType,
  type AddDnsRecordParams,
  type UpdateDnsRecordParams,
  assertValidRecordType,
  listDnsRecords,
  fetchDnsRecord,
  prepareAddDnsRecord,
  applyAddDnsRecord,
  prepareUpdateDnsRecord,
  applyUpdateDnsRecord,
  prepareDeleteDnsRecord,
  applyDeleteDnsRecord,
} from './commands/dns.ts'

import {
  type MailAccount,
  type CreateMailAccountParams,
  listMailAccounts,
  fetchMailAccount,
  prepareCreateMailAccount,
  applyCreateMailAccount,
  prepareDeleteMailAccount,
  applyDeleteMailAccount,
  preparePasswdMailAccount,
  applyChangeMailPassword,
} from './commands/mail.ts'

import {
  type MailRedirection,
  type AddMailRedirectionParams,
  listMailRedirections,
  fetchMailRedirection,
  prepareAddMailRedirection,
  applyAddMailRedirection,
  prepareRemoveMailRedirection,
  applyRemoveMailRedirection,
} from './commands/mailRedirect.ts'

import { type AccountSummary, listAccounts, setDefaultAccount, removeAccount, forgetDomain, checkDomainAccess, whoami } from './commands/accounts.ts'

import { requestCredential, buildProfile } from './commands/auth.ts'

export type Opts = Record<string, any>

export type Output = { json: boolean; write: (data: unknown) => void; log: (text: string) => void }

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function requireValue(value: string | undefined, flagName: string): string {
  if (value !== undefined && value !== '') return value
  throw new ValidationError(`${flagName} is required.`, 'missing_option')
}

function requireArg(value: string | undefined, argLabel: string): string {
  if (value !== undefined && value !== '') return value
  throw new ValidationError(`The <${argLabel}> argument is required.`, 'missing_argument')
}

function parseRequiredInt(value: string, flagName: string): number {
  const parsed = parseInt(value, 10)
  if (Number.isNaN(parsed)) {
    throw new ValidationError(`${flagName} must be a number, got "${value}".`, 'invalid_option')
  }
  return parsed
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '')
}

async function acquirePassword(passwordStdin: boolean): Promise<string> {
  if (!passwordStdin) {
    throw new ValidationError('Password required: use --password-stdin in agent mode.', 'password_required')
  }
  return readStdin()
}

function resolveRecordType(optionType: string | undefined): DnsRecordType {
  if (!optionType) {
    throw new ValidationError(`--type is required (possible values: ${DNS_RECORD_TYPES.join(', ')})`, 'missing_type')
  }
  assertValidRecordType(optionType)
  return optionType
}

async function pickDomainArg(value: string | undefined, argLabel: string, config: Config, explicitAccount: string | undefined): Promise<{ domain: string; resolved: ResolvedAccount }> {
  const domain = requireArg(value, argLabel)
  const resolved = await resolveAccount({
    config,
    domain,
    explicitAccount,
    mode: 'agent',
    checkAccess: (name) => checkDomainAccess(createOvhClient(requireProfile(config, name)), domain),
    promptSelect: () => {
      throw new ValidationError('Unreachable in agent mode.', 'unreachable')
    },
  })
  if (resolved.shouldCache) {
    saveConfig(withCachedAccount(config, domain, resolved.name))
  }
  return { domain, resolved }
}

async function resolveDnsRecord(client: OvhClient, zone: string, value: string | undefined): Promise<DnsRecord> {
  return fetchDnsRecord(client, zone, parseRequiredInt(requireValue(value, '--id'), '--id'))
}

async function resolveMailAccountName(value: string | undefined): Promise<string> {
  return requireValue(value, '--account-name')
}

async function resolveMailRedirection(client: OvhClient, domain: string, value: string | undefined): Promise<MailRedirection> {
  return fetchMailRedirection(client, domain, requireValue(value, '--id'))
}

// ---------------------------------------------------------------------------
// Diff / confirmation (agent mode: --yes or --dry-run only, never a prompt)
// ---------------------------------------------------------------------------

type ActionOutcome<T> = { applied: boolean; cancelled: boolean; diff: ActionDiff; result?: T }

async function confirmAndApply<T>(flags: { yes: boolean; dryRun: boolean }, diff: ActionDiff, apply: () => Promise<T>): Promise<ActionOutcome<T>> {
  assertNotConflictingFlags(flags.yes, flags.dryRun)

  if (isNoop(diff)) return { applied: false, cancelled: false, diff }
  if (flags.dryRun) return { applied: false, cancelled: false, diff }
  if (flags.yes) {
    const result = await apply()
    return { applied: true, cancelled: false, diff, result }
  }
  throw new ValidationError(
    'Confirmation required before applying this change: add --dry-run to preview the diff first (recommended), or --yes to apply it directly.',
    'confirmation_required',
  )
}

function outputActionOutcome(out: Output, accountName: string, outcome: ActionOutcome<unknown>): void {
  if (out.json) {
    out.write({ account: accountName, applied: outcome.applied, cancelled: outcome.cancelled, diff: outcome.diff, result: outcome.result })
    return
  }
  if (isNoop(outcome.diff)) out.log('No change.')
  else if (outcome.applied) out.log('Applied.')
  else out.log('(dry-run) No change applied.')
}

// ---------------------------------------------------------------------------
// List presentation (json / --copy / plain Markdown table — never the interactive table)
// ---------------------------------------------------------------------------

type ListPresentation<T> = {
  header: string[]
  row: (item: T) => (string | number)[]
  searchFields: (item: T) => (string | number)[]
}

async function presentList<T>(out: Output, items: T[], o: Opts, presentation: ListPresentation<T>): Promise<void> {
  const filtered = filterRows(items, o.search, presentation.searchFields)

  if (out.json) {
    out.write(filtered)
    return
  }
  if (o.copy) {
    await copyToClipboard(toMarkdownTable(presentation.header, filtered.map(presentation.row)))
    out.log(`(${filtered.length} row(s) copied to clipboard)`)
    return
  }
  out.log(toMarkdownTable(presentation.header, filtered.map(presentation.row)))
}

// ---------------------------------------------------------------------------
// DNS
// ---------------------------------------------------------------------------

export async function dnsList(out: Output, zone: string | undefined, o: Opts): Promise<void> {
  if (o.type) assertValidRecordType(o.type)
  const config = loadConfig()
  const picked = await pickDomainArg(zone, 'zone', config, o.account)
  const client = createOvhClient(picked.resolved.profile)
  const records = await listDnsRecords(client, picked.domain, o.type as DnsRecordType | undefined)

  await presentList(out, records, o, {
    header: ['id', 'type', 'domain', 'target', 'ttl'],
    row: (r) => [r.id, r.fieldType, fullDomain(picked.domain, r.subDomain), r.target, r.ttl],
    searchFields: (r) => [r.id, r.fieldType, fullDomain(picked.domain, r.subDomain), r.target],
  })
}

export async function dnsAdd(out: Output, zone: string | undefined, o: Opts): Promise<void> {
  const config = loadConfig()
  const picked = await pickDomainArg(zone, 'zone', config, o.account)
  const client = createOvhClient(picked.resolved.profile)
  const fieldType = resolveRecordType(o.type)
  const subDomain = requireValue(o.subdomain, '--subdomain')
  const target = requireValue(o.value, '--value')
  const params: AddDnsRecordParams = { zone: picked.domain, subDomain, target, fieldType, ttl: o.ttl }
  const diff = prepareAddDnsRecord(params)
  const outcome = await confirmAndApply({ yes: Boolean(o.yes), dryRun: Boolean(o.dryRun) }, diff, () => applyAddDnsRecord(client, params))
  outputActionOutcome(out, picked.resolved.name, outcome)
}

export async function dnsUpdate(out: Output, zone: string | undefined, o: Opts): Promise<void> {
  if (o.value === undefined && o.subdomain === undefined && o.ttl === undefined) {
    throw new ValidationError('At least one of --value, --subdomain or --ttl is required.', 'nothing_to_update')
  }
  const config = loadConfig()
  const picked = await pickDomainArg(zone, 'zone', config, o.account)
  const client = createOvhClient(picked.resolved.profile)
  const before = await resolveDnsRecord(client, picked.domain, o.id)
  const params: UpdateDnsRecordParams = { zone: picked.domain, id: before.id, subDomain: o.subdomain, target: o.value, ttl: o.ttl }
  const diff = prepareUpdateDnsRecord(before, params)
  const outcome = await confirmAndApply({ yes: Boolean(o.yes), dryRun: Boolean(o.dryRun) }, diff, () => applyUpdateDnsRecord(client, params))
  outputActionOutcome(out, picked.resolved.name, outcome)
}

export async function dnsDelete(out: Output, zone: string | undefined, o: Opts): Promise<void> {
  const config = loadConfig()
  const picked = await pickDomainArg(zone, 'zone', config, o.account)
  const client = createOvhClient(picked.resolved.profile)
  const before = await resolveDnsRecord(client, picked.domain, o.id)
  const diff = prepareDeleteDnsRecord(before)
  const outcome = await confirmAndApply({ yes: Boolean(o.yes), dryRun: Boolean(o.dryRun) }, diff, () => applyDeleteDnsRecord(client, picked.domain, before.id))
  outputActionOutcome(out, picked.resolved.name, outcome)
}

// ---------------------------------------------------------------------------
// Mail
// ---------------------------------------------------------------------------

export async function mailList(out: Output, domain: string | undefined, o: Opts): Promise<void> {
  const config = loadConfig()
  const picked = await pickDomainArg(domain, 'domain', config, o.account)
  const client = createOvhClient(picked.resolved.profile)
  const accounts = await listMailAccounts(client, picked.domain)

  await presentList(out, accounts, o, {
    header: ['accountName', 'email', 'size (MB)', 'description'],
    row: (a) => [a.accountName, a.email, a.size, a.description || ''],
    searchFields: (a) => [a.accountName, a.email, a.description || ''],
  })
}

export async function mailCreate(out: Output, domain: string | undefined, o: Opts): Promise<void> {
  const config = loadConfig()
  const picked = await pickDomainArg(domain, 'domain', config, o.account)
  const client = createOvhClient(picked.resolved.profile)
  const accountName = requireValue(o.accountName, '--account-name')
  const dryRun = Boolean(o.dryRun)
  const password = dryRun ? '' : await acquirePassword(Boolean(o.passwordStdin))
  const params: CreateMailAccountParams = { domain: picked.domain, accountName, password, size: o.size, description: o.description }
  const diff = prepareCreateMailAccount(params)
  const outcome = await confirmAndApply({ yes: Boolean(o.yes), dryRun }, diff, () => applyCreateMailAccount(client, params))
  outputActionOutcome(out, picked.resolved.name, outcome)
}

export async function mailDelete(out: Output, domain: string | undefined, o: Opts): Promise<void> {
  const config = loadConfig()
  const picked = await pickDomainArg(domain, 'domain', config, o.account)
  const client = createOvhClient(picked.resolved.profile)
  const accountName = await resolveMailAccountName(o.accountName)
  const before = await fetchMailAccount(client, picked.domain, accountName)
  const diff = prepareDeleteMailAccount(before)
  const outcome = await confirmAndApply({ yes: Boolean(o.yes), dryRun: Boolean(o.dryRun) }, diff, () => applyDeleteMailAccount(client, picked.domain, accountName))
  outputActionOutcome(out, picked.resolved.name, outcome)
}

export async function mailPasswd(out: Output, domain: string | undefined, o: Opts): Promise<void> {
  const config = loadConfig()
  const picked = await pickDomainArg(domain, 'domain', config, o.account)
  const client = createOvhClient(picked.resolved.profile)
  const accountName = await resolveMailAccountName(o.accountName)
  const dryRun = Boolean(o.dryRun)
  const newPassword = dryRun ? '' : await acquirePassword(Boolean(o.passwordStdin))
  const diff = preparePasswdMailAccount()
  const outcome = await confirmAndApply({ yes: Boolean(o.yes), dryRun }, diff, () =>
    applyChangeMailPassword(client, { domain: picked.domain, accountName, password: newPassword }),
  )
  outputActionOutcome(out, picked.resolved.name, outcome)
}

// ---------------------------------------------------------------------------
// Mail redirections
// ---------------------------------------------------------------------------

export async function mailRedirectList(out: Output, domain: string | undefined, o: Opts): Promise<void> {
  const config = loadConfig()
  const picked = await pickDomainArg(domain, 'domain', config, o.account)
  const client = createOvhClient(picked.resolved.profile)
  const redirections = await listMailRedirections(client, picked.domain, o.from)

  await presentList(out, redirections, o, {
    header: ['id', 'from', 'to'],
    row: (r) => [r.id, r.from, r.to],
    searchFields: (r) => [r.id, r.from, r.to],
  })
}

export async function mailRedirectAdd(out: Output, domain: string | undefined, o: Opts): Promise<void> {
  const config = loadConfig()
  const picked = await pickDomainArg(domain, 'domain', config, o.account)
  const client = createOvhClient(picked.resolved.profile)
  const from = requireValue(o.from, '--from')
  const to = requireValue(o.to, '--to')
  const params: AddMailRedirectionParams = { domain: picked.domain, from, to }
  const diff = prepareAddMailRedirection(params)
  const outcome = await confirmAndApply({ yes: Boolean(o.yes), dryRun: Boolean(o.dryRun) }, diff, () => applyAddMailRedirection(client, params))
  outputActionOutcome(out, picked.resolved.name, outcome)
}

export async function mailRedirectRemove(out: Output, domain: string | undefined, o: Opts): Promise<void> {
  const config = loadConfig()
  const picked = await pickDomainArg(domain, 'domain', config, o.account)
  const client = createOvhClient(picked.resolved.profile)
  const before = await resolveMailRedirection(client, picked.domain, o.id)
  const diff = prepareRemoveMailRedirection(before)
  const outcome = await confirmAndApply({ yes: Boolean(o.yes), dryRun: Boolean(o.dryRun) }, diff, () =>
    applyRemoveMailRedirection(client, picked.domain, before.id),
  )
  outputActionOutcome(out, picked.resolved.name, outcome)
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function accountsListCmd(out: Output, o: Opts = {}): Promise<void> {
  const config = loadConfig()
  const accounts = listAccounts(config)
  await presentList(out, accounts, o, {
    header: ['name', 'endpoint', 'default'],
    row: (a: AccountSummary) => [a.name, a.endpoint, a.isDefault ? 'yes' : 'no'],
    searchFields: (a: AccountSummary) => [a.name, a.endpoint],
  })
}

export async function accountsSetDefault(out: Output, name: string | undefined): Promise<void> {
  const config = loadConfig()
  const chosen = requireArg(name, 'name')
  saveConfig(setDefaultAccount(config, chosen))
  if (out.json) out.write({ default: chosen })
  else out.log(`Default account: ${chosen}`)
}

export async function accountsRemoveCmd(out: Output, name: string | undefined): Promise<void> {
  const config = loadConfig()
  const chosen = requireArg(name, 'name')
  saveConfig(removeAccount(config, chosen))
  if (out.json) out.write({ removed: chosen })
  else out.log(`Account "${chosen}" removed.`)
}

export async function accountsWhoamiCmd(out: Output, domain: string | undefined): Promise<void> {
  const config = loadConfig()
  const chosen = requireArg(domain, 'domain')
  const { result, updatedConfig } = await whoami(config, chosen, (name) => createOvhClient(requireProfile(config, name)))
  if (updatedConfig !== config) saveConfig(updatedConfig)

  if (out.json) {
    out.write(result)
    return
  }
  if (result.candidates.length === 0) {
    out.log(`No account has access to "${chosen}".`)
  } else {
    out.log(`Accounts with access to "${chosen}": ${result.candidates.join(', ')}`)
    if (result.cached) out.log(`(cached: ${result.candidates[0]})`)
  }
}

export async function accountsForgetCmd(out: Output, domain: string | undefined): Promise<void> {
  const config = loadConfig()
  const chosen = requireArg(domain, 'domain')
  saveConfig(forgetDomain(config, chosen))
  if (out.json) out.write({ forgotten: chosen })
  else out.log(`"${chosen}" removed from the cache.`)
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function authSetup(out: Output, o: Opts): Promise<void> {
  const accountName = requireValue(o.account, '--account')

  if (!ENDPOINTS.includes(o.endpoint as Endpoint)) {
    throw new ValidationError(`Invalid endpoint: "${o.endpoint}". Possible values: ${ENDPOINTS.join(', ')}`, 'invalid_endpoint')
  }
  const endpoint = o.endpoint as Endpoint

  if (!o.appKey || !o.appSecret) {
    throw new ValidationError('--app-key and --app-secret are required in agent mode.', 'missing_credentials')
  }

  const bootstrapClient = createBootstrapOvhClient({ endpoint, appKey: o.appKey, appSecret: o.appSecret })
  const credential = await requestCredential(bootstrapClient)

  if (!out.json) out.log(`Validate this authorization at: ${credential.validationUrl}`)

  const config = loadConfig()
  const profile = buildProfile(endpoint, o.appKey, o.appSecret, credential.consumerKey)
  saveConfig({ ...config, profiles: { ...config.profiles, [accountName]: profile } })

  if (out.json) {
    out.write({ account: accountName, endpoint, validationUrl: credential.validationUrl, state: credential.state })
  } else {
    out.log(`Profile "${accountName}" saved (${endpoint}).`)
  }
}

