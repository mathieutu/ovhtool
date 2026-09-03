import type { Config, Profile } from './config.ts'
import { getCachedAccount, requireProfile } from './config.ts'
import { ValidationError } from './errors.ts'

export type ResolveMode = 'human' | 'agent'

export type ResolvedAccount = {
  name: string
  profile: Profile
  /** True if the caller should persist this result into the domainCache. */
  shouldCache: boolean
}

export type ResolveAccountDeps = {
  config: Config
  domain: string
  explicitAccount?: string | undefined
  mode: ResolveMode
  /** Must resolve to `true` if profile `accountName` has access to `domain`. */
  checkAccess: (accountName: string) => Promise<boolean>
  /** Called only in human mode, when several candidates are found. */
  promptSelect: (candidates: string[]) => Promise<string>
}

/**
 * Resolves which OVH account to use for a command operating on `domain`,
 * following the rule described in ADR-0004: explicit --account > cache > probing
 * known profiles (single candidate = silent, several = human prompt or agent error).
 */
export async function resolveAccount(deps: ResolveAccountDeps): Promise<ResolvedAccount> {
  const { config, domain, explicitAccount, mode, checkAccess, promptSelect } = deps

  if (explicitAccount) {
    return { name: explicitAccount, profile: requireProfile(config, explicitAccount), shouldCache: false }
  }

  const cachedName = getCachedAccount(config, domain)
  if (cachedName) {
    return { name: cachedName, profile: requireProfile(config, cachedName), shouldCache: false }
  }

  const profileNames = Object.keys(config.profiles)
  const checks = await Promise.all(profileNames.map(async (name) => ({ name, hasAccess: await checkAccess(name) })))
  const candidates = checks.filter((c) => c.hasAccess).map((c) => c.name)

  if (candidates.length === 0) {
    throw new ValidationError(`No known account has access to domain "${domain}".`, 'no_account_found')
  }

  if (candidates.length === 1) {
    const name = candidates[0]!
    return { name, profile: requireProfile(config, name), shouldCache: true }
  }

  if (mode === 'agent') {
    throw new ValidationError(
      `Several accounts have access to domain "${domain}": ${candidates.join(', ')}. Specify --account.`,
      'ambiguous_account',
    )
  }

  const chosen = await promptSelect(candidates)
  return { name: chosen, profile: requireProfile(config, chosen), shouldCache: true }
}
