// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const fixtureScript = resolve('scripts/auth-e2e-upstream.mjs')
const fixtureOrigin = 'http://127.0.0.1:4174'
let fixtureProcess: ChildProcess | null = null

const delay = (milliseconds: number) =>
  new Promise<void>((resolveDelay) => setTimeout(resolveDelay, milliseconds))

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Auth E2E upstream returned invalid JSON')
  }
  return value as Record<string, unknown>
}

async function readRecord(response: Response) {
  const value: unknown = await response.json()
  return requireRecord(value)
}

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

async function startFixture() {
  fixtureProcess = spawn(process.execPath, [fixtureScript], {
    stdio: 'ignore',
  })
  await waitForFixture()
}

async function issueAccessToken() {
  const response = await fetch(`${fixtureOrigin}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+380501112233', code: '123456' }),
  })
  expect(response.status).toBe(200)
  const data = requireRecord((await readRecord(response)).data)
  const accessToken = data.accessToken
  if (typeof accessToken !== 'string') {
    throw new Error('Auth E2E upstream did not issue an access token')
  }
  return accessToken
}

async function dashboardGet(
  path: string,
  accessToken: string,
  tenantId = 'tenant-1',
) {
  return fetch(`${fixtureOrigin}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Tenant-Id': tenantId,
    },
  })
}

afterEach(async () => {
  await stopFixture()
})

it('releases an active delayed logout before SIGTERM closes the fixture', async () => {
  await startFixture()

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

describe('dashboard fixture', () => {
  it('serves authenticated tenant-specific summary and period analytics with request counters', async () => {
    await startFixture()
    const accessToken = await issueAccessToken()

    const kovalSummary = await dashboardGet('/api/v1/dashboard', accessToken)
    expect(kovalSummary.status).toBe(200)
    const kovalSummaryData = requireRecord(
      (await readRecord(kovalSummary)).data,
    )
    expect(kovalSummaryData.todaySalesCount).toBe(7)

    const sobolSummary = await dashboardGet(
      '/api/v1/dashboard',
      accessToken,
      'tenant-2',
    )
    expect(sobolSummary.status).toBe(200)
    const sobolSummaryData = requireRecord(
      (await readRecord(sobolSummary)).data,
    )
    expect(sobolSummaryData.todaySalesCount).toBe(17)

    for (const [period, expectedTotal] of [
      ['day', 3],
      ['week', 21],
      ['month', 84],
    ] as const) {
      const analytics = await dashboardGet(
        `/api/v1/dashboard/analytics?period=${period}`,
        accessToken,
      )
      expect(analytics.status, period).toBe(200)
      const data = requireRecord((await readRecord(analytics)).data)
      const partsSold = requireRecord(data.partsSold)
      expect(data.period, period).toBe(period)
      expect(partsSold.total, period).toBe(expectedTotal)
    }

    const stats = await readRecord(await fetch(`${fixtureOrigin}/_test/stats`))
    expect(stats.dashboardRequests).toBe(2)
    expect(stats.dashboardAnalyticsRequests).toEqual({
      day: 1,
      week: 1,
      month: 1,
    })
  })

  it('fails configured dashboard attempts once and counts retry requests', async () => {
    await startFixture()
    const reset = await fetch(`${fixtureOrigin}/_test/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dashboardSummaryFailures: 1,
        dashboardAnalyticsFailures: { month: 1 },
      }),
    })
    expect(reset.status).toBe(200)
    const accessToken = await issueAccessToken()

    expect((await dashboardGet('/api/v1/dashboard', accessToken)).status).toBe(
      503,
    )
    expect((await dashboardGet('/api/v1/dashboard', accessToken)).status).toBe(
      200,
    )
    expect(
      (
        await dashboardGet(
          '/api/v1/dashboard/analytics?period=month',
          accessToken,
        )
      ).status,
    ).toBe(503)
    expect(
      (
        await dashboardGet(
          '/api/v1/dashboard/analytics?period=month',
          accessToken,
        )
      ).status,
    ).toBe(200)

    const stats = await readRecord(await fetch(`${fixtureOrigin}/_test/stats`))
    expect(stats.dashboardRequests).toBe(2)
    expect(stats.dashboardAnalyticsRequests).toEqual({
      day: 0,
      week: 0,
      month: 2,
    })
  })

  it('resets only dashboard counters and failure arms while preserving the authenticated session', async () => {
    await startFixture()
    const accessToken = await issueAccessToken()
    expect((await dashboardGet('/api/v1/dashboard', accessToken)).status).toBe(
      200,
    )

    const reset = await fetch(`${fixtureOrigin}/_test/dashboard/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboardSummaryFailures: 1 }),
    })
    expect(reset.status).toBe(200)
    expect((await dashboardGet('/api/v1/dashboard', accessToken)).status).toBe(
      503,
    )
    expect((await dashboardGet('/api/v1/dashboard', accessToken)).status).toBe(
      200,
    )

    const stats = await readRecord(await fetch(`${fixtureOrigin}/_test/stats`))
    expect(stats.dashboardRequests).toBe(2)
  })
})
