import type { OvhClient } from '../ovhClient.ts'
import { diffCreate, diffDelete, type ActionDiff } from '../diff.ts'

export type MailAccount = {
  accountName: string
  domain: string
  description: string
  size: number
  email: string
}

/** Mail domains the account has access to — used to let the user pick one instead of typing it blind (also reused by mail-redirect). */
export async function listMailDomains(client: OvhClient): Promise<string[]> {
  return client.request<string[]>('GET', '/email/domain')
}

export async function listMailAccounts(client: OvhClient, domain: string): Promise<MailAccount[]> {
  const accountNames = await client.request<string[]>('GET', `/email/domain/${domain}/account`)
  return Promise.all(
    accountNames.map((accountName) =>
      client.request<MailAccount>('GET', `/email/domain/${domain}/account/${accountName}`),
    ),
  )
}

export async function fetchMailAccount(client: OvhClient, domain: string, accountName: string): Promise<MailAccount> {
  return client.request<MailAccount>('GET', `/email/domain/${domain}/account/${accountName}`)
}

export type CreateMailAccountParams = {
  domain: string
  accountName: string
  password: string
  size?: number
  description?: string
}

export function prepareCreateMailAccount(params: CreateMailAccountParams): ActionDiff {
  return diffCreate({
    accountName: params.accountName,
    size: params.size ?? null,
    description: params.description ?? null,
  })
}

export async function applyCreateMailAccount(client: OvhClient, params: CreateMailAccountParams): Promise<MailAccount> {
  return client.request<MailAccount>('POST', `/email/domain/${params.domain}/account`, {
    accountName: params.accountName,
    password: params.password,
    size: params.size,
    description: params.description,
  })
}

export function prepareDeleteMailAccount(before: MailAccount): ActionDiff {
  return diffDelete({
    accountName: before.accountName,
    description: before.description,
    size: before.size,
  })
}

export async function applyDeleteMailAccount(client: OvhClient, domain: string, accountName: string): Promise<void> {
  await client.request('DELETE', `/email/domain/${domain}/account/${accountName}`)
}

export type ChangeMailPasswordParams = {
  domain: string
  accountName: string
  password: string
}

/** Dedicated diff for password changes: never a plaintext value, before/after masked. */
export function preparePasswdMailAccount(): ActionDiff {
  return { action: 'update', changes: [{ field: 'password', before: '••••••••', after: '••••••••' }] }
}

export async function applyChangeMailPassword(client: OvhClient, params: ChangeMailPasswordParams): Promise<void> {
  await client.request('POST', `/email/domain/${params.domain}/account/${params.accountName}/changePassword`, {
    password: params.password,
  })
}
