import type { OvhClient } from '../ovhClient.ts'
import { diffCreate, diffDelete, type ActionDiff } from '../diff.ts'
import { waitUntilReflected, explainConflict } from './pollUntil.ts'
import { ApiError } from '../errors.ts'

export type MailRedirection = {
  id: string
  domain: string
  from: string
  to: string
  localCopy: boolean
}

export async function listMailRedirections(client: OvhClient, domain: string, from?: string): Promise<MailRedirection[]> {
  const ids = await client.request<string[]>('GET', `/email/domain/${domain}/redirection`, from ? { from } : undefined)
  return Promise.all(
    ids.map((id) => client.request<MailRedirection>('GET', `/email/domain/${domain}/redirection/${id}`)),
  )
}

export async function fetchMailRedirection(client: OvhClient, domain: string, id: string): Promise<MailRedirection> {
  return client.request<MailRedirection>('GET', `/email/domain/${domain}/redirection/${id}`)
}

export type AddMailRedirectionParams = {
  domain: string
  from: string
  to: string
}

export function prepareAddMailRedirection(params: AddMailRedirectionParams): ActionDiff {
  return diffCreate({ from: params.from, to: params.to })
}

export async function applyAddMailRedirection(client: OvhClient, params: AddMailRedirectionParams): Promise<MailRedirection> {
  // OVH's POST here kicks off an async task and responds with *that task*
  // (an `{ id, action, type, … }` shape), not the redirection — the
  // redirection's own id only shows up once the listing catches up, so it's
  // found by diffing the id list rather than trusted from the POST response.
  const idsBefore = await client.request<string[]>('GET', `/email/domain/${params.domain}/redirection`)
  await explainConflict(() =>
    client.request('POST', `/email/domain/${params.domain}/redirection`, {
      from: params.from,
      to: params.to,
      localCopy: false,
    }),
  )
  let createdId: string | undefined
  await waitUntilReflected(async () => {
    const ids = await client.request<string[]>('GET', `/email/domain/${params.domain}/redirection`)
    createdId = ids.find((id) => !idsBefore.includes(id))
    return createdId !== undefined
  })
  if (!createdId) throw new ApiError(`Redirection for ${params.from} was created but OVH hasn't listed it yet — check "mail-redirect list" shortly.`, 'ovh_not_yet_listed')
  return fetchMailRedirection(client, params.domain, createdId)
}

export function prepareRemoveMailRedirection(before: MailRedirection): ActionDiff {
  return diffDelete({ from: before.from, to: before.to })
}

export async function applyRemoveMailRedirection(client: OvhClient, domain: string, id: string): Promise<void> {
  await explainConflict(() => client.request('DELETE', `/email/domain/${domain}/redirection/${id}`))
  await waitUntilReflected(async () => {
    const ids = await client.request<string[]>('GET', `/email/domain/${domain}/redirection`)
    return !ids.includes(id)
  })
}

/** All redirections sharing one `from` address — OVH itself has no such grouping (one id per from/to pair), but the UI treats them as a single "who does this address forward to" entry. */
export type RedirectionGroup = {
  from: string
  redirections: MailRedirection[]
}

export function groupRedirectionsByFrom(redirections: MailRedirection[]): RedirectionGroup[] {
  const byFrom = new Map<string, MailRedirection[]>()
  for (const redirection of redirections) {
    const group = byFrom.get(redirection.from)
    if (group) group.push(redirection)
    else byFrom.set(redirection.from, [redirection])
  }
  return [...byFrom.entries()].map(([from, group]) => ({ from, redirections: group }))
}

/**
 * OVH has no endpoint to change a redirection's `to` in place — editing a
 * group of redirections that share a `from` means deleting the ones whose
 * destination is no longer wanted and creating the newly added ones.
 * Existing destinations left untouched in `desiredTos` are neither deleted
 * nor recreated.
 */
export function planRedirectionRecipients(existing: MailRedirection[], desiredTos: string[]): { toDelete: MailRedirection[]; toCreate: string[] } {
  const desired = new Set(desiredTos)
  const current = new Set(existing.map((r) => r.to))
  return {
    toDelete: existing.filter((r) => !desired.has(r.to)),
    toCreate: desiredTos.filter((to) => !current.has(to)),
  }
}

export type RedirectionChangeParams = {
  domain: string
  from: string
  toDelete: MailRedirection[]
  toCreate: string[]
}

export function prepareRedirectionChanges({ from, toDelete, toCreate }: RedirectionChangeParams): ActionDiff[] {
  return [...toDelete.map((r) => diffDelete({ from: r.from, to: r.to })), ...toCreate.map((to) => diffCreate({ from, to }))]
}

export async function applyRedirectionChanges(client: OvhClient, { domain, from, toDelete, toCreate }: RedirectionChangeParams): Promise<void> {
  for (const redirection of toDelete) {
    await applyRemoveMailRedirection(client, domain, redirection.id)
  }
  for (const to of toCreate) {
    await applyAddMailRedirection(client, { domain, from, to })
  }
}
