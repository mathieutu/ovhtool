import React, { createContext, useContext, type ReactNode } from 'react'
import type { ScreenName } from './app.tsx'

export type Theme = { color: string; label: string }

/** One color + display label per service, used for the header breadcrumb and as the screen's primary color (selected rows, placeholders, borders, …). */
const SERVICE_THEMES: Record<ScreenName, Theme> = {
  home: { color: 'cyan', label: 'ovhtool' },
  dns: { color: 'cyan', label: 'DNS' },
  mail: { color: 'magenta', label: 'Mail' },
  mailRedirect: { color: 'yellow', label: 'Redirections' },
  accounts: { color: 'green', label: 'Accounts' },
}

const ThemeContext = createContext<Theme>(SERVICE_THEMES.home)

/** Wraps a screen so every primitive below it (Header, Table, Select, TextInput, Panel, Form) picks up that service's color without prop drilling. */
export function ThemeProvider({ service, children }: { service: ScreenName; children: ReactNode }) {
  return React.createElement(ThemeContext.Provider, { value: SERVICE_THEMES[service] }, children)
}

export function useTheme(): Theme {
  return useContext(ThemeContext)
}

/** Direct lookup outside of a `ThemeProvider` — used by the home menu to preview each service's own color before it's selected. */
export function themeFor(service: ScreenName): Theme {
  return SERVICE_THEMES[service]
}
