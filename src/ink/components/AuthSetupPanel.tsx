import React, { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import open from 'open'
import { Panel } from './Panel.tsx'
import { Form, type FormField } from './Form.tsx'
import { Spinner } from './primitives/Spinner.tsx'
import { Alert } from './primitives/Alert.tsx'
import { useKeymap } from '../hooks/useKeymap.ts'
import { ENDPOINTS, loadConfig, saveConfig, type Endpoint } from '../../config.ts'
import { createBootstrapOvhClient } from '../../ovhClient.ts'
import { toOvhtoolError } from '../../errors.ts'
import { requestCredential, buildProfile, CREATE_APP_URLS, type CredentialRequest } from '../../commands/auth.ts'

export type AuthSetupValues = {
  account?: string
  endpoint?: string
  appKey?: string
  appSecret?: string
}

export type AuthSetupPanelProps = {
  initial?: AuthSetupValues
  /** Called once the profile is saved. */
  onDone: (message: string) => void
}

type Step = 'form' | 'requesting' | 'validate' | 'saving' | 'done'

/**
 * `auth setup`'s flow (create/update an OVH profile): a necessarily linear
 * sequence (open the OVH app-creation page, collect Application Key/Secret
 * on one form, request the consumerKey, open the validation URL, wait for
 * confirmation, save). This is the panel content only — Escape-to-cancel is
 * handled by whichever screen mounts it (the `accounts` dashboard's own
 * Ctrl+N action on its profiles table), same convention as every other
 * mutation panel.
 */
export function AuthSetupPanel({ initial, onDone }: AuthSetupPanelProps) {
  const [account, setAccount] = useState(initial?.account ?? '')
  const [endpoint, setEndpoint] = useState<Endpoint>((initial?.endpoint as Endpoint) ?? 'ovh-eu')
  const [appKey, setAppKey] = useState(initial?.appKey ?? '')
  const [appSecret, setAppSecret] = useState(initial?.appSecret ?? '')
  const [step, setStep] = useState<Step>('form')
  const [credential, setCredential] = useState<CredentialRequest | null>(null)
  const [error, setError] = useState<string | undefined>()
  const [openedAppPage, setOpenedAppPage] = useState(false)

  useEffect(() => {
    if (step === 'form' && !appKey && !openedAppPage) {
      setOpenedAppPage(true)
      void open(CREATE_APP_URLS[endpoint]).catch(() => {})
    }
  }, [step, endpoint, appKey, openedAppPage])

  const fields: FormField[] = [
    { name: 'account', label: 'Profile name', kind: 'text', value: account, onChange: setAccount },
    {
      name: 'endpoint',
      label: 'Endpoint',
      kind: 'select',
      options: ENDPOINTS.map((e) => ({ label: e, value: e })),
      value: endpoint,
      onChange: (v) => setEndpoint(v as Endpoint),
    },
    { name: 'appKey', label: 'Application Key', kind: 'text', value: appKey, onChange: setAppKey },
    { name: 'appSecret', label: 'Application Secret', kind: 'password', value: appSecret, onChange: setAppSecret },
  ]

  async function submitForm() {
    if (!account.trim()) {
      setError('Profile name is required.')
      return
    }
    if (!appKey.trim() || !appSecret.trim()) {
      setError('Application Key and Application Secret are required (create them on the OVH page opened in your browser).')
      return
    }
    setError(undefined)
    setStep('requesting')
    try {
      const bootstrapClient = createBootstrapOvhClient({ endpoint, appKey, appSecret })
      const result = await requestCredential(bootstrapClient)
      setCredential(result)
      setStep('validate')
      void open(result.validationUrl).catch(() => {})
    } catch (err) {
      setError(toOvhtoolError(err).message)
      setStep('form')
    }
  }

  async function confirmValidated() {
    if (!credential) return
    setStep('saving')
    try {
      const config = loadConfig()
      const profile = buildProfile(endpoint, appKey, appSecret, credential.consumerKey)
      saveConfig({ ...config, profiles: { ...config.profiles, [account]: profile } })
      setStep('done')
    } catch (err) {
      setError(toOvhtoolError(err).message)
      setStep('validate')
    }
  }

  useKeymap([
    { key: 'return', label: 'confirm', when: step === 'validate', onTrigger: confirmValidated },
    { key: 'return', label: 'finish', when: step === 'done', onTrigger: () => onDone(`✔ Profile "${account}" saved (${endpoint}).`) },
  ])

  return (
    <Panel title="OVH Authentication">
      {error ? <Alert message={error} /> : null}
      {step === 'form' && (
        <Box flexDirection="column">
          <Text dimColor>Application-creation page opened in your browser: {CREATE_APP_URLS[endpoint]}</Text>
          <Form fields={fields} onSubmit={submitForm} />
        </Box>
      )}
      {step === 'requesting' && <Spinner label="Requesting consumerKey…" />}
      {step === 'validate' && credential && (
        <Box flexDirection="column">
          <Text>Validate this authorization in your browser: {credential.validationUrl}</Text>
          <Text dimColor>Once validated, press Enter.</Text>
        </Box>
      )}
      {step === 'saving' && <Spinner label="Saving profile…" />}
      {step === 'done' && <Alert variant="success" message={`Profile "${account}" saved (${endpoint}). Press Enter to continue.`} />}
    </Panel>
  )
}
