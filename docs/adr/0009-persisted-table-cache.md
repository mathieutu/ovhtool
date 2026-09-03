# 0009 — Persisted, stale-while-revalidate table cache

## Status

Accepted

## Context

Every table (DNS records, mail accounts, redirections — some domains have
hundreds of redirections) is fetched fresh from the OVH API on every visit.
For a frequently-revisited domain, that means staring at a loading spinner
for data that's usually unchanged from the last visit, every single time.

## Decision

- `useAsyncData(fetcher, deps, cacheKey)` reads a cached value for
  `cacheKey` synchronously on mount (if present) and renders it
  immediately as `status: 'ready'`, instead of starting in `'loading'`.
- A background fetch always still runs (`revalidating: true` while it's in
  flight); when it resolves, the state and the on-disk cache are both
  updated with the fresh data.
- The cache lives in the same local config file as account profiles
  (`tableCache` key in `~/.ovhtool/config.json`, see ADR-0004), keyed by a
  string like `` `dns:${accountName}:${zone}` `` — so it survives across
  process restarts, not just within one session.
- `Footer` shows a small inline spinner during revalidation instead of
  replacing the table, so a cache hit never looks like a blocked UI.
- `accounts` (Ctrl+X) exposes a way to clear the whole cache
  (`clearTableCache`), for the case where cached data is suspected stale
  and a full refetch is wanted immediately.

## Consequences

- Revisiting a domain feels instant even when the underlying API list is
  large, at the cost of briefly showing data that may be one revalidation
  behind reality.
- The config file, previously just credentials + a small domain→account
  map, now also holds potentially large table payloads — acceptable since
  it's still local JSON, but worth knowing if inspecting that file by hand.
- Every screen that wants this behavior must pass a stable, unique
  `cacheKey` derived from account+zone/domain — an omitted or colliding key
  silently disables or corrupts the cache for that data set.
