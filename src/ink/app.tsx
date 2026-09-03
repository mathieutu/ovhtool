import React, { Component, useState, type ErrorInfo, type ReactNode } from 'react'
import { Box, Text } from 'ink'
import { HomeScreen } from './screens/home.tsx'
import { DnsScreen, type DnsInitialPanel } from './screens/dns.tsx'
import { MailScreen, type MailInitialPanel } from './screens/mail.tsx'
import { MailRedirectScreen, type MailRedirectInitialPanel } from './screens/mailRedirect.tsx'
import { AccountsScreen, type AccountsInitialPanel } from './screens/accounts.tsx'
import { ThemeProvider } from './theme.ts'

export type ScreenName = 'home' | 'dns' | 'mail' | 'mailRedirect' | 'accounts'

export type AppProps = {
  initialScreen: ScreenName
  initialAccount?: string
  initialDomain?: string
  initialFilter?: string
  initialDnsPanel?: DnsInitialPanel
  initialMailPanel?: MailInitialPanel
  initialMailRedirectPanel?: MailRedirectInitialPanel
  initialAccountsPanel?: AccountsInitialPanel
  /**
   * Domain pinned for the whole session (`ovhtool <domain>`, domain-first —
   * see cli.ts): unlike `initialDomain` (a one-shot qualified-command
   * shortcut consumed on the very next `goHome()`), this one survives
   * navigating home and switching services, so DNS/Mail/Redirections all
   * default to it until the user picks a different domain from within a
   * screen (Ctrl+A or its own picker).
   */
  pinnedDomain?: string
  pinnedAccount?: string
}

/**
 * Root of the interactive layer (ADR-0005): a single flat
 * `screen` state, one `render()` call for the whole session — never a
 * generic navigation stack, never a `render()` per prompt/step.
 */
/** Empty initial args, used once the qualified-command shortcut (ADR-0007) has been consumed. */
const NO_INITIAL_ARGS: Omit<AppProps, 'initialScreen'> = {}

export function App(props: AppProps) {
  const [screen, setScreen] = useState<ScreenName>(props.initialScreen)
  // The CLI's qualified-command shortcut (`ovhtool dns bar.fr`, ADR-0007)
  // should only apply to that very first screen, not stick around for
  // the rest of the session: once the user backs out to the home menu and
  // picks a service again, they must land on a fresh dashboard (able to pick
  // any domain), not be pinned to whatever domain the CLI invocation named.
  const [initialArgs, setInitialArgs] = useState<Omit<AppProps, 'initialScreen'>>(props)
  // Unlike `initialArgs`, the pinned domain/account (`ovhtool <domain>`, a
  // *different* CLI shortcut) survives `goHome()` — it's state, not derived
  // from `props`, precisely so the home screen can let the user clear it.
  const [pinnedDomain, setPinnedDomain] = useState(props.pinnedDomain)
  const [pinnedAccount, setPinnedAccount] = useState(props.pinnedAccount)

  const goHome = () => {
    setInitialArgs(NO_INITIAL_ARGS)
    setScreen('home')
  }

  const clearPinnedDomain = () => {
    setPinnedDomain(undefined)
    setPinnedAccount(undefined)
  }

  switch (screen) {
    case 'home':
      return (
        <ThemeProvider service="home">
          <HomeScreen onSelect={setScreen} pinnedDomain={pinnedDomain} onClearPinnedDomain={clearPinnedDomain} />
        </ThemeProvider>
      )
    case 'dns':
      return (
        <ThemeProvider service="dns">
          <DnsScreen
            initialZone={initialArgs.initialDomain ?? pinnedDomain}
            initialAccount={initialArgs.initialAccount ?? pinnedAccount}
            initialPanel={initialArgs.initialDnsPanel}
            initialFilter={initialArgs.initialFilter}
            pinnedDomain={pinnedDomain}
            onHome={goHome}
          />
        </ThemeProvider>
      )
    case 'mail':
      return (
        <ThemeProvider service="mail">
          <MailScreen
            initialDomain={initialArgs.initialDomain ?? pinnedDomain}
            initialAccount={initialArgs.initialAccount ?? pinnedAccount}
            initialPanel={initialArgs.initialMailPanel}
            initialFilter={initialArgs.initialFilter}
            pinnedDomain={pinnedDomain}
            onHome={goHome}
          />
        </ThemeProvider>
      )
    case 'mailRedirect':
      return (
        <ThemeProvider service="mailRedirect">
          <MailRedirectScreen
            initialDomain={initialArgs.initialDomain ?? pinnedDomain}
            initialAccount={initialArgs.initialAccount ?? pinnedAccount}
            initialPanel={initialArgs.initialMailRedirectPanel}
            initialFilter={initialArgs.initialFilter}
            pinnedDomain={pinnedDomain}
            onHome={goHome}
          />
        </ThemeProvider>
      )
    case 'accounts':
      return (
        <ThemeProvider service="accounts">
          <AccountsScreen initialPanel={initialArgs.initialAccountsPanel} onHome={goHome} />
        </ThemeProvider>
      )
    default:
      return (
        <ThemeProvider service="home">
          <HomeScreen onSelect={setScreen} pinnedDomain={pinnedDomain} onClearPinnedDomain={clearPinnedDomain} />
        </ThemeProvider>
      )
  }
}

type ErrorBoundaryState = { error: Error | null }

/**
 * Generic safety net: catches unexpected render errors so the process
 * never crashes with a raw stack trace. Expected
 * business errors (API/validation) are handled locally by each screen via
 * `Alert`, never bubbling up here.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Deliberately silent beyond the state update: no console output that
    // would corrupt Ink's own render loop.
    void info
    void error
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={1}>
          <Text color="red">An unexpected error occurred: {this.state.error.message}</Text>
          <Text dimColor>Ctrl+C to quit.</Text>
        </Box>
      )
    }
    return this.props.children
  }
}
