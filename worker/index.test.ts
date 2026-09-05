import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './index'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Worker entry observability', () => {
  it('wraps served responses with safe correlation telemetry', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const response = await worker.fetch(
      new Request('https://rozbirka.pro/', {
        headers: { 'X-Request-Id': 'request-42' },
      }) as unknown as Parameters<typeof worker.fetch>[0],
      {
        ASSETS: {
          fetch: vi.fn(() => Promise.resolve(new Response('<main>ok</main>'))),
        },
      } as unknown as Env,
    )

    const correlationId = response.headers.get('X-Request-Id')
    expect(correlationId).toMatch(/^[0-9a-f-]{36}$/)
    expect(log).toHaveBeenCalledWith({
      correlationId,
      routeTemplate: '/',
      method: 'GET',
      status: 200,
      category: 'unknown',
    })
  })
})
