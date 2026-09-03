import type { Endpoint, Profile } from '../config.ts'
import type { OvhClient } from '../ovhClient.ts'

export const CREATE_APP_URLS: Record<Endpoint, string> = {
  'ovh-eu': 'https://eu.api.ovh.com/createApp/',
  'ovh-ca': 'https://ca.api.ovh.com/createApp/',
  'ovh-us': 'https://api.us.ovhcloud.com/createApp/',
}

/** Least-privilege principle: only DNS and email, read/write. */
export const ACCESS_RULES = [
  { method: 'GET', path: '/domain/*' },
  { method: 'POST', path: '/domain/*' },
  { method: 'PUT', path: '/domain/*' },
  { method: 'DELETE', path: '/domain/*' },
  { method: 'GET', path: '/email/*' },
  { method: 'POST', path: '/email/*' },
  { method: 'PUT', path: '/email/*' },
  { method: 'DELETE', path: '/email/*' },
] as const

export type CredentialRequest = {
  validationUrl: string
  consumerKey: string
  state: string
}

export async function requestCredential(bootstrapClient: OvhClient): Promise<CredentialRequest> {
  return bootstrapClient.request<CredentialRequest>('POST', '/auth/credential', { accessRules: ACCESS_RULES })
}

export function buildProfile(endpoint: Endpoint, appKey: string, appSecret: string, consumerKey: string): Profile {
  return { endpoint, appKey, appSecret, consumerKey }
}
