# 0013 — The permanent-filter grammar extends to every navigable list, not just `Table`

## Status

Accepted

## Context

ADR-0006 established "type to filter, always active" for `Table` (data
screens) and it was already reused by the `Select` primitive (combobox
pickers). `HomeScreen`'s service menu (DNS / Mail / Redirections /
Accounts) was the one remaining ↑/↓/Enter list in the app that predated
that grammar: a hand-rolled `useState` index with no filter field at all,
because four items never seemed to need one.

That inconsistency is itself the problem: a user who has learned "I can
just start typing on any list" from the data screens has no way to know
one particular screen is the exception, short of trying it and finding out
it silently does nothing. The set of services is also not fixed forever —
it grows over time, and a menu that never needed a filter with 4 entries
will, eventually.

## Decision

Every screen where the user picks one item out of a list by moving a
highlight (↑/↓) and confirming (Enter) gets the same filter field as
`Table`, no exceptions carved out for "the list is short right now."
`HomeScreen` now filters its menu the same way `Table` filters rows:
a `TextInput` filter field is always mounted, `cliPure.ts`'s `filterRows`
narrows the list live, and a separate `useKeymap` handles ↑/↓/Enter/Escape
against the *filtered* list — the same two-independent-`useInput`-hooks
split `Table` uses, so typing never fights navigation over a key.

Concretely, this means: before adding a new plain "pick one of N" list
anywhere in the app, reach for `Select` (if it's a combobox-style field) or
replicate `Table`'s filter-field-plus-`useKeymap` split (if it's a
full-screen menu like `HomeScreen`) — never a bare `useState` index with no
filter, even if N is small today.

## Consequences

- One less thing to special-case when scanning the app for "does typing do
  something here": it always does, everywhere a list is being navigated.
- `HomeScreen` (like `Table`) now needs an explicit "(no match)" state, and
  its selected index must be clamped against the *filtered* list length
  the same way `Table`/`Select` already do — the filtered list, not the
  static source list, is the source of truth for what Enter opens.
- No new primitive was introduced: this is scope, not implementation —
  `Select`/`Table`'s existing filter mechanics were the target already.
