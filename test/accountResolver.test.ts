import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveAccount } from '../src/accountResolver.ts'
import type { Config } from '../src/config.ts'
import { ValidationError } from '../src/errors.ts'

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    profiles: {
      perso: { endpoint: 'ovh-eu', appKey: 'k1', appSecret: 's1', consumerKey: 'c1' },
      'client-x': { endpoint: 'ovh-eu', appKey: 'k2', appSecret: 's2', consumerKey: 'c2' },
    },
    domainCache: {},
    tableCache: {},
    ...overrides,
  }
}

const neverPrompt = async (): Promise<string> => {
  throw new Error('promptSelect should not be called')
}

test('an explicit --account takes precedence over everything else', async () => {
  const config = makeConfig({ domainCache: { 'bar.fr': 'client-x' } })
  const resolved = await resolveAccount({
    config,
    domain: 'bar.fr',
    explicitAccount: 'perso',
    mode: 'agent',
    checkAccess: async () => true,
    promptSelect: neverPrompt,
  })
  assert.equal(resolved.name, 'perso')
  assert.equal(resolved.shouldCache, false)
})

test('an unknown explicit --account throws a ValidationError', async () => {
  const config = makeConfig()
  await assert.rejects(
    () =>
      resolveAccount({
        config,
        domain: 'bar.fr',
        explicitAccount: 'unknown',
        mode: 'agent',
        checkAccess: async () => true,
        promptSelect: neverPrompt,
      }),
    ValidationError,
  )
})

test('a cached domain is used without any API call and without redundant caching', async () => {
  const config = makeConfig({ domainCache: { 'bar.fr': 'client-x' } })
  const resolved = await resolveAccount({
    config,
    domain: 'bar.fr',
    mode: 'agent',
    checkAccess: async () => {
      throw new Error('checkAccess should not be called when the cache already answers')
    },
    promptSelect: neverPrompt,
  })
  assert.equal(resolved.name, 'client-x')
  assert.equal(resolved.shouldCache, false)
})

test('a single candidate found is used silently and cached (agent)', async () => {
  const config = makeConfig()
  const resolved = await resolveAccount({
    config,
    domain: 'bar.fr',
    mode: 'agent',
    checkAccess: async (name) => name === 'client-x',
    promptSelect: neverPrompt,
  })
  assert.equal(resolved.name, 'client-x')
  assert.equal(resolved.shouldCache, true)
})

test('several candidates in agent mode throw a ValidationError listing the candidates', async () => {
  const config = makeConfig()
  await assert.rejects(
    () =>
      resolveAccount({
        config,
        domain: 'bar.fr',
        mode: 'agent',
        checkAccess: async () => true,
        promptSelect: neverPrompt,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError)
      assert.match(error.message, /perso/)
      assert.match(error.message, /client-x/)
      return true
    },
  )
})

test('several candidates in human mode trigger a selection prompt', async () => {
  const config = makeConfig()
  const resolved = await resolveAccount({
    config,
    domain: 'bar.fr',
    mode: 'human',
    checkAccess: async () => true,
    promptSelect: async (candidates) => {
      assert.deepEqual(candidates, ['perso', 'client-x'])
      return 'client-x'
    },
  })
  assert.equal(resolved.name, 'client-x')
  assert.equal(resolved.shouldCache, true)
})

test('no candidate found throws a ValidationError', async () => {
  const config = makeConfig()
  await assert.rejects(
    () =>
      resolveAccount({
        config,
        domain: 'bar.fr',
        mode: 'human',
        checkAccess: async () => false,
        promptSelect: neverPrompt,
      }),
    ValidationError,
  )
})
