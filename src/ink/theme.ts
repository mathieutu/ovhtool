import React, { createContext, useContext, type ReactNode } from 'react'
import type { ScreenName } from './app.tsx'

export type Theme = { color: string; label: string }

/**
 * One color + display label per service, used for the header breadcrumb and
 * as the screen's primary color (selected rows, placeholders, borders, …).
 * Colors follow the rainbow, in the same order services are listed on the
 * home menu, so scrolling down sweeps through the same sequence as the
 * "ovhtool" title in the header.
 */
const SERVICE_THEMES: Record<ScreenName, Theme> = {
  home: { color: 'gray', label: 'ovhtool' },
  dns: { color: 'red', label: 'Domains' },
  mail: { color: 'yellow', label: 'Mail Accounts' },
  mailRedirect: { color: 'green', label: 'Mail Redirections' },
  accounts: { color: 'cyan', label: 'Accounts' },
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
