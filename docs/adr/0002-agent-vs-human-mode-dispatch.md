# 0002 — Agent mode vs. human mode dispatch

## Status

Accepted

## Context

ovhtool needs to work equally well for a human at a terminal and for a
script or AI agent calling it non-interactively. These two audiences want
different things from the same command: a human wants tables, colors, and
prompts; a script wants structured, parseable output and zero blocking
prompts.

## Decision

- A global `--json` flag switches all output (success and errors) to
  structured JSON instead of colored tables. JSON errors follow
  `{ "error": { "code": string, "message": string } }`.
- Standardized exit codes: `0` success, `1` OVH API error (reformatted,
  never a raw stack trace), `2` usage/validation error (missing flag,
  invalid value, ambiguous account, etc.).
- No action command (`add`/`create`/`update`/`delete`) blocks on an
  interactive prompt if every required flag is already supplied. `auth
  setup` is the only inherently interactive command (unless `--app-key`/
  `--app-secret` are given).
- Mode is detected per invocation: TTY present and no `--json` → human mode
  (prompts allowed, Ink renders); otherwise → agent mode (everything must be
  drivable by flags, zero Ink code executed).
- Each commander subcommand determines the mode before touching Ink at all.
  Agent mode calls `agentActions.ts` directly; human mode does a single
  `render(<App/>)` for the whole session.

## Consequences

- Every command's business logic (`src/commands/*.ts`) is written as pure
  functions returning typed data/errors, with no direct `console` access —
  both the agent dispatcher and the Ink layer call the same functions.
- Agents (and CI, and shell scripts) can rely on stable exit codes and a
  stable JSON error shape instead of scraping human-readable text.
- Adding a new mutation command means writing it once and getting both
  surfaces for free, as long as it goes through the same dispatch pattern.
