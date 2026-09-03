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
