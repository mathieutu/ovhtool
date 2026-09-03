#!/usr/bin/env node
import https from 'node:https'
import { run } from '../src/cli.ts'

// Node's global HTTPS agent defaults to `keepAlive: true` since Node 19: the
// `ovh` package (used with no custom agent, see ovhClient.ts) reuses this
// agent, so a socket from the last API call can stay open for reuse and keep
// the event loop alive well after Ink has unmounted on Ctrl+C — the process
// then lingers in the background instead of exiting with the CLI.
https.globalAgent = new https.Agent({ keepAlive: false })

await run()
