# Contributing

Thanks for considering contributing to ovhtool.

## Issues

Bug reports and questions are welcome as [issues](https://github.com/mathieutu/ovhtool/issues). Please include enough context to reproduce the problem (steps, expected vs. actual behavior, relevant output — with `--json` where possible).

For anything involving leaked or compromised OVH credentials, don't include the actual key material in the issue — describe the problem and revoke the affected `consumerKey` from the OVH customer panel first (see the README's Security section).

## Pull requests

- **Bug fixes, typos, small improvements:** feel free to open a PR directly.
- **New features or larger changes:** open an issue first to discuss the idea before writing code. This avoids wasted effort on a PR that doesn't fit the project's direction.

Before opening a PR:

- Follow the existing code conventions (check sibling files if unsure).
- Add or update tests for the behavior you're changing, and run:
  ```bash
  yarn typecheck
  yarn test
  yarn build
  ```
  All three must pass. There's no CI-enforced formatter/linter yet — match the style of the surrounding code.
- Keep the PR focused on a single concern.
- Write commit messages following the project's convention (see below).
- Keep the PR description clear about what changed and why, and link the discussion issue for any feature work.

See [README.md](README.md) for the full development workflow (`yarn dev`, `yarn build`, `yarn link`).

## Design decisions

Non-obvious architectural choices are recorded in [docs/adr](docs/adr) as short Architecture Decision Records. If your change conflicts with one of them, either explain in the PR why the decision no longer holds, or add a new ADR that supersedes it — don't silently diverge from a documented decision.

### Commit message convention

Commits follow a [Gitmoji](https://gitmoji.dev) style: `<emoji> [Scope — ]Message`.

- **Emoji** first, summarizing the type of change (✨ feature, 🐛 fix, ♻️ refactor, ✅ tests, 🔥 removal, 💄 UI, 🚸 UX, ⚡️ perf, 📝 docs, ⬆️ deps, 🔨 tooling, 💚 CI/build, 🚑️ hotfix, 🔒️ security, 🌐 i18n, 🧑‍💻 DX, ...).
- **Scope** (optional): the feature/module name, capitalized, followed by `—` (e.g. `DNS —`).
- **Message**: imperative mood, capitalized, in English.

Example: `🐛 Mail — fix redirection id not matching after a domain transfer`

## AI-assisted contributions

Using AI coding agents to help write a contribution is fine. However, **you are responsible for what you submit**: you must have reviewed, understood, and tested the code yourself before opening the PR. It has to work against a real OVH account (or be clearly marked as untested if you don't have one to test against), and you have to be able to explain and defend every part of it — this project mutates real DNS zones and mailboxes, so an unreviewed agent output here is riskier than average.

PRs that read as unreviewed agent output — untested, not understood by the submitter, or that the submitter can't explain — will be closed without further effort. Please show that your contribution is worth more than the $20/month subscription — and the liters of water — it took to generate it.

## License

By contributing, you agree that your contributions will be licensed under the project's [AGPL-3.0 license](LICENSE).
