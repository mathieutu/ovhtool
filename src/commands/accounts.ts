import type { Config, Endpoint } from '../config.ts'
import { requireProfile, withCachedAccount, withoutCachedDomain } from '../config.ts'
import type { OvhClient } from '../ovhClient.ts'
import { ValidationError } from '../errors.ts'

export type AccountSummary = {
  name: string
  endpoint: Endpoint
  isDefault: boolean
}

export function listAccounts(config: Config): AccountSummary[] {
  return Object.entries(config.profiles).map(([name, profile]) => ({
    name,
    endpoint: profile.endpoint,
    isDefault: name === config.default,
  }))
}

export function setDefaultAccount(config: Config, name: string): Config {
  requireProfile(config, name)
  return { ...config, default: name }
}

export function removeAccount(config: Config, name: string): Config {
  requireProfile(config, name)

  const profiles = { ...config.profiles }
  delete profiles[name]

  const domainCache = Object.fromEntries(Object.entries(config.domainCache).filter(([, account]) => account !== name))

  return {
    default: config.default === name ? undefined : config.default,
    profiles,
    domainCache,
    tableCache: config.tableCache,
  }
}

export function forgetDomain(config: Config, domain: string): Config {
  return withoutCachedDomain(config, domain)
}

/**
 * Checks whether `client`'s account has access to the domain, trying a DNS
 * zone then a mail domain (a "domain" in this CLI can be either one).
 */
export async function checkDomainAccess(client: OvhClient, domain: string): Promise<boolean> {
  const dnsAccess = await probe(() => client.request('GET', `/domain/zone/${domain}`))
  if (dnsAccess) return true
  return probe(() => client.request('GET', `/email/domain/${domain}`))
}

async function probe(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn()
    return true
  } catch {
    return false
  }
}

export type WhoamiResult = {
  domain: string
  candidates: string[]
  cached: boolean
}

export async function whoami(config: Config, domain: string, client: (accountName: string) => OvhClient): Promise<{
  result: WhoamiResult
  updatedConfig: Config
}> {
  const profileNames = Object.keys(config.profiles)
  if (profileNames.length === 0) {
    throw new ValidationError('No account configured. Run "ovhtool auth setup --account <name>".', 'no_account_configured')
  }

  const checks = await Promise.all(
    profileNames.map(async (name) => ({ name, hasAccess: await checkDomainAccess(client(name), domain) })),
  )
  const candidates = checks.filter((c) => c.hasAccess).map((c) => c.name)

  if (candidates.length === 1) {
    return {
      result: { domain, candidates, cached: true },
      updatedConfig: withCachedAccount(config, domain, candidates[0]!),
    }
  }

  return { result: { domain, candidates, cached: false }, updatedConfig: config }
}
