# ovhtool

Local CLI to manage DNS zones, mail accounts and email redirections across
several OVH accounts (personal + clients), without going through the web
dashboard.

Usable both from a terminal (human, with prompts and confirmations) and by a
scripted agent (`--json`, standardized exit codes, no blocking prompt as long
as all required flags are provided).

## Installation

```bash
yarn install
yarn build
yarn link
```

`ovhtool` is then available globally. `yarn install` runs the build
automatically (via the `prepare` script); rerun `yarn build` after pulling
changes.

> **Note**: the interactive layer is built with [Ink](https://github.com/vadimdemedes/ink)
> (React for CLIs), which requires JSX — a real TypeScript build (`tsc`,
> `yarn build` → `dist/`) is needed to run the CLI. The pure business logic
> (`src/config.ts`, `src/diff.ts`, `src/accountResolver.ts`,
> `src/commands/*.ts`, `src/agentActions.ts`) has no JSX and stays plain
> `.ts`, executed natively by Node with no build step — that's what
> `yarn test` runs directly, with no `yarn build` prerequisite. See
> [ADR-0012](docs/adr/0012-build-tooling-split.md) for why the build is
> split this way.

Requirement: Node.js ≥ 23 (native TypeScript execution of the pure/test
layer; the built CLI itself only needs a modern Node, but the toolchain is
pinned to what the rest of the project uses).

During development, without `yarn link`:

```bash
yarn ovhtool <command>   # builds then runs
# or, after a build:
node ./dist/bin/ovhtool.js <command>
```

> **Note**: `yarn dev` runs `tsx bin/ovhtool.ts` directly (no watch mode —
> `tsx watch`'s built-in "press Return to restart" is unconditionally
> triggered by *any* stdin byte, not just Enter, which fights with the
> interactive Ink app reading its own keystrokes and restarts the whole app
> back to the home screen on every keypress). Restart manually after each
> change, or use a full `yarn build && node ./dist/bin/ovhtool.js`.

## Getting API keys (`ovhtool auth setup`)

```bash
ovhtool auth setup --account perso
```

In interactive mode, the command:

1. opens the OVH application-creation page matching the endpoint (`ovh-eu`
   by default, see `--endpoint`);
2. asks (masked input) for the Application Key / Secret once the application
   has been created on OVH;
3. requests a `consumerKey` scoped only to `/domain/*` and `/email/*`
   (read/write) — never a broader access than necessary;
4. opens the validation page returned by OVH and waits for a confirmation
   (Enter) before saving;
5. saves the profile (`endpoint`, `appKey`, `appSecret`, `consumerKey`) into
   the local config.

In agent mode (`--json` or no TTY), `--app-key` and `--app-secret` are
required (no browser, no prompt); the OVH validation link is simply
printed/returned, to be validated manually once:

```bash
ovhtool auth setup --account client-x --app-key XXX --app-secret YYY --json
```

## Interactive mode

The whole interactive layer is built with [Ink](https://github.com/vadimdemedes/ink)
(React for the terminal) as a single persistent, dashboard-style app — not a
sequence of blocking prompts. Every group (`ovhtool dns`, `mail`,
`mail-redirect`, `accounts`) opens directly on a live, filterable table of
its data, with add/edit/delete as contextual actions on the selected row.
Running `ovhtool` with no arguments at all opens a home screen to pick a
service; the account/zone context can be switched at any time without
restarting. Any argument or flag already given on the command line is
honored, used as a shortcut straight to the relevant action.

The domain always comes first on the command line: `ovhtool <domain>` pins
that domain for the whole session and opens the home screen — DNS, Mail and
Redirections all default to it (no domain prompt in any of them) until
forgotten (`Escape` at the home screen). Add a service name to jump straight
into it:
`ovhtool bar.fr dns` opens the DNS dashboard directly, already scoped to
`bar.fr`. Creating or updating a local profile lives in `ovhtool accounts`
(`Ctrl+N` on the accounts table) rather than a separate top-level menu; the
`ovhtool auth`/`ovhtool auth setup` commands are still there for scripting
and open that same panel directly.

See [docs/adr](docs/adr) for the design decisions behind the interaction
model — keybindings and navigation ([ADR-0005](docs/adr/0005-single-render-tree-flat-navigation.md),
[ADR-0006](docs/adr/0006-permanent-filter-keyboard-grammar.md)), the
domain-first CLI syntax ([ADR-0007](docs/adr/0007-domain-first-cli-pinned-domain.md)),
the diff/confirmation panel ([ADR-0003](docs/adr/0003-diff-confirm-apply-safety-pattern.md)),
and the Markdown clipboard export ([ADR-0011](docs/adr/0011-markdown-export-not-tsv.md),
`Ctrl+Y` in the table, or `--copy` / piped-non-TTY output — see below).

Agent mode (`--json` or no TTY) never prompts: every value must be passed
explicitly, or the command fails with a validation error (exit code `2`).

Non-interactive escape hatches, for scripting or piping, on every `list`
command:

- `--search <term>` — pre-fills the interactive filter; in `--json` or piped
  (non-TTY) output, filters client-side instead (case-insensitive substring,
  on top of any server-side filter like `--type`/`--from`).
- `--copy` — copies the (filtered) table to the clipboard **as a Markdown
  table** and exits immediately, without opening the interactive view. Uses
  the OS's own clipboard tool (`pbcopy` on macOS, `clip` on Windows,
  `xclip`/`xsel`/`wl-copy` on Linux) — no extra dependency.

```bash
ovhtool dns list bar.fr --search vercel --json
ovhtool mail list bar.fr --copy
```

The full domain in the DNS table (e.g. `www.bar.fr`) is also a clickable
terminal hyperlink (cmd/ctrl-click in most terminals) pointing at
`https://<domain>`.

## Command examples

### DNS

```bash
# Human
ovhtool dns list bar.fr
ovhtool dns add bar.fr --subdomain www --value 1.2.3.4        # opens the add panel, asks for the type
ovhtool dns update bar.fr --id 123456 --ttl 300
ovhtool dns delete bar.fr --id 123456

# Agent
ovhtool dns list bar.fr --type A --json
ovhtool dns add bar.fr --subdomain www --value 1.2.3.4 --type A --yes --json
ovhtool dns delete bar.fr --id 123456 --dry-run --json
```

### Mail

```bash
ovhtool mail list bar.fr
ovhtool mail create bar.fr --account-name contact --size 5000   # asks for the password
echo "S3cr3t!" | ovhtool mail create bar.fr --account-name contact --password-stdin --yes --json
ovhtool mail passwd bar.fr --account-name contact
ovhtool mail delete bar.fr --account-name contact --yes
```

### Email redirections

```bash
ovhtool mail-redirect list bar.fr
ovhtool mail-redirect add bar.fr --from contact@bar.fr --to perso@elsewhere.fr
ovhtool mail-redirect list bar.fr --from contact@bar.fr --json   # to get the id
ovhtool mail-redirect remove bar.fr --id abcdef1234567890 --yes
```

### Accounts (local profiles)

```bash
ovhtool accounts list
ovhtool accounts set-default perso
ovhtool accounts whoami bar.fr      # queries the API, caches it if a single candidate is found
ovhtool accounts forget bar.fr      # useful after a domain transfer
ovhtool accounts remove client-x
```

## Human mode vs agent mode

- **Automatic detection**: TTY present (stdin + stdout) and no `--json` →
  human mode (the interactive Ink app). Otherwise → agent mode (everything
  must be driven by flags, JSON output with `--json`) — see
  [ADR-0002](docs/adr/0002-agent-vs-human-mode-dispatch.md).
- **`--json`** switches every output, success and errors alike, to structured
  JSON. Error format: `{ "error": { "code": "...", "message": "..." } }`.
- **Exit codes**: `0` success, `1` OVH API error (never a raw stack trace),
  `2` usage/validation error (missing flag, invalid value, ambiguous account,
  confirmation required in agent mode without `--yes`/`--dry-run`, etc.).
- No action command (`add`/`create`/`update`/`delete`/`passwd`) blocks on a
  prompt as long as all required flags are provided. Only `auth setup` stays
  interactive by nature (unless `--app-key`/`--app-secret` are provided).

## Diff confirmation

Every `add`/`create`/`update`/`delete`/`passwd` command first computes a diff
(before → after state) of the planned action:

- **Human, without `--yes`**: the diff is displayed, a `y/N` confirmation is
  requested before applying.
- **`--yes`** (human or agent): applied directly, the resulting diff is
  returned in the output.
- **`--dry-run`**: the diff is displayed, never applied. Combined with
  `--yes`, this is an explicit validation error (code `2`).
- An `update` that changes no field is a no-op: nothing is applied, no
  confirmation is requested.

A mail account password never appears in a diff, nor as a plaintext CLI
argument: masked input by default (human), `--password-stdin` in agent mode
(like `docker login --password-stdin`).

## Recommended workflow for scripts and agents

Every mutating command (`update`/`delete`/`remove`/`passwd`) is self-describing
about this via its own `--help` (`ovhtool mail-redirect remove --help`, etc.),
but the shape is always the same, three steps, no exceptions:

1. **Find** the target with the matching `list` subcommand and `--search`
   (or a server-side filter like `--from`/`--type`), plus `--json` to get
   structured output including the `id`/`accountName` you'll need next.
2. **Preview** the exact change with `--dry-run` — this never calls the OVH
   API to mutate anything, only to compute the before/after diff. Safe to
   run as many times as needed.
3. **Apply**, only once the diff looks right, by re-running the same command
   with `--yes` instead of `--dry-run`.

```bash
# 1) find: which redirection sends mail to someone, under a given alias?
ovhtool mail-redirect list bar.fr --from contact@bar.fr --json
# → [{ "id": "abcdef1234567890", "from": "contact@bar.fr", "to": "someone@bar.fr" }]

# 2) preview: never mutates anything
ovhtool mail-redirect remove bar.fr --id abcdef1234567890 --dry-run --json
# → { "applied": false, "diff": { "action": "delete", "changes": [...] } }

# 3) apply, only after reviewing the diff above
ovhtool mail-redirect remove bar.fr --id abcdef1234567890 --yes --json
```

Skipping straight to step 3 without `--yes`/`--dry-run` fails loudly instead
of guessing: `{"error":{"code":"confirmation_required","message":"..."}}`
(exit code `2`), naming both flags again right there.

## Multi-account management

The local config lives by default in `~/.ovhtool/config.json` (overridable
via `OVHTOOL_CONFIG`), with a `domainCache` that remembers which profile
manages which domain:

```json
{
  "default": "perso",
  "profiles": {
    "perso": { "endpoint": "ovh-eu", "appKey": "...", "appSecret": "...", "consumerKey": "..." },
    "client-x": { "endpoint": "ovh-eu", "appKey": "...", "appSecret": "...", "consumerKey": "..." }
  },
  "domainCache": { "bar.fr": "client-x" },
  "tableCache": {
    "dns:client-x:bar.fr": { "data": [/* ... */], "fetchedAt": "2024-01-01T00:00:00.000Z" }
  }
}
```

`tableCache` holds the last DNS/mail/redirections list fetched per
account+domain in the interactive layer: opening a dashboard shows it
immediately (a small "actualisation…" indicator in the footer) while a fresh
copy loads in the background, instead of a blank screen on every visit for a
zone with many records. `Ctrl+X` on the `accounts` screen clears it (never
touches profiles or `domainCache`).

Resolving which account to use for a command on a domain, if `--account` is
not provided:

1. `domainCache` — if the domain is listed there, that profile is used.
2. Otherwise, every known profile is probed to find out which one has access
   to the domain (the same logic is reused by `accounts whoami`).
   - A single candidate → used silently and cached (human and agent).
   - Several candidates or none → human: selection prompt then caching;
     agent/`--json`: validation error (code `2`) listing the candidates found.

## Security

- The config file is saved with restrictive permissions (`0600`); the parent
  directory with `0700`.
- Least-privilege principle: the `consumerKey` generated by `auth setup` is
  only scoped to `GET/POST/PUT/DELETE` on `/domain/*` and `/email/*`.
- The OVH `consumerKey` is **revocable independently** of the
  `appKey`/`appSecret` from the OVH customer panel ("Manage my
  applications"), without affecting other profiles. If you have any doubt
  about a profile (leak, compromised machine, etc.): revoke its
  `consumerKey` in the OVH customer panel, then rerun
  `ovhtool auth setup --account <that-profile>` to generate a new one — other
  profiles are unaffected.
- No mail account password is ever passed as a plaintext CLI argument; use
  the masked prompt (human) or `--password-stdin` (agent).

## Code organization

| File | Role |
| --- | --- |
| [`src/config.ts`](src/config.ts) | Profiles + `domainCache`, reading/writing the local config file |
| [`src/ovhClient.ts`](src/ovhClient.ts) | Generic OVH API call, normalized errors |
| [`src/diff.ts`](src/diff.ts) | Diff computation (create/update/delete), unit tested |
| [`src/accountResolver.ts`](src/accountResolver.ts) | Resolves which account to use for a domain, unit tested |
| [`src/commands/*.ts`](src/commands) | One file per functional domain (`dns`, `mail`, `mailRedirect`, `accounts`, `auth`): pure logic, typed data/errors, no direct `console` access |
| [`src/clipboard.ts`](src/clipboard.ts) | Cross-platform clipboard copy, shelling out to the OS's own tool |
| [`src/agentActions.ts`](src/agentActions.ts) | Agent-mode orchestration: flag-driven, never prompts, no Ink/React involvement |
| [`src/ink/*`](src/ink) | The interactive Ink app — see [docs/adr](docs/adr) for its design decisions |
| [`src/cli.ts`](src/cli.ts) | `commander` wiring, dispatches to `agentActions.ts` or mounts the Ink app depending on mode |
| [`bin/ovhtool.ts`](bin/ovhtool.ts) | Entry point (shebang) |

## Architecture decisions

Significant design decisions (and why they were made) are recorded in
[docs/adr](docs/adr) as short Architecture Decision Records — the safety
pattern for mutations, the domain-first CLI syntax, why there's no
third-party Ink UI library, and so on.

## Tests

```bash
yarn test        # native, no build required
yarn typecheck
```

Unit tests targeted at pure, risk-prone logic (`node:test`): diff computation,
multi-profile account resolution, flag/DNS-type validation, row filtering,
Markdown table formatting, local profile and cache management. No full OVH
API mocks, no integration tests against the real API, and no tests of the
Ink components themselves (verified manually/interactively instead).

## Out of scope (V1)

- No web interface (the logic/presentation split of `src/commands/*.ts`
  allows plugging one in later without a rewrite).
- No integration tests, no OVH API mocks.
- No domain/URL redirection (`/domain/zone/{zone}/redirection`) — only email
  redirection is in scope.

## Contributing

Issues and pull requests are welcome. For anything beyond a small fix,
please open an issue to discuss the change before submitting a new feature
PR — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

ovhtool is open-source software licensed under the
[GNU Affero General Public License v3.0](LICENSE). If you run a modified
version as a network service, you must make your modified source available
to its users — see the license text for the exact terms.
