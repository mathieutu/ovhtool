# 0001 — No third-party Ink UI component library

## Status

Accepted

## Context

The interactive layer is built with [Ink](https://github.com/vadimdemedes/ink)
(React for the terminal). Several third-party component libraries exist:
`@inkjs/ui`, `ink-text-input`, `ink-select-input`, `ink-spinner`,
`ink-confirm-input`, `ink-table`, `ink-form`.

Evaluating them against this project's needs:

- `ink-table` only does static rendering — no selection, keyboard
  navigation, or filtering. Unusable for a `Table` that needs a permanent
  filter, row navigation, and per-row actions.
- `ink-form` is tempting (masking, select, `initialValue`) but built and
  tested against Ink 4 / React 18 — three major versions behind this
  project's Ink 7 / React 19 — and doesn't document an "Enter advances to
  the next field" navigation model.
- The remaining building blocks (`ink-text-input`, `ink-select-input`,
  `ink-spinner`, `ink-confirm-input`, `@inkjs/ui`) are all more or less
  unmaintained (one to six years without a release). None is meaningfully
  healthier than the others, so there's no reason to prefer an external
  dependency over hand-rolled code for components this simple.

## Decision

All presentation primitives (`TextInput`, `PasswordInput`, `Select`,
`ConfirmInput`, `Spinner`, `Alert`) are written by hand directly on top of
`ink` (`Box`, `Text`, `useInput`). Each is 15–30 lines. This guarantees a
consistent internal convention (see `Form`, ADR-0005) rather than stitching
together heterogeneous APIs from several authors.

The final presentation dependencies are `ink` + `react` only. `chalk` and
`open` remain used for agent-mode output/errors and `auth setup` (opening a
browser), unrelated to this decision.

## Consequences

- No risk of an abandoned dependency breaking under an Ink/React major bump.
- More code to own and test (`test/form.test.ts`, `test/useKeymap.test.ts`,
  etc. extract the non-trivial logic as pure functions so it can be tested
  without mounting Ink components).
- New primitives must be added by hand rather than installed.
