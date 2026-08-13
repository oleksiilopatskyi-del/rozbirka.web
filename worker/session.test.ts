// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleSessionRequest } from './session'

const env = { IDENTITY_ORIGIN: 'https://identity.example' }

function identityResponse(body: unknown, init?: ResponseInit) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(Response.json(body, init))),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('session BFF', () => {
  it('stores refresh in an HttpOnly cookie and returns no refresh credential', async () => {
    let upstreamRequest: Request | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        upstreamRequest = new Request(input, init)
        return Promise.resolve(
          Response.json({
            data: {
              accessToken: 'access',
              refreshToken: 'refresh-secret',
              user: {
                id: 'u1',
                phone: '+380501112233',
                displayName: 'Vlad',
              },
              isNewUser: false,
            },
          }),
        )
      }),
    )

    const response = await handleSessionRequest(
      new Request('https://rozbirka.pro/session/otp/verify', {
        method: 'POST',
        headers: {
          origin: 'https://rozbirka.pro',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ phone: '+380501112233', code: '123456' }),
      }),
      env,
    )
    const text = await response!.text()

    expect(response!.headers.get('set-cookie')).toMatch(
      /^rozbirka_refresh=.*Max-Age=7776000.*HttpOnly.*Secure.*SameSite=Strict.*Path=\/session/i,
    )
    expect(response!.headers.get('cache-control')).toBe('no-store')
    expect(text).not.toContain('refresh-secret')
    expect(JSON.parse(text)).toEqual({
      accessToken: 'access',
      user: {
        id: 'u1',
        phone: '+380501112233',
        displayName: 'Vlad',
      },
      isNewUser: false,
    })
    expect(upstreamRequest?.url).toBe('https://identity.example/auth/verify')
    expect(await upstreamRequest?.json()).toEqual({
      allowRegistration: true,
      phone: '+380501112233',
      code: '123456',
    })
  })

  it('rotates the refresh cookie and returns only the access token', async () => {
    let upstreamRequest: Request | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        upstreamRequest = new Request(input, init)
        return Promise.resolve(
          Response.json({
            data: {
              accessToken: 'rotated-access',
              refreshToken: 'rotated-refresh',
            },
          }),
        )
      }),
    )

    const response = await handleSessionRequest(
      new Request('https://rozbirka.pro/session/refresh', {
        method: 'POST',
        headers: { cookie: 'theme=dark; rozbirka_refresh=old-refresh' },
      }),
      env,
    )

    expect(await response!.json()).toEqual({ accessToken: 'rotated-access' })
    expect(response!.headers.get('set-cookie')).toContain(
      'rozbirka_refresh=rotated-refresh',
    )
    expect(await upstreamRequest?.json()).toEqual({
      refreshToken: 'old-refresh',
    })
  })

  it('expires the cookie even when upstream logout fails', async () => {
    identityResponse(
      { error: { code: 'UPSTREAM_SECRET', message: 'refresh-secret' } },
      { status: 503 },
    )

    const response = await handleSessionRequest(
      new Request('https://rozbirka.pro/session/logout', {
        method: 'POST',
        headers: { cookie: 'rozbirka_refresh=refresh-secret' },
      }),
      env,
    )
    const text = await response!.text()

    expect(response!.status).toBe(503)
    expect(response!.headers.get('set-cookie')).toMatch(
      /^rozbirka_refresh=;.*Max-Age=0.*HttpOnly.*Secure.*SameSite=Strict.*Path=\/session/i,
    )
    expect(text).not.toContain('UPSTREAM_SECRET')
    expect(text).not.toContain('refresh-secret')
    expect(JSON.parse(text)).toEqual({
      error: {
        code: 'IDENTITY_REQUEST_FAILED',
        message: 'Identity service request failed',
      },
    })
  })

  it('rejects a mismatched Origin before calling upstream', async () => {
    const upstreamFetch = vi.fn()
    vi.stubGlobal('fetch', upstreamFetch)

    const response = await handleSessionRequest(
      new Request('https://rozbirka.pro/session/otp/verify', {
        method: 'POST',
        headers: { origin: 'https://attacker.example' },
        body: '{}',
      }),
      env,
    )

    expect(response!.status).toBe(403)
    expect(await response!.json()).toMatchObject({
      error: { code: 'INVALID_ORIGIN' },
    })
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  it('returns 401 without calling upstream when refresh cookie is absent', async () => {
    const upstreamFetch = vi.fn()
    vi.stubGlobal('fetch', upstreamFetch)

    const response = await handleSessionRequest(
      new Request('https://rozbirka.pro/session/refresh', { method: 'POST' }),
      env,
    )

    expect(response!.status).toBe(401)
    expect(await response!.json()).toMatchObject({
      error: { code: 'MISSING_REFRESH_TOKEN' },
    })
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  it('passes Authorization and accepts the protected logout 204 response', async () => {
    let upstreamRequest: Request | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        upstreamRequest = new Request(input, init)
        return Promise.resolve(new Response(null, { status: 204 }))
      }),
    )

    const response = await handleSessionRequest(
      new Request('https://rozbirka.pro/session/logout', {
        method: 'POST',
        headers: {
          authorization: 'Bearer access-token',
          cookie: 'rozbirka_refresh=refresh-token',
        },
      }),
      env,
    )

    expect(response!.status).toBe(204)
    expect(response!.headers.get('cache-control')).toBe('no-store')
    expect(upstreamRequest?.url).toBe('https://identity.example/auth/logout')
    expect(upstreamRequest?.headers.get('authorization')).toBe(
      'Bearer access-token',
    )
    expect(await upstreamRequest?.json()).toEqual({
      refreshToken: 'refresh-token',
    })
    expect(response!.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('maps upstream errors without exposing the upstream body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            {
              error: {
                code: 'INVALID_OTP',
                message: 'refresh-secret was rejected',
                details: { refreshToken: 'refresh-secret' },
              },
            },
            { status: 422 },
          ),
        ),
      ),
    )

    const response = await handleSessionRequest(
      new Request('https://rozbirka.pro/session/otp/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: '+380501112233', code: '000000' }),
      }),
      env,
    )
    const text = await response!.text()

    expect(response!.status).toBe(422)
    expect(JSON.parse(text)).toEqual({
      error: {
        code: 'IDENTITY_REQUEST_FAILED',
        message: 'Identity service request failed',
      },
    })
    expect(text).not.toContain('INVALID_OTP')
    expect(text).not.toContain('refresh-secret')
  })

  it('omits Secure only for localhost or 127.0.0.1 over HTTP', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            data: { accessToken: 'access', refreshToken: 'refresh' },
          }),
        ),
      ),
    )

    for (const url of [
      'http://localhost:8787/session/refresh',
      'http://127.0.0.1:8787/session/refresh',
    ]) {
      const response = await handleSessionRequest(
        new Request(url, {
          method: 'POST',
          headers: { cookie: 'rozbirka_refresh=old-refresh' },
        }),
        env,
      )
      expect(response!.headers.get('set-cookie')).not.toContain('Secure')
    }

    for (const url of [
      'https://localhost/session/refresh',
      'http://dev.example/session/refresh',
    ]) {
      const response = await handleSessionRequest(
        new Request(url, {
          method: 'POST',
          headers: { cookie: 'rozbirka_refresh=old-refresh' },
        }),
        env,
      )
      expect(response!.headers.get('set-cookie')).toContain('Secure')
    }
  })

  it('returns 405 with Allow: POST for other methods', async () => {
    const upstreamFetch = vi.fn()
    vi.stubGlobal('fetch', upstreamFetch)

    const response = await handleSessionRequest(
      new Request('https://rozbirka.pro/session/refresh'),
      env,
    )

    expect(response!.status).toBe(405)
    expect(response!.headers.get('allow')).toBe('POST')
    expect(response!.headers.get('cache-control')).toBe('no-store')
    expect(upstreamFetch).not.toHaveBeenCalled()
  })
})
