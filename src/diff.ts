export type FieldChange = {
  field: string
  before: unknown
  after: unknown
}

export type DiffAction = 'create' | 'update' | 'delete'

export type ActionDiff = {
  action: DiffAction
  changes: FieldChange[]
}

export function diffCreate(after: Record<string, unknown>): ActionDiff {
  return {
    action: 'create',
    changes: Object.entries(after).map(([field, value]) => ({ field, before: undefined, after: value })),
  }
}

export function diffDelete(before: Record<string, unknown>): ActionDiff {
  return {
    action: 'delete',
    changes: Object.entries(before).map(([field, value]) => ({ field, before: value, after: undefined })),
  }
}

export function diffUpdate(before: Record<string, unknown>, after: Record<string, unknown>): ActionDiff {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)])
  const changes: FieldChange[] = []
  for (const field of fields) {
    const b = before[field]
    const a = after[field]
    if (!isEqual(b, a)) {
      changes.push({ field, before: b, after: a })
    }
  }
  return { action: 'update', changes }
}

function isEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a === null || a === undefined || b === null || b === undefined) return a === b
  if (typeof a !== 'object' && typeof b !== 'object') return false
  return JSON.stringify(a) === JSON.stringify(b)
}

/** True if the diff represents no effective change (update with no modified fields). */
export function isNoop(diff: ActionDiff): boolean {
  return diff.action === 'update' && diff.changes.length === 0
}

export function formatDiffLines(diff: ActionDiff): string[] {
  return diff.changes.map((change) => {
    if (diff.action === 'create') return `+ ${change.field}: ${formatValue(change.after)}`
    if (diff.action === 'delete') return `- ${change.field}: ${formatValue(change.before)}`
    return `~ ${change.field}: ${formatValue(change.before)} → ${formatValue(change.after)}`
  })
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '∅'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}
