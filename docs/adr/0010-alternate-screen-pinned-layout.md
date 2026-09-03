# 0010 — Alternate screen buffer and pinned header/footer layout

## Status

Accepted

## Context

Two related terminal UX gaps showed up once the app was used for real:
there was no way to scroll a table with the mouse wheel, and on a short
terminal the header/footer could end up pushed out of view by a tall body
instead of staying pinned at the top/bottom like a normal full-screen
terminal app.

Mouse-wheel support could have been built by parsing raw mouse escape
sequences by hand, but that risks conflicting with Ink's own stdin key
parser and is a lot of custom protocol handling for something terminals
already do natively.

## Decision

- On entering the Ink app (when stdout is a TTY), write the ANSI codes for
  the alternate screen buffer (`\x1b[?1049h`) and alternate scroll mode
  (`\x1b[?1007h`); on exit, reverse both (`\x1b[?1007l\x1b[?1049l`). Most
  terminals natively translate mouse-wheel scrolling into arrow-key
  presses while alternate scroll mode is active — already handled by
  `Table`'s existing `useInput` — so this needed no custom mouse-event
  parsing at all.
- Every screen renders through a shared `ScreenLayout` component
  (`{header, footer, children}`) that uses the real terminal size
  (`useTerminalSize`) to keep the header pinned to the top and the footer
  pinned to the bottom regardless of how much content the body renders,
  vim-style, instead of the layout flowing based on content height.

## Consequences

- Native, terminal-provided mouse-wheel scrolling, without owning any
  mouse-input parsing code.
- The real terminal screen is replaced while the app runs (like `vim` or
  `less`) and restored on exit — expected behavior for this kind of app,
  but worth knowing if something reads stdout while ovhtool's interactive
  mode is running (agent mode/`--json` never enters this code path, see
  ADR-0002).
- Every screen must render through `ScreenLayout` to get the pinned
  behavior — a screen that renders its own ad hoc layout would lose it.
