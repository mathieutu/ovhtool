# 0012 — Build tooling split: `tsc` for the published binary, `tsx` for the dev loop

## Status

Accepted

## Context

The pure business logic (`config.ts`, `diff.ts`, `accountResolver.ts`,
`commands/*.ts`, `agentActions.ts`) has no JSX and can run natively via
Node's built-in TypeScript stripping (`node --test` directly on `.ts`,
Node ≥ 23.6). The interactive layer (`src/ink/**`) uses JSX and needs a
real compile step regardless. The published CLI needs one artifact that
covers both.

## Decision

- `yarn build` (`tsc -p tsconfig.build.json`) is the **only** path to the
  binary that actually ships and runs (`dist/bin/ovhtool.js`), and doubles
  as the type-check. It compiles all of `src/`, including the pure layer —
  the "no build step" property only applies to running tests in dev
  (`node --test` on `.ts` directly), not to the published artifact, which
  is always plain compiled JS. The end user installing the CLI never needs
  Node's native strip-types support or any build tooling at all.
- `tsx` is used only for the dev loop (`yarn dev` → `tsx bin/ovhtool.ts`,
  deliberately **without** `--watch` — `tsx watch`'s built-in "press Return
  to restart" is triggered by *any* stdin byte, not just Enter, which
  fights with the interactive Ink app reading its own keystrokes and
  restarts the whole app on every keypress instead of navigating). It's
  never used to produce the published build:
  - `tsx` (esbuild) doesn't type-check — `tsc --noEmit` would have to run
    separately anyway, so there's no emission benefit to using it there.
  - Re-transpiling on every invocation adds startup overhead — costly for a
    CLI relaunched many times a day, unlike a long-running server.
  - Avoids adding `tsx`/esbuild as a runtime dependency for anyone
    installing the published CLI.
- Two `tsconfig` files: `tsconfig.json` (`noEmit: true`, includes `src` +
  `test`, used for `tsc --noEmit` and the editor) and
  `tsconfig.build.json` (extends the former, `outDir: dist`, `rootDir:
  src`, excludes tests, `jsx: "react-jsx"` — the only config `yarn build`
  uses).

## Consequences

- Two ways to run the code exist during development (`tsx` for a quick
  manual check, `yarn build && node dist/...` for the real thing) and they
  must be kept behaviorally equivalent — a bug that only reproduces after
  a real `tsc` compile could hide during `tsx`-based development.
- `yarn test` stays fast (no build step) since it only exercises the pure
  layer directly.
