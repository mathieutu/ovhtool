# 0006 — Permanent-filter keyboard grammar (no bare-letter shortcuts)

## Status

Accepted

## Context

Terminal UIs commonly use single bare letters as shortcuts (vim-style: `q`
to quit, `j`/`k` to move, `y` to yank). That grammar conflicts with a
"type to filter" table: if `y` both types the letter `y` into a filter and
triggers a "copy" action depending on some hidden mode, the user has to
remember and track which mode they're in.

## Decision

The filter field in a table is **always active** — typing any printable
character, anywhere on a table screen, always goes into the filter and
narrows the list live. There is no bare-letter shortcut anywhere in the
app, and therefore no "search mode" toggle to track.

Every action is triggered by a special key or a combination instead:

| Key | Effect |
| --- | --- |
| (type text) | Filters the list live |
| ↑ / ↓ | Moves the selected row |
| Enter (on a row) | Opens the edit panel for that row |
| Delete (not Backspace) | Opens the delete panel (diff + confirmation) for the selected row |
| Ctrl+N | Opens the add panel (new entry) |
| Ctrl+Y | Copies the currently filtered list to the clipboard, as Markdown (ADR-0011) |
| Escape | Steps back one level (ADR-0005) |
| Ctrl+C | Quits the application immediately, at any time |

All keys active on the current screen are shown in a fixed help bar at the
bottom (`useKeymap`'s `visibleBindings`, ADR-0001) — the user never has to
memorize a shortcut, only read it off the current screen. The bar only
shows bindings relevant to the current screen, never a global list of
shortcuts that may or may not apply.

Implementation-wise, this is what lets `Table`'s filter `TextInput` and its
row-navigation `useInput` coexist without ever fighting over the same key:
the filter only reacts to printable characters/backspace/cursor movement,
never to ↑/↓/Delete/Ctrl+letter/Escape, and the table-level handler never
consumes a printable character.

## Consequences

- No hidden mode state to get out of sync with what's on screen.
- Every screen must declare its bindings through the same `useKeymap` hook
  so the help bar and the actual behavior can never drift apart.
- Rules out some conventional single-letter shortcuts users might expect
  from other CLIs — traded for discoverability (the help bar) and freedom
  to filter by typing anywhere.
