import type { OvhClient } from '../ovhClient.ts'
import { diffCreate, diffDelete, type ActionDiff } from '../diff.ts'
import { waitUntilReflected } from './pollUntil.ts'

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
  const redirection = await client.request<MailRedirection>('POST', `/email/domain/${params.domain}/redirection`, {
    from: params.from,
    to: params.to,
    localCopy: false,
  })
  await waitUntilReflected(async () => {
    const ids = await client.request<string[]>('GET', `/email/domain/${params.domain}/redirection`)
    return ids.includes(redirection.id)
  })
  return redirection
}

export function prepareRemoveMailRedirection(before: MailRedirection): ActionDiff {
  return diffDelete({ from: before.from, to: before.to })
}

export async function applyRemoveMailRedirection(client: OvhClient, domain: string, id: string): Promise<void> {
  await client.request('DELETE', `/email/domain/${domain}/redirection/${id}`)
  await waitUntilReflected(async () => {
    const ids = await client.request<string[]>('GET', `/email/domain/${domain}/redirection`)
    return !ids.includes(id)
  })
}
