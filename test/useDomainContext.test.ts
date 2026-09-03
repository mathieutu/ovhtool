import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dedupeByCachedAccount } from '../src/ink/hooks/useDomainContext.ts'
import type { Config } from '../src/config.ts'

function makeConfig(domainCache: Record<string, string> = {}): Config {
  return {
    profiles: {
      perso: { endpoint: 'ovh-eu', appKey: 'k1', appSecret: 's1', consumerKey: 'c1' },
      'client-x': { endpoint: 'ovh-eu', appKey: 'k2', appSecret: 's2', consumerKey: 'c2' },
    },
    domainCache,
    tableCache: {},
  }
}

test('dedupeByCachedAccount keeps only the cached account for a domain reachable from several accounts', () => {
  const config = makeConfig({ 'bar.fr': 'client-x' })
  const options = [
    { account: 'perso', domain: 'bar.fr' },
    { account: 'client-x', domain: 'bar.fr' },
  ]

  assert.deepEqual(dedupeByCachedAccount(config, options), [{ account: 'client-x', domain: 'bar.fr' }])
})

test('dedupeByCachedAccount leaves every candidate when the domain has no cached account yet', () => {
  const config = makeConfig()
  const options = [
    { account: 'perso', domain: 'bar.fr' },
    { account: 'client-x', domain: 'bar.fr' },
  ]

  assert.deepEqual(dedupeByCachedAccount(config, options), options)
})

test('dedupeByCachedAccount ignores a cache entry pointing to a removed profile', () => {
  const config = makeConfig({ 'bar.fr': 'ghost-account' })
  const options = [
    { account: 'perso', domain: 'bar.fr' },
    { account: 'client-x', domain: 'bar.fr' },
  ]

  assert.deepEqual(dedupeByCachedAccount(config, options), options)
})

test('dedupeByCachedAccount leaves unrelated domains untouched', () => {
  const config = makeConfig({ 'bar.fr': 'client-x' })
  const options = [
    { account: 'perso', domain: 'foo.fr' },
    { account: 'client-x', domain: 'bar.fr' },
  ]

  assert.deepEqual(dedupeByCachedAccount(config, options), options)
})
