# 0007 — Domain-first CLI syntax and session-pinned domain

## Status

Accepted

## Context

A common workflow is "I want to work on `bar.fr` for a while, across
several services" (check its DNS, then its mail accounts, then a
redirection) rather than "I want to open the DNS service, then pick a
domain". The original CLI shape (`ovhtool <service> [domain]`) made the
domain an afterthought of the service, and offered no way to keep a domain
selected across screens without re-typing it or re-selecting it from a
picker every time.

## Decision

- `ovhtool <domain>` **pins** that domain for the whole interactive
  session and opens the home menu; whichever service is opened next
  (DNS, Mail, Redirections) defaults to it, with no domain prompt.
- `ovhtool <domain> <service>` pins the domain and jumps straight into
  that service's dashboard.
- The original `ovhtool <service> [domain]` order is also still accepted
  (`ovhtool dns bar.fr` works exactly like before) — but a domain supplied
  this way is a **one-shot, ephemeral** selection: it scopes only that
  single dashboard visit, is not remembered across screens, and is
  forgotten as soon as the user returns to the home screen. Both call
  orders coexist rather than one replacing the other, since both are
  useful in different scripts/habits and neither is more "correct".
- A pinned domain is shown first in the header (`<domain> · <service>`); an
  ephemeral one is shown after the service name (`<service> · <domain>`) —
  the header ordering itself communicates whether the domain will still
  apply after leaving the current screen.
- At the home screen, Escape forgets a pinned domain (one extra step,
  since silently discarding session state on the same key that would
  otherwise quit felt like it deserved a checkpoint); a second Escape (now
  nothing pinned) quits the process.

## Consequences

- Two equally valid ways to invoke the same dashboard exist in the CLI
  surface, both intentionally kept — this trades a small amount of
  "one obvious way to do it" for backward compatibility and covering two
  real usage patterns (scripted single-domain commands vs. an interactive
  multi-service session on one domain).
- The distinction between "pinned" and "ephemeral" domain has to be
  threaded through `AppProps`/screen props explicitly (`pinnedDomain` vs.
  the one-shot `initialArgs`) rather than collapsed into one concept.
