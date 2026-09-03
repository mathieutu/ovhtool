import ovh from 'ovh'
import type { Endpoint, Profile } from './config.ts'
import { ApiError } from './errors.ts'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export type OvhClient = {
  request: <T>(method: HttpMethod, path: string, params?: Record<string, unknown>) => Promise<T>
}

export type BootstrapCredentials = {
  endpoint: Endpoint
  appKey: string
  appSecret: string
}

/**
 * Full client (appKey + appSecret + consumerKey), used by every command once a
 * profile is authenticated.
 */
export function createOvhClient(profile: Profile): OvhClient {
  return buildClient({ ...profile })
}

/**
 * "Bootstrap" client without a consumerKey, used only by `auth setup` to
 * request a new consumerKey via /auth/credential.
 */
export function createBootstrapOvhClient(credentials: BootstrapCredentials): OvhClient {
  return buildClient(credentials)
}

function buildClient(options: BootstrapCredentials & { consumerKey?: string }): OvhClient {
  const raw = ovh(options)
  return {
    async request<T>(method: HttpMethod, path: string, params?: Record<string, unknown>): Promise<T> {
      try {
        return (await raw.requestPromised(method, path, params)) as T
      } catch (error) {
        throw normalizeOvhError(error)
      }
    },
  }
}

function normalizeOvhError(error: unknown): ApiError {
  if (error && typeof error === 'object') {
    const candidate = error as { error?: number | string; message?: string }
    if (typeof candidate.message === 'string' && candidate.message.length > 0) {
      return new ApiError(candidate.message, `ovh_http_${candidate.error ?? 'error'}`)
    }
  }
  return new ApiError(error instanceof Error ? error.message : String(error), 'ovh_unknown_error')
}
