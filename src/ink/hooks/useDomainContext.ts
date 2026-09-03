import { useEffect, useRef, useState } from 'react'
import { loadConfig, saveConfig, requireProfile, withCachedAccount, type Config, type Profile } from '../../config.ts'
import { createOvhClient, type OvhClient } from '../../ovhClient.ts'
import { resolveAccount } from '../../accountResolver.ts'
import { checkDomainAccess } from '../../commands/accounts.ts'
import { toOvhtoolError } from '../../errors.ts'

/** One (account, domain) pair offered by the combined picker. */
export type DomainOption = { account: string; domain: string }

export type DomainContextPhase =
  | { kind: 'listing-domains'; previous?: DomainContextPhase }
  | { kind: 'pick-domain'; options: DomainOption[]; previous?: DomainContextPhase }
  | { kind: 'resolving' }
  | { kind: 'pick-candidate'; candidates: string[] }
  | { kind: 'ready'; domain: string; account: string; profile: Profile; previous?: DomainContextPhase }
  | { kind: 'error'; message: string; previous?: DomainContextPhase }

export type DomainContext = {
  phase: DomainContextPhase
  pickDomain: (option: DomainOption) => void
  chooseCandidate: (name: string) => void
  /**
   * Escape's own "no earlier level in the chain" fallback for a `ready`
   * phase with no `previous` (a domain fully qualified upfront, e.g.
   * `ovhtool dns bar.fr`, or one picked directly with no prior picker):
   * reveals the same combined account+domain picker, with no `previous` of
   * its own — Escape from *it* goes home directly. (There used to be a
   * separate Ctrl+A "changer de contexte" action reopening this same picker
   * but pointing `previous` back at the current dashboard "to cancel into";
   * that additional entry point was removed as redundant now that Escape
   * already reaches the picker on its own, and it would otherwise make this
   * one ping-pong forever between the picker and the dashboard instead of
   * ever reaching home.)
   */
  revealDomainPicker: () => void
  /** Re-fetches the domain list shown by the current `pick-domain` phase in place, keeping its `previous` (so Escape still steps back to wherever it did before the refresh) — used by the picker's own manual-refresh binding. No-op outside `pick-domain`. */
  refreshDomainOptions: () => void
  /**
   * Steps back exactly one level in the resolution chain this context built
   * up, returning `true` if it did. Returns `false` when there is no earlier
   * level to return to (e.g. a zone was fully qualified upfront) — the
   * caller should then fall back to going home, so Escape always moves back
   * exactly one level, never straight to the start.
   */
  goBack: () => boolean
}

/**
 * Resolves which account + zone/domain a DNS/mail/mail-redirect dashboard
 * should operate on (ADR-0004's account-resolution rules), prompting only for
 * what isn't already known:
 * - a domain given upfront (CLI arg, or a session-pinned domain — see
 *   `cli.ts`'s domain-first `ovhtool <domain>` form) goes through
 *   `resolveAccount` as before (domainCache > probing every profile >
 *   ambiguous-candidate picker);
 * - otherwise every configured account's domains are listed *together* in
 *   one filterable picker (account + domain columns) instead of first
 *   asking "which account?" and only then listing that one account's
 *   domains — one fewer step when several accounts are configured, and it
 *   degrades to the same single-account list when only one is.
 */
export function useDomainContext(initialDomain: string | undefined, initialAccount: string | undefined, listDomains: (client: OvhClient) => Promise<string[]>): DomainContext {
  const [phase, setPhase] = useState<DomainContextPhase>({ kind: 'resolving' })
  const candidateResolve = useRef<((name: string) => void) | null>(null)

  /** Lists domains across every account in `accountNames`, tolerating individual failures (e.g. one profile's credentials are stale) rather than failing the whole picker. */
  async function listDomainOptions(config: Config, accountNames: string[]): Promise<DomainOption[]> {
    const perAccount = await Promise.allSettled(
      accountNames.map(async (account) => {
        const client = createOvhClient(requireProfile(config, account))
        const domains = await listDomains(client)
        return domains.map((domain): DomainOption => ({ account, domain }))
      }),
    )
    return perAccount.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
  }

  async function resolveForDomain(config: Config, domain: string): Promise<DomainContextPhase> {
    const resolved = await resolveAccount({
      config,
      domain,
      explicitAccount: initialAccount,
      mode: 'human',
      checkAccess: (name) => checkDomainAccess(createOvhClient(requireProfile(config, name)), domain),
      promptSelect: (candidates) =>
        new Promise((resolve) => {
          candidateResolve.current = resolve
          setPhase({ kind: 'pick-candidate', candidates })
        }),
    })
    if (resolved.shouldCache) saveConfig(withCachedAccount(config, domain, resolved.name))
    return { kind: 'ready', domain, account: resolved.name, profile: resolved.profile }
  }

  async function openDomainPicker(previous?: DomainContextPhase): Promise<DomainContextPhase> {
    const config = loadConfig()
    const accountNames = initialAccount ? [initialAccount] : Object.keys(config.profiles)
    const options = await listDomainOptions(config, accountNames)
    return { kind: 'pick-domain', options, previous }
  }

  useEffect(() => {
    let cancelled = false

    async function run(): Promise<void> {
      const config = loadConfig()

      if (initialDomain) {
        setPhase({ kind: 'resolving' })
        const next = await resolveForDomain(config, initialDomain)
        if (!cancelled) setPhase(next)
        return
      }

      if (Object.keys(config.profiles).length === 0) {
        setPhase({ kind: 'error', message: 'No account configured. Run "ovhtool auth setup --account <name>".' })
        return
      }

      setPhase({ kind: 'listing-domains' })
      const next = await openDomainPicker()
      if (!cancelled) setPhase(next)
    }

    run().catch((err) => {
      if (!cancelled) setPhase({ kind: 'error', message: toOvhtoolError(err).message })
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDomain, initialAccount])

  function pickDomain(option: DomainOption): void {
    if (phase.kind !== 'pick-domain') return
    const config = loadConfig()
    const profile = requireProfile(config, option.account)
    if (config.domainCache[option.domain] !== option.account) saveConfig(withCachedAccount(config, option.domain, option.account))
    setPhase({ kind: 'ready', domain: option.domain, account: option.account, profile, previous: phase })
  }

  function chooseCandidate(name: string): void {
    candidateResolve.current?.(name)
    candidateResolve.current = null
  }

  function revealDomainPicker(): void {
    setPhase({ kind: 'listing-domains' })
    openDomainPicker(undefined)
      .then(setPhase)
      .catch((err) => setPhase({ kind: 'error', message: toOvhtoolError(err).message }))
  }

  function refreshDomainOptions(): void {
    if (phase.kind !== 'pick-domain') return
    const previous = phase.previous
    setPhase({ kind: 'listing-domains', previous })
    openDomainPicker(previous)
      .then(setPhase)
      .catch((err) => setPhase({ kind: 'error', message: toOvhtoolError(err).message, previous }))
  }

  function goBack(): boolean {
    const previous = 'previous' in phase ? phase.previous : undefined
    if (!previous) return false
    setPhase(previous)
    return true
  }

  return { phase, pickDomain, chooseCandidate, revealDomainPicker, refreshDomainOptions, goBack }
}
