import { describe, expect, it, vi } from 'vitest'
import type { SafeTelemetryEvent } from '../src/observability/redaction'
import { observeRequest } from './observability'

describe('Worker request observability', () => {
  it('correlates the response and logs only a redacted route template', async () => {
    const log = vi.fn<(event: SafeTelemetryEvent) => void>()
    const request = new Request(
      'https://qa.rozbirka.pro/invite/person@example.com?token=secret-query',
      { headers: { 'X-Request-Id': 'request-42' } },
    )

    const response = await observeRequest(
      request,
      () =>
        Promise.resolve(new Response('Bearer secret-body', { status: 503 })),
      log,
    )

    const correlationId = response.headers.get('X-Request-Id')
    expect(correlationId).toMatch(/^[0-9a-f-]{36}$/)
    expect(log).toHaveBeenCalledWith({
      correlationId,
      routeTemplate: '/invite/:code',
      method: 'GET',
      status: 503,
      category: 'network',
    })
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /person@example\.com|secret-query|secret-body|Bearer/,
    )
  })

  it('replaces an unsafe incoming correlation identifier', async () => {
    const log = vi.fn<(event: SafeTelemetryEvent) => void>()
    const request = new Request('https://rozbirka.pro/app/tenant-1/reports', {
      headers: { 'X-Request-Id': 'person@example.com' },
    })

    const response = await observeRequest(
      request,
      () => Promise.resolve(new Response(null, { status: 200 })),
      log,
    )

    const correlationId = response.headers.get('X-Request-Id')
    expect(correlationId).toMatch(/^[0-9a-f-]{36}$/)
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId,
        routeTemplate: '/app/:tenant/:path',
        category: 'unknown',
      }),
    )
  })

  it('records a redacted failure event and preserves the handler exception', async () => {
    const log = vi.fn<(event: SafeTelemetryEvent) => void>()
    const failure = new Error('person@example.com secret backend detail')
    const request = new Request(
      'https://rozbirka.pro/scan/private-qr?token=secret-query',
      { method: 'POST', headers: { 'X-Request-Id': 'request-500' } },
    )

    await expect(
      observeRequest(request, () => Promise.reject(failure), log),
    ).rejects.toBe(failure)
    const correlationId = log.mock.calls[0]?.[0].correlationId
    expect(correlationId).toMatch(/^[0-9a-f-]{36}$/)
    expect(log).toHaveBeenCalledWith({
      correlationId,
      routeTemplate: '/scan/:qrCode',
      method: 'POST',
      status: 500,
      category: 'network',
    })
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /person@example\.com|private-qr|secret-query|backend detail/,
    )
  })

  it('does not let a telemetry sink failure break a successful request', async () => {
    const request = new Request('https://rozbirka.pro/account')

    const response = await observeRequest(
      request,
      () => Promise.resolve(new Response(null, { status: 204 })),
      () => {
        throw new Error('telemetry unavailable')
      },
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/)
  })
})
