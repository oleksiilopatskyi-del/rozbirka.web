import axios, { AxiosError, AxiosHeaders } from 'axios'
import { describe, expect, it } from 'vitest'
import { normalizeApiProblem } from './errors'

function axiosFailure(status: number, data: unknown, headers = {}) {
  return new AxiosError(
    'request failed',
    'ERR_BAD_RESPONSE',
    { headers: new AxiosHeaders(), method: 'get', url: '/resource' },
    undefined,
    {
      status,
      statusText: 'Error',
      headers,
      config: { headers: new AxiosHeaders() },
      data,
    },
  )
}

describe('normalizeApiProblem', () => {
  it('normalizes nested middleware errors', () => {
    expect(
      normalizeApiProblem(
        axiosFailure(422, {
          error: { code: 'INVALID', message: 'Invalid request' },
        }),
      ),
    ).toMatchObject({
      kind: 'validation',
      status: 422,
      code: 'INVALID',
      message: 'Invalid request',
    })
  })

  it('normalizes flat permission errors and validation dictionaries', () => {
    expect(
      normalizeApiProblem(
        axiosFailure(403, {
          error: 'FORBIDDEN',
          message: 'Denied',
          errors: { name: ['Required'] },
        }),
      ),
    ).toMatchObject({
      kind: 'forbidden',
      code: 'FORBIDDEN',
      fieldErrors: { name: ['Required'] },
    })
  })

  it('reads retry-after and marks an expired session', () => {
    expect(
      normalizeApiProblem(axiosFailure(401, {}, { 'retry-after': '30' })),
    ).toMatchObject({ kind: 'session-expired', retryAfterSeconds: 30 })
  })

  it('maps missing resources to not-found', () => {
    expect(normalizeApiProblem(axiosFailure(404, {}))).toMatchObject({
      kind: 'not-found',
      status: 404,
    })
  })

  it('maps conflicting requests to conflict', () => {
    expect(normalizeApiProblem(axiosFailure(409, {}))).toMatchObject({
      kind: 'conflict',
      status: 409,
    })
  })

  it('maps server response failures to server', () => {
    expect(normalizeApiProblem(axiosFailure(503, {}))).toMatchObject({
      kind: 'server',
      status: 503,
    })
  })

  it('distinguishes cancellation, timeout, and offline failures', () => {
    expect(normalizeApiProblem(new axios.CanceledError())).toMatchObject({
      kind: 'cancelled',
    })
    expect(
      normalizeApiProblem(new AxiosError('timeout', 'ECONNABORTED')),
    ).toMatchObject({ kind: 'timeout' })
    expect(
      normalizeApiProblem(new AxiosError('network', 'ERR_NETWORK'))).toMatchObject({
      kind: 'network',
    })
  })
})
