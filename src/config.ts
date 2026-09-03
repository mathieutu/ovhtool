import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { dirname } from 'node:path'
import { homedir } from 'node:os'
import path from 'node:path'
import { ValidationError } from './errors.ts'

export type Endpoint = 'ovh-eu' | 'ovh-us' | 'ovh-ca'

export const ENDPOINTS: Endpoint[] = ['ovh-eu', 'ovh-us', 'ovh-ca']

export type Profile = {
  endpoint: Endpoint
  appKey: string
  appSecret: string
  consumerKey: string
}

/** One cached table response: the raw list, and when it was fetched. */
export type TableCacheEntry = { data: unknown; fetchedAt: string }

export type Config = {
  default?: string
  profiles: Record<string, Profile>
  domainCache: Record<string, string>
  /** Last-known table responses (DNS records, mail accounts, redirections), keyed by `<service>:<account>:<domain>` — lets a dashboard show data immediately on open while it revalidates in the background, instead of a blank loading screen every time. */
  tableCache: Record<string, TableCacheEntry>
}

export function emptyConfig(): Config {
  return { profiles: {}, domainCache: {}, tableCache: {} }
}

export function getConfigPath(): string {
  const override = process.env.OVHTOOL_CONFIG
  if (override && override.trim() !== '') return override
  return path.join(homedir(), '.ovhtool', 'config.json')
}

export function loadConfig(configPath = getConfigPath()): Config {
  if (!existsSync(configPath)) return emptyConfig()

  const raw = readFileSync(configPath, 'utf8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ValidationError(`Invalid config file (malformed JSON): ${configPath}`, 'invalid_config')
  }

  return normalizeConfig(parsed)
}

function normalizeConfig(parsed: unknown): Config {
  if (typeof parsed !== 'object' || parsed === null) return emptyConfig()
  const obj = parsed as Record<string, unknown>
  return {
    default: typeof obj.default === 'string' ? obj.default : undefined,
    profiles: typeof obj.profiles === 'object' && obj.profiles !== null ? (obj.profiles as Record<string, Profile>) : {},
    domainCache:
      typeof obj.domainCache === 'object' && obj.domainCache !== null ? (obj.domainCache as Record<string, string>) : {},
    tableCache:
      typeof obj.tableCache === 'object' && obj.tableCache !== null ? (obj.tableCache as Record<string, TableCacheEntry>) : {},
  }
}

export function saveConfig(config: Config, configPath = getConfigPath()): void {
  const dir = dirname(configPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
  chmodSync(configPath, 0o600)
}

export function getProfile(config: Config, name: string): Profile | undefined {
  return config.profiles[name]
}

export function requireProfile(config: Config, name: string): Profile {
  const profile = getProfile(config, name)
  if (!profile) {
    const known = Object.keys(config.profiles)
    throw new ValidationError(
      `Unknown account: "${name}". Available accounts: ${known.length > 0 ? known.join(', ') : '(none, run "ovhtool auth setup --account <name>")'}`,
      'unknown_account',
    )
  }
  return profile
}

export function resolveDefaultAccountName(config: Config): string | undefined {
  if (config.default && config.profiles[config.default]) return config.default
  return undefined
}

export function getCachedAccount(config: Config, domain: string): string | undefined {
  const cached = config.domainCache[domain]
  if (cached && config.profiles[cached]) return cached
  return undefined
}

export function withCachedAccount(config: Config, domain: string, accountName: string): Config {
  return { ...config, domainCache: { ...config.domainCache, [domain]: accountName } }
}

export function withoutCachedDomain(config: Config, domain: string): Config {
  if (!(domain in config.domainCache)) return config
  const domainCache = { ...config.domainCache }
  delete domainCache[domain]
  return { ...config, domainCache }
}

export function getCachedTable<T>(config: Config, key: string): T | undefined {
  return config.tableCache[key]?.data as T | undefined
}

export function withCachedTable(config: Config, key: string, data: unknown): Config {
  return { ...config, tableCache: { ...config.tableCache, [key]: { data, fetchedAt: new Date().toISOString() } } }
}

/** Drops every cached table response (`ovhtool accounts clear-cache`, or Ctrl+N on the accounts screen) — never touches profiles or the domain→account cache. */
export function clearTableCache(config: Config): Config {
  return { ...config, tableCache: {} }
}
