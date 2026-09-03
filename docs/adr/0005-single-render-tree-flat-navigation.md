# 0005 — Single persistent render tree, flat two-level navigation

## Status

Accepted

## Context

An earlier draft of the Ink layer used a "wizard" model: each step/prompt
mounted and unmounted its own Ink render tree, one after another. That
model fights Ink — screen flicker on every remount, no shared layout, and
no way to keep a table's scroll/filter state across a panel opening and
closing on top of it.

The interaction model settled on instead is a **data-browser**: each
service (DNS, Mail, Redirections, Accounts) opens directly on a live,
filterable table of its data — not a menu of tasks — with add/edit/delete
as contextual actions triggered from the table itself.

## Decision

- One `render()` call for the entire human-mode session
  (`src/ink/app.tsx`), never a repeated `render()` per prompt/step.
- App-level state is a flat `screen` value (`'home' | 'dns' | 'mail' |
  'mailRedirect' | 'accounts'`), not a generic navigation stack.
- Each screen (`src/ink/screens/*.tsx`) owns a local `panel: null | {
  kind: 'edit' | 'add' | 'delete'; ... }` state. The panel replaces only
  the screen's body; the header and footer stay mounted throughout,
  rendered by the screen itself.
- Escape is handled per level directly in the component that owns that
  level's state, without a generic stack to pop: a panel closes without
  touching screen state; a non-empty filter is cleared first; an empty
  filter goes back to the level above.

Only two real navigation levels exist — Home and a domain's dashboard — so
a generic `push`/`pop` navigation stack would be over-engineering for the
actual shape of the app.

## Consequences

- No flicker: opening a panel or switching screens never remounts the
  table or loses its scroll/filter position unless that's the explicit
  intent (e.g. leaving the table).
- Adding a genuinely deeper hierarchy later (a 3rd navigable level) would
  need revisiting this flat-state approach — acceptable, since the app's
  actual shape has stayed two levels deep since this decision.
- Each screen file is a bit more self-contained (it owns its own panel
  state and Escape handling) rather than delegating to a shared navigation
  service.
