import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  emptyConfig,
  loadConfig,
  saveConfig,
  getCachedAccount,
  withCachedAccount,
  withoutCachedDomain,
  requireProfile,
  getCachedTable,
  withCachedTable,
  clearTableCache,
} from '../src/config.ts'
import { ValidationError } from '../src/errors.ts'

function withTempConfigPath(fn: (configPath: string) => void): void {
  const dir = mkdtempSync(path.join(tmpdir(), 'ovhtool-test-'))
  try {
    fn(path.join(dir, 'nested', 'config.json'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('loadConfig returns an empty config when the file is missing', () => {
  withTempConfigPath((configPath) => {
    assert.deepEqual(loadConfig(configPath), emptyConfig())
  })
})

test('saveConfig then loadConfig round-trips faithfully', () => {
  withTempConfigPath((configPath) => {
    const config = {
      default: 'perso',
      profiles: { perso: { endpoint: 'ovh-eu' as const, appKey: 'k', appSecret: 's', consumerKey: 'c' } },
      domainCache: { 'bar.fr': 'perso' },
      tableCache: { 'dns:perso:bar.fr': { data: [{ id: 1 }], fetchedAt: '2024-01-01T00:00:00.000Z' } },
    }
    saveConfig(config, configPath)
    assert.deepEqual(loadConfig(configPath), config)
  })
})

test('saveConfig writes the file with restrictive permissions (0600)', () => {
  withTempConfigPath((configPath) => {
    saveConfig(emptyConfig(), configPath)
    const mode = statSync(configPath).mode & 0o777
    assert.equal(mode, 0o600)
  })
})

test('saveConfig persists readable JSON', () => {
  withTempConfigPath((configPath) => {
    saveConfig(emptyConfig(), configPath)
    const raw = readFileSync(configPath, 'utf8')
    assert.deepEqual(JSON.parse(raw), emptyConfig())
  })
})

test('getCachedAccount ignores a cache entry pointing to a removed profile', () => {
  const config = { profiles: {}, domainCache: { 'bar.fr': 'client-x' }, tableCache: {} }
  assert.equal(getCachedAccount(config, 'bar.fr'), undefined)
})

test('withCachedAccount / withoutCachedDomain are immutable updates', () => {
  const base = emptyConfig()
  const withCache = withCachedAccount(base, 'bar.fr', 'perso')
  assert.deepEqual(base.domainCache, {})
  assert.equal(withCache.domainCache['bar.fr'], 'perso')

  const withoutCache = withoutCachedDomain(withCache, 'bar.fr')
  assert.deepEqual(withoutCache.domainCache, {})
  assert.equal(withCache.domainCache['bar.fr'], 'perso')
})

test('getCachedTable returns undefined when the key is absent', () => {
  const config = emptyConfig()
  assert.equal(getCachedTable(config, 'dns:perso:bar.fr'), undefined)
})

test('withCachedTable / getCachedTable round-trip a value, immutably', () => {
  const base = emptyConfig()
  const withEntry = withCachedTable(base, 'dns:perso:bar.fr', [{ id: 1 }])
  assert.deepEqual(base.tableCache, {})
  assert.deepEqual(getCachedTable(withEntry, 'dns:perso:bar.fr'), [{ id: 1 }])
})

test('withCachedTable overwrites a previous entry under the same key', () => {
  const base = withCachedTable(emptyConfig(), 'dns:perso:bar.fr', [{ id: 1 }])
  const updated = withCachedTable(base, 'dns:perso:bar.fr', [{ id: 2 }])
  assert.deepEqual(getCachedTable(updated, 'dns:perso:bar.fr'), [{ id: 2 }])
})

test('clearTableCache drops every cached table but leaves profiles/domainCache untouched', () => {
  const config = {
    default: 'perso',
    profiles: { perso: { endpoint: 'ovh-eu' as const, appKey: 'k', appSecret: 's', consumerKey: 'c' } },
    domainCache: { 'bar.fr': 'perso' },
    tableCache: { 'dns:perso:bar.fr': { data: [{ id: 1 }], fetchedAt: '2024-01-01T00:00:00.000Z' } },
  }
  const cleared = clearTableCache(config)
  assert.deepEqual(cleared.tableCache, {})
  assert.deepEqual(cleared.profiles, config.profiles)
  assert.deepEqual(cleared.domainCache, config.domainCache)
})

test('requireProfile throws a ValidationError listing the available accounts', () => {
  const config = { profiles: { perso: { endpoint: 'ovh-eu' as const, appKey: '', appSecret: '', consumerKey: '' } }, domainCache: {}, tableCache: {} }
  assert.throws(() => requireProfile(config, 'unknown'), (error: unknown) => {
    assert.ok(error instanceof ValidationError)
    assert.match(error.message, /perso/)
    return true
  })
})
