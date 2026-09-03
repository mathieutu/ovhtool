import { ApiError } from '../errors.ts'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Several OVH APIs (DNS zone records, mail redirections, …) are eventually
 * consistent: a GET issued right after a mutating call can still reflect the
 * pre-mutation state for a moment. Polls `check` with backoff instead of
 * trusting the very next read — gives up silently after the last attempt so
 * a slow propagation never turns into a hard error (the caller's own reload
 * will still pick up the change eventually).
 */
export async function waitUntilReflected(check: () => Promise<boolean>, attempts = 5, delayMs = 400): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await check()) return
    await sleep(delayMs * (attempt + 1))
  }
}

/** OVH's "409 Conflict" for a resource that still has an async task in flight (e.g. "This element is already being processed"). */
function isTaskConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'ovh_http_409'
}

/**
 * Creating, updating or deleting one of these OVH resources kicks off an
 * internal task; a further mutation on the *same* resource issued before
 * that task settles is rejected with a 409 ("This element is already being
 * processed: <id>") — most visibly when a record is deleted right after
 * being created. That task can still be running well beyond any reasonable
 * number of retries (observed outlasting 5 attempts with backoff), so
 * retrying here isn't worth it: this only rewords OVH's own message —
 * already carrying the identifier — into something that tells the user it's
 * worth trying again shortly, instead of retrying blindly. Every other
 * failure (validation, auth, "not found") passes through unchanged.
 */
export async function explainConflict<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  } catch (error) {
    if (!isTaskConflict(error) || !(error instanceof ApiError)) throw error
    const reworded = error.message.replace(/already being processed/i, 'currently being processed by OVH').replace(/\.?$/, '')
    throw new ApiError(`${reworded}. Try again later.`, 'ovh_task_conflict')
  }
}
