import { Command } from 'commander'
import chalk from 'chalk'
import { createElement } from 'react'
import { render } from 'ink'

import { toOvhtoolError, ValidationError } from './errors.ts'
import { isPlausibleDomain } from './cliPure.ts'
import * as agent from './agentActions.ts'
import { App, ErrorBoundary, type AppProps, type ScreenName } from './ink/app.tsx'
import type { DnsInitialPanel } from './ink/screens/dns.tsx'
import type { MailInitialPanel } from './ink/screens/mail.tsx'
import type { MailRedirectInitialPanel } from './ink/screens/mailRedirect.tsx'
import type { AccountsInitialPanel } from './ink/screens/accounts.tsx'

// ---------------------------------------------------------------------------
// Global context (human vs agent mode, JSON output)
// ---------------------------------------------------------------------------

const program = new Command()
  .name('ovhtool')
  .description(
    'CLI to manage DNS zones, mail accounts and email redirections across several OVH accounts. ' +
      'Agent workflow for any change: 1) find the target with a "list" subcommand and --search/--from (add --json), ' +
      '2) preview it with --dry-run (never calls the OVH API to change anything), 3) only then re-run with --yes to apply.',
  )
  .option('--json', 'Structured JSON output (agent mode)')
  .option('--account <name>', 'OVH account to use (otherwise resolved automatically from the domain)')

function isJsonMode(): boolean {
  return Boolean(program.opts().json)
}

function isHumanMode(): boolean {
  return Boolean(process.stdout.isTTY) && Boolean(process.stdin.isTTY) && !isJsonMode()
}

type Opts = Record<string, any>

function opts(command: Command): Opts {
  return command.optsWithGlobals()
}

const output: agent.Output = {
  get json() {
    return isJsonMode()
  },
  write: (data) => process.stdout.write(JSON.stringify(data, null, 2) + '\n'),
  log: (text) => console.log(text),
}

function reportError(error: unknown): void {
  const err = toOvhtoolError(error)
  if (isJsonMode()) {
    process.stdout.write(JSON.stringify({ error: { code: err.code, message: err.message } }, null, 2) + '\n')
  } else {
    process.stderr.write(chalk.red(`✖ ${err.message}`) + '\n')
  }
  process.exitCode = err.exitCode
}

/**
 * Mounts the whole interactive layer exactly once for the session
 * (ADR-0005, ADR-0002) — never a `render()` per prompt/step.
 */
/**
 * Enters the terminal's alternate screen buffer for the session (like
 * `vim`/`less`/`htop`): restores the previous shell content on exit instead
 * of leaving the dashboard in scrollback, and — as a side effect most
 * terminals implement for any alt-screen app — makes mouse wheel/trackpad
 * scroll translate to ↑/↓ key presses (xterm's "alternate scroll" mode),
 * so `Table` scrolls with the wheel with no custom mouse-event parsing.
 */
async function runInkApp(props: AppProps): Promise<void> {
  const supportsAltScreen = Boolean(process.stdout.isTTY)
  if (supportsAltScreen) process.stdout.write('\x1b[?1049h\x1b[?1007h')
  try {
    const { waitUntilExit } = render(createElement(ErrorBoundary, null, createElement(App, props)))
    await waitUntilExit()
  } finally {
    if (supportsAltScreen) process.stdout.write('\x1b[?1007l\x1b[?1049l')
  }
}

/** Runs `agentFn` off a TTY / under --json, or mounts the Ink app otherwise. */
function dispatch(agentFn: () => Promise<void>, appProps: () => AppProps) {
  return async () => {
    try {
      if (isHumanMode()) await runInkApp(appProps())
      else await agentFn()
    } catch (error) {
      reportError(error)
    }
  }
}

function requireHumanMode(subcommands: string): void {
  if (!isHumanMode()) {
    throw new ValidationError(`Specify a subcommand: ${subcommands}.`, 'missing_subcommand')
  }
}

function defined(values: Record<string, string | undefined>): Record<string, string | undefined> | undefined {
  const entries = Object.entries(values).filter(([, v]) => v !== undefined && v !== '')
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

// ---------------------------------------------------------------------------
// DNS commands
// ---------------------------------------------------------------------------

const dnsCmd = program.command('dns [zone]').description('Manage DNS zones')

// Both orders work: `ovhtool <domain> dns` (domain-first, pins it for the
// whole session — see the root command below) and this one, a direct
// `ovhtool dns <zone>` shortcut scoped to just this screen.
dnsCmd.action((zone: string | undefined) =>
  dispatch(
    async () => requireHumanMode('list, add, update, delete'),
    () => ({ initialScreen: 'dns' as ScreenName, initialDomain: zone, initialAccount: opts(dnsCmd).account }),
  )(),
)

dnsCmd
  .command('list [zone]')
  .description('List the DNS records of the zone')
  .option('--type <type>', 'Filter by record type (server-side)')
  .option('--search <term>', 'Pre-fill the interactive filter (or filter client-side in --json/piped output)')
  .option('--copy', 'Copy the table to the clipboard as Markdown and exit, without opening the interactive view')
  .action((zone: string | undefined, _o: unknown, command: Command) =>
    dispatch(
      () => agent.dnsList(output, zone, opts(command)),
      () => ({ initialScreen: 'dns' as ScreenName, initialDomain: zone, initialAccount: opts(command).account, initialFilter: opts(command).search }),
    )(),
  )

dnsCmd
  .command('add [zone]')
  .description('Add a DNS record')
  .option('--subdomain <sub>', 'Subdomain (empty or "@" for the root)')
  .option('--value <value>', 'Target value of the record')
  .option('--type <type>', 'Record type (prompted if omitted in human mode)')
  .option('--ttl <ttl>', 'TTL in seconds')
  .option('--yes', 'Apply without confirmation')
  .option('--dry-run', 'Show the diff without applying it')
  .action((zone: string | undefined, _o: unknown, command: Command) =>
    dispatch(
      () => agent.dnsAdd(output, zone, opts(command)),
      () => {
        const o = opts(command)
        const initialDnsPanel: DnsInitialPanel = { kind: 'add', values: defined({ subdomain: o.subdomain, value: o.value, type: o.type, ttl: o.ttl }) }
        return { initialScreen: 'dns' as ScreenName, initialDomain: zone, initialAccount: o.account, initialDnsPanel }
      },
    )(),
  )

dnsCmd
  .command('update [zone]')
  .description('Update a DNS record. Agent workflow: find the id with "dns list <zone> --search <term> --json", preview with --dry-run, then re-run with --yes to apply')
  .option('--id <id>', 'Record id — prompted with a fuzzy search in human mode; in agent mode, find it first with "dns list <zone> --search <term> --json"')
  .option('--value <value>', 'New target value')
  .option('--subdomain <sub>', 'New subdomain')
  .option('--ttl <ttl>', 'New TTL in seconds')
  .option('--yes', 'Apply without confirmation')
  .option('--dry-run', 'Preview the diff without applying it — safe to run with no other flags to see what a change would do before committing to --yes')
  .action((zone: string | undefined, _o: unknown, command: Command) =>
    dispatch(
      () => agent.dnsUpdate(output, zone, opts(command)),
      () => {
        const o = opts(command)
        const initialDnsPanel: DnsInitialPanel = { kind: 'edit', id: o.id, values: defined({ value: o.value, subdomain: o.subdomain, ttl: o.ttl }) }
        return { initialScreen: 'dns' as ScreenName, initialDomain: zone, initialAccount: o.account, initialDnsPanel }
      },
    )(),
  )

dnsCmd
  .command('delete [zone]')
  .description('Delete a DNS record. Agent workflow: find the id with "dns list <zone> --search <term> --json", preview with --dry-run, then re-run with --yes to apply')
  .option('--id <id>', 'Record id — prompted with a fuzzy search in human mode; in agent mode, find it first with "dns list <zone> --search <term> --json"')
  .option('--yes', 'Apply without confirmation')
  .option('--dry-run', 'Preview the diff without applying it — safe to run with no other flags to see what a change would do before committing to --yes')
  .action((zone: string | undefined, _o: unknown, command: Command) =>
    dispatch(
      () => agent.dnsDelete(output, zone, opts(command)),
      () => {
        const o = opts(command)
        const initialDnsPanel: DnsInitialPanel = { kind: 'delete', id: o.id }
        return { initialScreen: 'dns' as ScreenName, initialDomain: zone, initialAccount: o.account, initialDnsPanel }
      },
    )(),
  )

// ---------------------------------------------------------------------------
// Mail commands
// ---------------------------------------------------------------------------

const mailCmd = program.command('mail [domain]').description('Manage mail accounts')

// Both orders work: `ovhtool <domain> mail` (domain-first, pins it for the
// whole session — see the root command below) and this one, a direct
// `ovhtool mail <domain>` shortcut scoped to just this screen.
mailCmd.action((domain: string | undefined) =>
  dispatch(
    async () => requireHumanMode('list, create, delete, passwd'),
    () => ({ initialScreen: 'mail' as ScreenName, initialDomain: domain, initialAccount: opts(mailCmd).account }),
  )(),
)

mailCmd
  .command('list [domain]')
  .description('List the mail accounts of the domain')
  .option('--search <term>', 'Pre-fill the interactive filter (or filter client-side in --json/piped output)')
  .option('--copy', 'Copy the table to the clipboard as Markdown and exit, without opening the interactive view')
  .action((domain: string | undefined, _o: unknown, command: Command) =>
    dispatch(
      () => agent.mailList(output, domain, opts(command)),
      () => ({ initialScreen: 'mail' as ScreenName, initialDomain: domain, initialAccount: opts(command).account, initialFilter: opts(command).search }),
    )(),
  )

mailCmd
  .command('create [domain]')
  .description('Create a mail account')
  .option('--account-name <name>', 'Account name (local part of the address)')
  .option('--size <mb>', 'Size in MB')
  .option('--description <description>', 'Account description')
  .option('--password-stdin', 'Read the password from stdin (agent mode)')
  .option('--yes', 'Apply without confirmation')
  .option('--dry-run', 'Show the diff without applying it')
  .action((domain: string | undefined, _o: unknown, command: Command) =>
    dispatch(
      () => agent.mailCreate(output, domain, opts(command)),
      () => {
        const o = opts(command)
        const initialMailPanel: MailInitialPanel = { kind: 'add', values: defined({ accountName: o.accountName, size: o.size, description: o.description }) }
        return { initialScreen: 'mail' as ScreenName, initialDomain: domain, initialAccount: o.account, initialMailPanel }
      },
    )(),
  )

mailCmd
  .command('delete [domain]')
  .description('Delete a mail account. Agent workflow: find the exact accountName with "mail list <domain> --search <term> --json", preview with --dry-run, then re-run with --yes to apply')
  .option('--account-name <name>', 'Account name — prompted with a fuzzy search in human mode; in agent mode, find it first with "mail list <domain> --search <term> --json"')
  .option('--yes', 'Apply without confirmation')
  .option('--dry-run', 'Preview the diff without applying it — safe to run with no other flags to see what a change would do before committing to --yes')
  .action((domain: string | undefined, _o: unknown, command: Command) =>
    dispatch(
      () => agent.mailDelete(output, domain, opts(command)),
      () => {
        const o = opts(command)
        const initialMailPanel: MailInitialPanel = { kind: 'delete', id: o.accountName }
        return { initialScreen: 'mail' as ScreenName, initialDomain: domain, initialAccount: o.account, initialMailPanel }
      },
    )(),
  )

mailCmd
  .command('passwd [domain]')
  .description('Change a mail account password. Agent workflow: find the exact accountName with "mail list <domain> --search <term> --json", preview with --dry-run, then re-run with --yes to apply')
  .option('--account-name <name>', 'Account name — prompted with a fuzzy search in human mode; in agent mode, find it first with "mail list <domain> --search <term> --json"')
  .option('--password-stdin', 'Read the password from stdin (agent mode)')
  .option('--yes', 'Apply without confirmation')
  .option('--dry-run', 'Preview the diff without applying it — safe to run with no other flags to see what a change would do before committing to --yes')
  .action((domain: string | undefined, _o: unknown, command: Command) =>
    dispatch(
      () => agent.mailPasswd(output, domain, opts(command)),
      () => {
        const o = opts(command)
        const initialMailPanel: MailInitialPanel = { kind: 'edit', id: o.accountName }
        return { initialScreen: 'mail' as ScreenName, initialDomain: domain, initialAccount: o.account, initialMailPanel }
      },
    )(),
  )

// ---------------------------------------------------------------------------
// Email redirection commands
// ---------------------------------------------------------------------------

const mailRedirectCmd = program.command('mail-redirect [domain]').description('Manage email redirections')

// Both orders work: `ovhtool <domain> mail-redirect` (domain-first, pins it
// for the whole session — see the root command below) and this one, a
// direct `ovhtool mail-redirect <domain>` shortcut scoped to just this screen.
mailRedirectCmd.action((domain: string | undefined) =>
  dispatch(
    async () => requireHumanMode('list, add, remove'),
    () => ({ initialScreen: 'mailRedirect' as ScreenName, initialDomain: domain, initialAccount: opts(mailRedirectCmd).account }),
  )(),
)

mailRedirectCmd
  .command('list [domain]')
  .description('List the email redirections of the domain')
  .option('--from <email>', 'Filter by source address (server-side)')
  .option('--search <term>', 'Pre-fill the interactive filter (or filter client-side in --json/piped output)')
  .option('--copy', 'Copy the table to the clipboard as Markdown and exit, without opening the interactive view')
  .action((domain: string | undefined, _o: unknown, command: Command) =>
    dispatch(
      () => agent.mailRedirectList(output, domain, opts(command)),
      () => ({ initialScreen: 'mailRedirect' as ScreenName, initialDomain: domain, initialAccount: opts(command).account, initialFilter: opts(command).search }),
    )(),
  )

mailRedirectCmd
  .command('add [domain]')
  .description('Add an email redirection')
  .option('--from <email>', 'Source address')
  .option('--to <email>', 'Destination address')
  .option('--yes', 'Apply without confirmation')
  .option('--dry-run', 'Show the diff without applying it')
  .action((domain: string | undefined, _o: unknown, command: Command) =>
    dispatch(
      () => agent.mailRedirectAdd(output, domain, opts(command)),
      () => {
        const o = opts(command)
        const initialMailRedirectPanel: MailRedirectInitialPanel = { kind: 'add', values: defined({ from: o.from, to: o.to }) }
        return { initialScreen: 'mailRedirect' as ScreenName, initialDomain: domain, initialAccount: o.account, initialMailRedirectPanel }
      },
    )(),
  )

mailRedirectCmd
  .command('remove [domain]')
  .description('Remove an email redirection. Agent workflow: find the id with "mail-redirect list <domain> --from <address> --json" (or --search), preview with --dry-run, then re-run with --yes to apply')
  .option('--id <id>', 'Redirection id — prompted with a fuzzy search in human mode; in agent mode, find it first with "mail-redirect list <domain> --from <address> --json"')
  .option('--yes', 'Apply without confirmation')
  .option('--dry-run', 'Preview the diff without applying it — safe to run with no other flags to see what a change would do before committing to --yes')
  .action((domain: string | undefined, _o: unknown, command: Command) =>
    dispatch(
      () => agent.mailRedirectRemove(output, domain, opts(command)),
      () => {
        const o = opts(command)
        const initialMailRedirectPanel: MailRedirectInitialPanel = { kind: 'delete', id: o.id }
        return { initialScreen: 'mailRedirect' as ScreenName, initialDomain: domain, initialAccount: o.account, initialMailRedirectPanel }
      },
    )(),
  )

// ---------------------------------------------------------------------------
// Accounts commands (local profiles + cache)
// ---------------------------------------------------------------------------

const accountsCmd = program.command('accounts').description('Manage local OVH profiles')

accountsCmd.action(
  dispatch(
    async () => requireHumanMode('list, set-default, remove, whoami, forget'),
    () => ({ initialScreen: 'accounts' as ScreenName }),
  ),
)

accountsCmd
  .command('list')
  .description('List the configured accounts')
  .option('--search <term>', 'Pre-fill the interactive filter (or filter client-side in --json/piped output)')
  .option('--copy', 'Copy the table to the clipboard as Markdown and exit, without opening the interactive view')
  .action((_o: unknown, command: Command) =>
    dispatch(
      () => agent.accountsListCmd(output, opts(command)),
      () => ({ initialScreen: 'accounts' as ScreenName }),
    )(),
  )

accountsCmd
  .command('set-default [name]')
  .description('Set the default account')
  .action((name: string | undefined) =>
    dispatch(
      () => agent.accountsSetDefault(output, name),
      () => ({ initialScreen: 'accounts' as ScreenName }),
    )(),
  )

accountsCmd
  .command('remove [name]')
  .description('Remove a local profile')
  .action((name: string | undefined) =>
    dispatch(
      () => agent.accountsRemoveCmd(output, name),
      () => ({ initialScreen: 'accounts' as ScreenName }),
    )(),
  )

accountsCmd
  .command('whoami [domain]')
  .description('Find which account(s) have access to the domain and update the cache')
  .action((domain: string | undefined) =>
    dispatch(
      () => agent.accountsWhoamiCmd(output, domain),
      () => {
        const initialAccountsPanel: AccountsInitialPanel = { kind: 'whoami', domain }
        return { initialScreen: 'accounts' as ScreenName, initialAccountsPanel }
      },
    )(),
  )

accountsCmd
  .command('forget [domain]')
  .description('Remove a domain from the account resolution cache')
  .action((domain: string | undefined) =>
    dispatch(
      () => agent.accountsForgetCmd(output, domain),
      () => ({ initialScreen: 'accounts' as ScreenName }),
    )(),
  )

// ---------------------------------------------------------------------------
// Auth command
// ---------------------------------------------------------------------------

const authCmd = program
  .command('auth')
  .description('Authenticate OVH profiles')
  .option('--account <name>', 'Name of the profile to create/update')
  .option('--endpoint <endpoint>', 'ovh-eu | ovh-us | ovh-ca', 'ovh-eu')
  .option('--app-key <key>', 'Application Key (skips the prompt/browser)')
  .option('--app-secret <secret>', 'Application Secret (skips the prompt/browser)')

// Human mode has no dedicated "auth" dashboard: creating/updating a profile
// is a Ctrl+N action on the `accounts` screen's profiles table, so a
// qualified `auth`/`auth setup` command opens that screen with the panel
// already pre-filled (same convention as any other qualified shortcut).
authCmd.action(
  dispatch(
    () => agent.authSetup(output, opts(authCmd)),
    () => {
      const o = opts(authCmd)
      const initialAccountsPanel: AccountsInitialPanel = { kind: 'auth', account: o.account, endpoint: o.endpoint, appKey: o.appKey, appSecret: o.appSecret }
      return { initialScreen: 'accounts' as ScreenName, initialAccountsPanel }
    },
  ),
)

authCmd
  .command('setup')
  .description('Create or update an OVH profile (interactive unless --app-key/--app-secret are provided)')
  .option('--account <name>', 'Name of the profile to create/update')
  .option('--endpoint <endpoint>', 'ovh-eu | ovh-us | ovh-ca', 'ovh-eu')
  .option('--app-key <key>', 'Application Key (skips the prompt/browser)')
  .option('--app-secret <secret>', 'Application Secret (skips the prompt/browser)')
  .action((_o: unknown, command: Command) =>
    dispatch(
      () => agent.authSetup(output, opts(command)),
      () => {
        const o = opts(command)
        const initialAccountsPanel: AccountsInitialPanel = { kind: 'auth', account: o.account, endpoint: o.endpoint, appKey: o.appKey, appSecret: o.appSecret }
        return { initialScreen: 'accounts' as ScreenName, initialAccountsPanel }
      },
    )(),
  )

// ---------------------------------------------------------------------------
// No subcommand: either the bare home screen, or a domain-first shortcut
// (`ovhtool <domain>`) that pins that domain for the whole session — every
// service opened from the home menu (DNS/Mail/Redirections) defaults to it
// until changed from within a screen, instead of asking again each time
// (ADR-0007, extended to survive across service switches).
// ---------------------------------------------------------------------------

const DOMAIN_FIRST_SERVICES: Record<string, ScreenName> = { dns: 'dns', mail: 'mail', 'mail-redirect': 'mailRedirect', accounts: 'accounts' }

program.argument('[domain]', 'Pin this domain for the session and open the home menu, instead of asking for it in every service')
program.argument('[service]', 'Optional: jump straight to this service (dns, mail, mail-redirect, accounts) instead of the home menu')

program.action((domain: string | undefined, service: string | undefined) =>
  dispatch(
    async () => requireHumanMode('dns, mail, mail-redirect, accounts, auth'),
    () => {
      // A mistyped subcommand (e.g. "ovhtool redirections foo.dev") never
      // reaches any `program.command(...)` handler — Commander falls
      // through to these two bare positional arguments instead, which would
      // otherwise silently pin "redirections" as the domain and go home.
      // Reject early rather than let that surface later as a confusing
      // "no account has access to domain X".
      const validServices = Object.keys(DOMAIN_FIRST_SERVICES).join(', ')
      if (domain !== undefined && !isPlausibleDomain(domain)) {
        throw new ValidationError(
          `"${domain}" isn't a known subcommand and doesn't look like a domain (no "."). Valid subcommands: ${validServices}, auth. To pin a domain instead, pass a full one (e.g. "ovhtool example.com").`,
          'invalid_domain',
        )
      }
      // The first word is just as likely to be the actual mistake (a
      // mistyped subcommand, as above) as the second, so the message below
      // shows both valid readings instead of blaming whichever happens to
      // occupy the "service" slot.
      if (service !== undefined && !(service in DOMAIN_FIRST_SERVICES)) {
        // Deliberately doesn't guess which of the two words was the typo by
        // echoing it back into a "did you mean" example — "redirections" is
        // just as plausible a mistyped service as it is an odd domain name.
        throw new ValidationError(
          `"${domain} ${service}" doesn't match a known usage: run a subcommand directly ("ovhtool <service> [domain]") or pin a domain first ("ovhtool [domain] <service>"). Valid services: ${validServices}.`,
          'unknown_service',
        )
      }
      return { initialScreen: (service && DOMAIN_FIRST_SERVICES[service]) || ('home' as ScreenName), pinnedDomain: domain, pinnedAccount: program.opts().account }
    },
  )(),
)

// ---------------------------------------------------------------------------

export function run(argv: readonly string[] = process.argv): Promise<Command> {
  return program.parseAsync(argv as string[])
}

export { program }
