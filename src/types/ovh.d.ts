declare module 'ovh' {
  export type OvhWrapperOptions = {
    endpoint: string
    appKey: string
    appSecret: string
    consumerKey?: string
  }

  export type OvhRawClient = {
    request: (
      method: string,
      path: string,
      params: Record<string, unknown> | undefined,
      callback: (error: unknown, result: unknown) => void,
    ) => void
    requestPromised: (method: string, path: string, params?: Record<string, unknown>) => Promise<unknown>
  }

  export default function ovh(options: OvhWrapperOptions): OvhRawClient
}
