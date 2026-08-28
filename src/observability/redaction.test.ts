import { describe, expect, it } from 'vitest'
import { createSafeTelemetryEvent } from './redaction'

describe('PII-redacted observability', () => {
  it('keeps correlation and operational dimensions from an allowlist', () => {
    expect(
      createSafeTelemetryEvent({
        correlationId: 'req_01HXYZ-7',
        routeTemplate: '/api/v1/reports/:reportId/download',
        method: 'GET',
        status: 503,
        category: 'network',
      }),
    ).toEqual({
      correlationId: 'req_01HXYZ-7',
      routeTemplate: '/api/v1/reports/:reportId/download',
      method: 'GET',
      status: 503,
      category: 'network',
    })
  })

  it('drops arbitrary details, PII, secrets, and query strings', () => {
    const safe = createSafeTelemetryEvent({
      correlationId: 'request-42',
      routeTemplate: '/api/v1/reports',
      method: 'POST',
      status: 400,
      category: 'validation',
      phone: '+380501112233',
      email: 'person@example.com',
      authorization: 'Bearer secret-access-token',
      cookie: 'session=secret-cookie',
      url: 'https://api.example.test/reports?token=secret-query',
      detail: {
        refreshToken: 'secret-refresh-token',
        message: 'person@example.com failed',
      },
    })

    expect(JSON.stringify(safe)).toBe(
      '{"correlationId":"request-42","routeTemplate":"/api/v1/reports","method":"POST","status":400,"category":"validation"}',
    )
  })

  it('rejects correlation identifiers and routes that could carry PII', () => {
    expect(
      createSafeTelemetryEvent({
        correlationId: 'person@example.com',
        routeTemplate: '/api/v1/reports/550e8400-e29b-41d4-a716-446655440000',
        method: 'get',
        status: 999,
        category: 'raw-backend-message',
      }),
    ).toEqual({
      correlationId: 'redacted',
      routeTemplate: '/unknown',
      method: 'GET',
      status: 0,
      category: 'unknown',
    })
  })

  it.each(['HEAD', 'OPTIONS'])('keeps the safe %s method', (method) => {
    expect(
      createSafeTelemetryEvent({
        correlationId: 'request-42',
        routeTemplate: '/account',
        method,
        status: 204,
        category: 'unknown',
      }).method,
    ).toBe(method)
  })
})
