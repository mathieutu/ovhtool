import type { OvhClient } from '../ovhClient.ts'
import { diffCreate, diffDelete, diffUpdate, type ActionDiff } from '../diff.ts'
import { ValidationError } from '../errors.ts'
import { waitUntilReflected, explainConflict } from './pollUntil.ts'

export const DNS_RECORD_TYPES = [
  'A',
  'AAAA',
  'CNAME',
  'DKIM',
  'DMARC',
  'LOC',
  'MX',
  'NAPTR',
  'NS',
  'PTR',
  'SPF',
  'SRV',
  'SSHFP',
  'TLSA',
  'TXT',
] as const

export type DnsRecordType = (typeof DNS_RECORD_TYPES)[number]

export function isValidRecordType(type: string): type is DnsRecordType {
  return (DNS_RECORD_TYPES as readonly string[]).includes(type)
}

export function assertValidRecordType(type: string): asserts type is DnsRecordType {
  if (!isValidRecordType(type)) {
    throw new ValidationError(
      `Invalid DNS record type: "${type}". Possible values: ${DNS_RECORD_TYPES.join(', ')}`,
      'invalid_record_type',
    )
  }
}

export type DnsRecord = {
  id: number
  zone: string
  fieldType: DnsRecordType
  subDomain: string
  target: string
  ttl: number
}

/** DNS zones (domains) the account has access to — used to let the user pick one instead of typing it blind. */
export async function listZones(client: OvhClient): Promise<string[]> {
  return client.request<string[]>('GET', '/domain/zone')
}

export async function listDnsRecords(client: OvhClient, zone: string, type?: DnsRecordType): Promise<DnsRecord[]> {
  const ids = await client.request<number[]>('GET', `/domain/zone/${zone}/record`, type ? { fieldType: type } : undefined)
  return Promise.all(ids.map((id) => client.request<DnsRecord>('GET', `/domain/zone/${zone}/record/${id}`)))
}

export async function fetchDnsRecord(client: OvhClient, zone: string, id: number): Promise<DnsRecord> {
  return client.request<DnsRecord>('GET', `/domain/zone/${zone}/record/${id}`)
}

export async function refreshZone(client: OvhClient, zone: string): Promise<void> {
  await explainConflict(() => client.request('POST', `/domain/zone/${zone}/refresh`))
}

export type AddDnsRecordParams = {
  zone: string
  subDomain: string
  target: string
  fieldType: DnsRecordType
  ttl?: number
}

export function prepareAddDnsRecord(params: AddDnsRecordParams): ActionDiff {
  return diffCreate({
    subDomain: params.subDomain,
    target: params.target,
    fieldType: params.fieldType,
    ttl: params.ttl ?? null,
  })
}

export async function applyAddDnsRecord(client: OvhClient, params: AddDnsRecordParams): Promise<DnsRecord> {
  const record = await explainConflict(() =>
    client.request<DnsRecord>('POST', `/domain/zone/${params.zone}/record`, {
      subDomain: params.subDomain,
      target: params.target,
      fieldType: params.fieldType,
      ttl: params.ttl,
    }),
  )
  await refreshZone(client, params.zone)
  await waitUntilReflected(async () => {
    const ids = await client.request<number[]>('GET', `/domain/zone/${params.zone}/record`)
    return ids.includes(record.id)
  })
  return record
}

export type UpdateDnsRecordParams = {
  zone: string
  id: number
  subDomain?: string
  target?: string
  ttl?: number
}

export function prepareUpdateDnsRecord(before: DnsRecord, params: UpdateDnsRecordParams): ActionDiff {
  return diffUpdate(
    { subDomain: before.subDomain, target: before.target, ttl: before.ttl },
    {
      subDomain: params.subDomain ?? before.subDomain,
      target: params.target ?? before.target,
      ttl: params.ttl ?? before.ttl,
    },
  )
}

export async function applyUpdateDnsRecord(client: OvhClient, params: UpdateDnsRecordParams): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (params.subDomain !== undefined) payload.subDomain = params.subDomain
  if (params.target !== undefined) payload.target = params.target
  if (params.ttl !== undefined) payload.ttl = params.ttl
  await explainConflict(() => client.request('PUT', `/domain/zone/${params.zone}/record/${params.id}`, payload))
  await refreshZone(client, params.zone)
  await waitUntilReflected(async () => {
    const updated = await fetchDnsRecord(client, params.zone, params.id)
    return (
      (params.subDomain === undefined || updated.subDomain === params.subDomain) &&
      (params.target === undefined || updated.target === params.target) &&
      (params.ttl === undefined || updated.ttl === params.ttl)
    )
  })
}

export function prepareDeleteDnsRecord(before: DnsRecord): ActionDiff {
  return diffDelete({
    subDomain: before.subDomain,
    target: before.target,
    fieldType: before.fieldType,
    ttl: before.ttl,
  })
}

export async function applyDeleteDnsRecord(client: OvhClient, zone: string, id: number): Promise<void> {
  await explainConflict(() => client.request('DELETE', `/domain/zone/${zone}/record/${id}`))
  await refreshZone(client, zone)
  await waitUntilReflected(async () => {
    const ids = await client.request<number[]>('GET', `/domain/zone/${zone}/record`)
    return !ids.includes(id)
  })
}
