import { useCallback, useEffect, useState } from 'react'
import { loadConfig, saveConfig, getCachedTable, withCachedTable } from '../../config.ts'

export type AsyncDataState<T> = {
  status: 'loading' | 'error' | 'ready'
  data: T | null
  error: unknown
  /** True while fetching fresh data behind already-displayed (cached) data — show a subtle indicator, never a blocking spinner. */
  revalidating: boolean
  reload: () => void
}

/**
 * Generic "load on mount, reload on demand" hook shared by every dashboard
 * screen (ADR-0009) — no fetching/caching library, a single
 * consumer per screen makes a bespoke hook simpler to read than TanStack
 * Query/SWR.
 *
 * With `cacheKey`, the last successful response is persisted to the local
 * config file (`config.ts`'s `tableCache`) and shown immediately on mount —
 * a big DNS zone or mail domain doesn't force a blank loading screen on
 * every visit — while a fresh fetch always still runs in the background
 * (`revalidating`) and replaces it once it resolves. A background
 * revalidation failure is swallowed (the stale-but-displayed data stays);
 * only a *first* load with nothing cached surfaces as `status: 'error'`.
 */
export function useAsyncData<T>(fetcher: () => Promise<T>, deps: unknown[] = [], cacheKey?: string): AsyncDataState<T> {
  const [state, setState] = useState<{ status: 'loading' | 'error' | 'ready'; data: T | null; error: unknown }>(() => {
    const cached = cacheKey ? getCachedTable<T>(loadConfig(), cacheKey) : undefined
    return cached !== undefined ? { status: 'ready', data: cached, error: null } : { status: 'loading', data: null, error: null }
  })
  const [revalidating, setRevalidating] = useState(false)

  const load = useCallback(() => {
    setRevalidating(true)
    setState((s) => (s.data === null ? { ...s, status: 'loading' } : s))
    fetcher().then(
      (data) => {
        setRevalidating(false)
        setState({ status: 'ready', data, error: null })
        if (cacheKey) saveConfig(withCachedTable(loadConfig(), cacheKey, data))
      },
      (error) => {
        setRevalidating(false)
        setState((s) => (s.data !== null ? s : { status: 'error', data: null, error }))
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    load()
  }, [load])

  return { ...state, revalidating, reload: load }
}
