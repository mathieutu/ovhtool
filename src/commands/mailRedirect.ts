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
