// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'

const fixtureScript = resolve('scripts/auth-e2e-upstream.mjs')
const fixtureOrigin = 'http://127.0.0.1:4174'
let fixtureProcess: ChildProcess | null = null

const delay = (milliseconds: number) =>
  new Promise<void>((resolveDelay) => setTimeout(resolveDelay, milliseconds))

async function waitForFixture() {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    if (fixtureProcess?.exitCode !== null) {
      throw new Error('Auth E2E upstream exited before becoming ready')
    }
    try {
      const response = await fetch(`${fixtureOrigin}/_test/stats`)
      if (response.ok) return
    } catch {
      // The child has not bound its loopback port yet.
    }
    await delay(25)
  }
  throw new Error('Auth E2E upstream did not become ready')
}

async function stopFixture(signal: NodeJS.Signals = 'SIGKILL') {
  const child = fixtureProcess
  fixtureProcess = null
  if (child?.exitCode !== null) return
  const exited = once(child, 'exit')
  child.kill(signal)
  await exited
}

afterEach(async () => {
  await stopFixture()
})

it('releases an active delayed logout before SIGTERM closes the fixture', async () => {
  fixtureProcess = spawn(process.execPath, [fixtureScript], {
    stdio: 'ignore',
  })
  await waitForFixture()

  const armed = await fetch(`${fixtureOrigin}/_test/logout/delay`, {
    method: 'POST',
  })
  expect(armed.status).toBe(200)
  let logoutSettled = false
  const logoutRequest = fetch(`${fixtureOrigin}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
    .then((response) => {
      logoutSettled = true
      return response
    })
    .catch(() => null)

  let logoutStarted = false
  const deadline = Date.now() + 2_000
  while (!logoutStarted && Date.now() < deadline) {
    const stats = await (await fetch(`${fixtureOrigin}/_test/stats`)).json()
    if (
      typeof stats !== 'object' ||
      stats === null ||
      !('logoutRequests' in stats)
    ) {
      throw new Error('Auth E2E upstream returned invalid stats')
    }
    logoutStarted = stats.logoutRequests === 1
    if (!logoutStarted) await delay(25)
  }
  expect(logoutStarted).toBe(true)

  const child = fixtureProcess
  if (!child) throw new Error('Auth E2E upstream process is unavailable')
  const exited = once(child, 'exit')
  child.kill('SIGTERM')
  const outcome = await Promise.race([
    exited.then(() => 'exited' as const),
    delay(500).then(() => 'still-running' as const),
  ])

  try {
    expect({ outcome, logoutSettled }).toEqual({
      outcome: 'exited',
      logoutSettled: true,
    })
  } finally {
    await stopFixture()
    await logoutRequest
  }
})
