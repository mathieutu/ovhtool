# 0004 — Multi-account resolution via a local domain cache

## Status

Accepted

## Context

A single user of ovhtool can hold several independent OVH accounts (e.g.
personal + several clients), each with its own API credentials. A given
domain lives under exactly one of those accounts, but the tool shouldn't
require the caller to remember and pass which account owns which domain on
every invocation — nor should it silently guess wrong.

## Decision

- Local config file, `~/.ovhtool/config.json` by default (overridable via
  `OVHTOOL_CONFIG`), holding one or more named `profiles` (endpoint +
  credentials) and a `domainCache: { [domain]: accountName }`.
- The file is saved with restrictive permissions (`0600`).
- Every command accepts a global `--account <name>` flag. When omitted:
  1. Look the domain up in `domainCache`; if found, use it.
  2. Otherwise, query every known profile to find which one(s) have access
     to the domain (the same logic `accounts whoami <domain>` exposes
     directly).
     - Exactly one candidate found → use it silently and cache it (both
       human and agent mode).
     - Several candidates or none → human mode: prompt for a selection and
       cache after confirmation; agent mode / `--json`: validation error
       (exit code `2`) listing the candidates found.
- `ovhtool accounts forget <domain>` removes one entry from `domainCache`
  (useful after a domain transfer between accounts).
- The OVH `consumerKey` can be revoked independently of the `appKey`/
  `appSecret` from the OVH customer panel, without affecting other
  profiles — documented in the README's security section as the recovery
  path if a profile's credentials are ever suspected to be compromised.

## Consequences

- Day-to-day commands almost never need `--account`: the cache makes
  resolution a one-time cost per domain.
- Account resolution is pure, testable logic (`src/accountResolver.ts`),
  independent of whether the caller is a human or an agent.
- A stale cache entry (domain moved to another account) is self-healing via
  `accounts forget` + the next resolution, not by manually editing the
  config file.
