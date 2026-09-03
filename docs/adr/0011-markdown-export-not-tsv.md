# 0011 — Markdown export instead of TSV

## Status

Accepted

## Context

Table data needs to be exportable outside the interactive app: copying the
currently filtered rows to the clipboard (Ctrl+Y), and piping `ovhtool`'s
output when stdout isn't a TTY and `--json` wasn't requested. The
straightforward format for this is TSV (tab-separated), which is what an
earlier version of the tool used.

## Decision

Every one of these export paths — clipboard copy, `--copy`, and non-TTY
piped output without `--json` — produces a **Markdown table**
(`| column | column |` with a `| --- | --- |` separator row) instead of
TSV. `cliPure.ts` exposes this as `toMarkdownTable`, padding every column to
its widest cell so the exported text stays readable even before it's
rendered by a Markdown viewer.

## Consequences

- Pasting exported data directly into a PR description, an issue, a chat
  message, or a doc (all commonly Markdown) renders as a real table with no
  extra step, which is the primary way this output actually gets used.
- TSV pastes more directly into a spreadsheet cell-by-cell; that convenience
  is traded away by this decision. Anyone needing that shape can still get
  it via `--json` and a small transform.
