# Architecture Decision Records

This directory records the significant architectural decisions made while
building ovhtool, in the lightweight [MADR](https://adr.github.io/madr/)
style: context, decision, consequences. They replace the original
freeform design specs the project started from — those specs described
intent before implementation; these records describe what was actually
decided and why, kept short and dated instead of rewritten in place as the
project evolves.

New decisions get a new numbered file rather than edits to old ones. If a
later decision supersedes an earlier one, the newer file says so and the
older file gets a one-line "Superseded by ADR-00xx" note at the top instead
of being deleted.

| ADR | Title |
| --- | --- |
| [0001](0001-no-third-party-ink-ui-library.md) | No third-party Ink UI component library |
| [0002](0002-agent-vs-human-mode-dispatch.md) | Agent mode vs. human mode dispatch |
| [0003](0003-diff-confirm-apply-safety-pattern.md) | Diff / `--dry-run` / `--yes` safety pattern for mutations |
| [0004](0004-multi-account-domain-resolution.md) | Multi-account resolution via a local domain cache |
| [0005](0005-single-render-tree-flat-navigation.md) | Single persistent render tree, flat two-level navigation |
| [0006](0006-permanent-filter-keyboard-grammar.md) | Permanent-filter keyboard grammar (no bare-letter shortcuts) |
| [0007](0007-domain-first-cli-pinned-domain.md) | Domain-first CLI syntax and session-pinned domain |
| [0008](0008-combined-account-domain-picker.md) | Combined account+domain picker table |
| [0009](0009-persisted-table-cache.md) | Persisted, stale-while-revalidate table cache |
| [0010](0010-alternate-screen-pinned-layout.md) | Alternate screen buffer and pinned header/footer layout |
| [0011](0011-markdown-export-not-tsv.md) | Markdown export instead of TSV |
| [0012](0012-build-tooling-split.md) | Build tooling split: `tsc` for the published binary, `tsx` for the dev loop |
