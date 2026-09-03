import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertValidRecordType, isValidRecordType, prepareUpdateDnsRecord, prepareDeleteDnsRecord, type DnsRecord } from '../src/commands/dns.ts'
import { preparePasswdMailAccount } from '../src/commands/mail.ts'
import { listAccounts, setDefaultAccount, removeAccount, forgetDomain } from '../src/commands/accounts.ts'
import { explainConflict } from '../src/commands/pollUntil.ts'
import { ValidationError, ApiError } from '../src/errors.ts'
import type { Config } from '../src/config.ts'

test('isValidRecordType / assertValidRecordType accept known types', () => {
  assert.equal(isValidRecordType('A'), true)
  assert.equal(isValidRecordType('WAT'), false)
  assert.doesNotThrow(() => assertValidRecordType('CNAME'))
})

test('assertValidRecordType lists possible values in the message', () => {
  assert.throws(() => assertValidRecordType('WAT'), (error: unknown) => {
    assert.ok(error instanceof ValidationError)
    assert.match(error.message, /A, AAAA, CNAME/)
    return true
  })
})

const baseRecord: DnsRecord = { id: 1, zone: 'example.com', fieldType: 'A', subDomain: 'www', target: '1.2.3.4', ttl: 3600 }

test('prepareUpdateDnsRecord only diffs the fields that were provided', () => {
  const diff = prepareUpdateDnsRecord(baseRecord, { zone: 'example.com', id: 1, target: '5.6.7.8' })
  assert.deepEqual(diff.changes, [{ field: 'target', before: '1.2.3.4', after: '5.6.7.8' }])
})

test('prepareUpdateDnsRecord produces no change when values are identical', () => {
  const diff = prepareUpdateDnsRecord(baseRecord, { zone: 'example.com', id: 1, target: '1.2.3.4' })
  assert.deepEqual(diff.changes, [])
})

test('prepareDeleteDnsRecord exposes subDomain/target/fieldType/ttl', () => {
  const diff = prepareDeleteDnsRecord(baseRecord)
  assert.equal(diff.action, 'delete')
  assert.deepEqual(
    diff.changes.map((c) => c.field),
    ['subDomain', 'target', 'fieldType', 'ttl'],
  )
})

test('preparePasswdMailAccount never leaks the password value', () => {
  const diff = preparePasswdMailAccount()
  assert.deepEqual(diff.changes, [{ field: 'password', before: '••••••••', after: '••••••••' }])
})

function makeConfig(): Config {
  return {
    default: 'perso',
    profiles: {
      perso: { endpoint: 'ovh-eu', appKey: 'k1', appSecret: 's1', consumerKey: 'c1' },
      'client-x': { endpoint: 'ovh-eu', appKey: 'k2', appSecret: 's2', consumerKey: 'c2' },
    },
    domainCache: { 'bar.fr': 'client-x', 'foo.fr': 'perso' },
    tableCache: {},
  }
}

test('listAccounts flags the default account', () => {
  const accounts = listAccounts(makeConfig())
  assert.deepEqual(
    accounts.map((a) => [a.name, a.isDefault]),
    [
      ['perso', true],
      ['client-x', false],
    ],
  )
})

test('setDefaultAccount rejects an unknown account', () => {
  assert.throws(() => setDefaultAccount(makeConfig(), 'unknown'), ValidationError)
})

test('removeAccount cleans up the associated default and domainCache', () => {
  const updated = removeAccount(makeConfig(), 'client-x')
  assert.equal(updated.profiles['client-x'], undefined)
  assert.equal(updated.default, 'perso')
  assert.deepEqual(updated.domainCache, { 'foo.fr': 'perso' })
})

test('removeAccount clears the default when the removed account was the default', () => {
  const updated = removeAccount(makeConfig(), 'perso')
  assert.equal(updated.default, undefined)
})

test('forgetDomain is idempotent on a domain absent from the cache', () => {
  const config = makeConfig()
  const updated = forgetDomain(config, 'unknown.fr')
  assert.deepEqual(updated.domainCache, config.domainCache)
})

test('explainConflict returns the result when the action succeeds', async () => {
  const result = await explainConflict(async () => 'ok')
  assert.equal(result, 'ok')
})

test('explainConflict rewords a 409 "already being processed" conflict into an actionable message, keeping OVH\'s own identifier', async () => {
  await assert.rejects(
    () =>
      explainConflict(async () => {
        throw new ApiError('This element is already being processed: foo@example.com', 'ovh_http_409')
      }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.message, 'This element is currently being processed by OVH: foo@example.com. Try again later.')
      assert.equal(error.code, 'ovh_task_conflict')
      return true
    },
  )
})

test('explainConflict never rewords or retries a non-409 error', async () => {
  let calls = 0
  await assert.rejects(
    () =>
      explainConflict(async () => {
        calls++
        throw new ApiError('Not found', 'ovh_http_404')
      }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.message, 'Not found')
      return true
    },
  )
  assert.equal(calls, 1)
})
