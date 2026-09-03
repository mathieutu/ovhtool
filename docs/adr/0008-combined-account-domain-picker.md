# 0008 — Combined account+domain picker table

## Status

Accepted

## Context

Resolving "which domain, under which account" originally happened in two
sequential steps: pick an account first, then pick a domain from that
account's list. With several accounts each holding several domains, that's
two filter/selection interactions to do something that's really one
choice — and it hides domains from other accounts while narrowing the
first list, which can look like a domain "isn't there" when it just
belongs to a different account.

## Decision

`useDomainContext`/`DomainContextGate` present a **single** table listing
every domain from every configured account at once, with an `account`
column alongside the `domain`/`zone` column, filterable across both
(typing matches either field). Picking a row resolves both the account and
the domain in one action. A manual-entry escape hatch (Ctrl+N) remains for
a domain the account API wouldn't list.

## Consequences

- One filter/selection step instead of two for the common case.
- The picker has to query every configured profile's domain list up front
  (rather than one profile, lazily), which is naturally where the table
  cache (ADR-0009) helps keep it responsive.
- `useDomainContext`'s phase machine (`listing-domains` → `pick-domain` →
  `resolving` → `pick-candidate` → `ready`) still exists for the case where
  a domain is reached some other way (e.g. an already-qualified CLI
  command) and needs disambiguating among several candidate accounts — the
  combined picker is the entry point when no domain is known yet, not a
  replacement for that resolution logic.
