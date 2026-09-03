# 0003 — Diff / `--dry-run` / `--yes` safety pattern for mutations

## Status

Accepted

## Context

Every mutation (`add`/`create`/`update`/`delete`) changes real production
DNS zones, mailboxes, or redirections across several OVH accounts —
mistakes are costly and sometimes hard to notice (a wrong DNS record can
silently break mail delivery). Both a human and a non-interactive agent
need a way to preview a change before it happens, and neither should be
able to apply a change by accident.

## Decision

Every mutating command:

1. Computes and exposes a **diff** (before state → after state) of the
   intended action.
2. Behaves according to context:
   - Human, TTY, no `--yes`: show the diff, ask for `y/N` confirmation
     (default no), apply only on an explicit `y`.
   - `--yes` given (human or agent): apply directly, return the diff that
     was actually applied.
   - `--dry-run` given: show the diff, never apply. `--dry-run` and `--yes`
     together is a validation error (exit code `2`) rather than an
     implicit precedence rule.
3. If neither `--yes` nor `--dry-run` is given and the context can't prompt
   (agent mode, or human mode without a TTY), the command fails with a
   `confirmation_required` validation error whose message recommends
   `--dry-run` first, then `--yes` to apply.

Every mutating command's `--help` text and the root `--help` describe the
same three-step workflow explicitly (find the target via `list
--search`/`--from --json`, preview with `--dry-run`, apply with `--yes`) so
an agent can discover the safe path from `--help` output alone, without
having read this document.

## Consequences

- No command can silently write to a real account from a non-interactive
  context — the failure mode is a clear, actionable error, not a partial or
  unintended mutation.
- Passwords never appear in a diff in clear text (see `preparePasswdMailAccount`
  in `src/commands`), since the diff is shown to the user and may end up in
  logs.
- Every mutation needs a pure "compute the diff" step (`src/diff.ts`)
  separate from "apply it", which keeps that logic unit-testable without an
  OVH API mock.
