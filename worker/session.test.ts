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
  it('sends OTP through Identity and returns only bounded cooldown data', async () => {
    let upstreamRequest: Request | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        upstreamRequest = new Request(input, init)
        return Promise.resolve(
          Response.json({
            data: {
              cooldownSeconds: 60,
              retryAfterSeconds: 300,
              internalSecret: 'identity-internal-secret',
            },
          }),
        )
      }),
    )

    const response = await handleSessionRequest(
      new Request('https://rozbirka.pro/session/otp/send', {
        method: 'POST',
        headers: {
          origin: 'https://rozbirka.pro',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          phone: '+380501112233',
          ignored: 'browser-secret',
        }),
      }),
      env,
    )

    expect(response).not.toBeNull()
    if (!response) return
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(JSON.parse(text)).toEqual({
      cooldownSeconds: 60,
      retryAfterSeconds: 300,
    })
    expect(text).not.toContain('identity-internal-secret')
    expect(upstreamRequest?.url).toBe('https://identity.example/auth/phone')
    expect(upstreamRequest?.method).toBe('POST')
    expect(await upstreamRequest?.json()).toEqual({
      phone: '+380501112233',
    })
  })

  it.each([
    { cooldownSeconds: 60 },
    { cooldownSeconds: -1, retryAfterSeconds: 300 },
    { cooldownSeconds: 60, retryAfterSeconds: '300' },
  ])('rejects malformed OTP send success data %#', async (data) => {
    identityResponse({ data })

    const response = await handleSessionRequest(
      new Request('https://rozbirka.pro/session/otp/send', {
        method: 'POST',
        body: JSON.stringify({ phone: '+380501112233' }),
      }),
      env,
    )

    expect(response).not.toBeNull()
    if (!response) return
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({
      error: { code: 'IDENTITY_REQUEST_FAILED' },
    })
  })

  it.each(['OTP_COOLDOWN', 'OTP_RATE_LIMITED'])(
    'preserves the allowlisted OTP send code %s without upstream details',
    async (code) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            Response.json(
              {
                data: null,
                error: {
                  code,
                  message: 'identity-internal-secret',
                  details: { token: 'identity-internal-secret' },
                },
              },
              { status: 429, headers: { 'Retry-After': '17' } },
            ),
          ),
        ),
      )

      const response = await handleSessionRequest(
        new Request('https://rozbirka.pro/session/otp/send', {
          method: 'POST',
          body: JSON.stringify({ phone: '+380501112233' }),
        }),
        env,
      )

      expect(response).not.toBeNull()
      if (!response) return
      const text = await response.text()
      expect(response.status).toBe(429)
      expect(response.headers.get('retry-after')).toBe('17')
      expect(JSON.parse(text)).toEqual({
        error: { code, message: 'OTP send failed' },
      })
      expect(text).not.toContain('identity-internal-secret')
      expect(text).not.toContain('details')
    },
  )

  it.each([{}, { phone: '' }, { phone: 380501112233 }])(
    'rejects malformed OTP send input without calling Identity %#',
    async (body) => {
      const upstreamFetch = vi.fn()
      vi.stubGlobal('fetch', upstreamFetch)

      const response = await handleSessionRequest(
        new Request('https://rozbirka.pro/session/otp/send', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
        env,
      )

      expect(response?.status).toBe(400)
      expect(await response?.json()).toMatchObject({
        error: { code: 'INVALID_REQUEST' },
      })
      expect(upstreamFetch).not.toHaveBeenCalled()
    },
  )

  it('collapses a verify-only OTP error code on the send route', async () => {
    identityResponse(
      {
        error: {
          code: 'OTP_INVALID',
          message: 'identity-internal-secret',
        },
      },
      { status: 400 },
    )

    const response = await handleSessionRequest(
      new Request('https://rozbirka.pro/session/otp/send', {
        method: 'POST',
        body: JSON.stringify({ phone: '+380501112233' }),
      }),
      env,
    )

    const text = await response!.text()
    expect(response?.status).toBe(400)
    expect(JSON.parse(text)).toEqual({
      error: {
        code: 'IDENTITY_REQUEST_FAILED',
        message: 'Identity service request failed',
      },
    })
    expect(text).not.toContain('identity-internal-secret')
  })

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
                nestedSecret: 'user-internal-secret',
              },
              isNewUser: false,
              expiresIn: 900,
              internalSecret: 'identity-internal-secret',
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
    expect(text).not.toContain('identity-internal-secret')
    expect(text).not.toContain('user-internal-secret')
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
              expiresIn: 900,
              authorization: 'upstream-bearer-secret',
              nested: { token: 'nested-secret' },
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

    expect(await response!.json()).toEqual({
      accessToken: 'rotated-access',
      expiresIn: 900,
    })
    expect(response!.headers.get('set-cookie')).toContain(
      'rozbirka_refresh=rotated-refresh',
    )
    expect(await upstreamRequest?.json()).toEqual({
      refreshToken: 'old-refresh',
    })
  })

  it.each([
    {
      name: 'a missing access token',
      data: {
        refreshToken: 'refresh-secret',
        user: { id: 'u1', phone: '+380501112233', displayName: 'Vlad' },
        isNewUser: false,
      },
    },
    {
      name: 'a malformed user',
      data: {
        accessToken: 'access',
        refreshToken: 'refresh-secret',
        user: { id: 'u1', phoneNumber: '+380501112233', displayName: 'Vlad' },
        isNewUser: false,
      },
    },
    {
      name: 'a malformed new-user flag',
      data: {
        accessToken: 'access',
        refreshToken: 'refresh-secret',
        user: { id: 'u1', phone: '+380501112233', displayName: 'Vlad' },
        isNewUser: 'false',
      },
    },
  ])('rejects verify success data with $name', async ({ data }) => {
    identityResponse({ data })

    const response = await handleSessionRequest(
      new Request('https://rozbirka.pro/session/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone: '+380501112233', code: '123456' }),
      }),
      env,
    )

    expect(response!.status).toBe(502)
    expect(response!.headers.get('set-cookie')).toBeNull()
    expect(await response!.json()).toEqual({
      error: {
        code: 'IDENTITY_REQUEST_FAILED',
        message: 'Identity service request failed',
      },
    })
  })

  it.each([
    {
      accessToken: 'rotated-access',
      refreshToken: 'rotated-refresh',
    },
    {
      accessToken: 'rotated-access',
      refreshToken: 'rotated-refresh',
      expiresIn: '900',
    },
  ])('rejects malformed refresh success data %#', async (data) => {
    identityResponse({ data })

    const response = await handleSessionRequest(
      new Request('https://rozbirka.pro/session/refresh', {
        method: 'POST',
        headers: { cookie: 'rozbirka_refresh=old-refresh' },
      }),
      env,
    )

    expect(response!.status).toBe(502)
    expect(response!.headers.get('set-cookie')).toBeNull()
    expect(await response!.json()).toMatchObject({
      error: { code: 'IDENTITY_REQUEST_FAILED' },
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

  it.each([
    'OTP_INVALID',
    'OTP_COOLDOWN',
    'OTP_RATE_LIMITED',
    'OTP_EXPIRED',
    'OTP_MAX_ATTEMPTS',
  ])(
    'preserves the allowlisted OTP code %s with a fixed message',
    async (code) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            Response.json(
              {
                data: null,
                error: {
                  code,
                  message: 'refresh-secret and internal host 10.0.0.7',
                  details: { refreshToken: 'refresh-secret' },
                },
              },
              {
                status: 400,
                headers: { 'Retry-After': '17' },
              },
            ),
          ),
        ),
      )

      const response = await handleSessionRequest(
        new Request('https://rozbirka.pro/session/otp/verify', {
          method: 'POST',
          body: JSON.stringify({ phone: '+380501112233', code: '000000' }),
        }),
        env,
      )
      const text = await response!.text()

      expect(response!.status).toBe(400)
      expect(response!.headers.get('retry-after')).toBe('17')
      expect(JSON.parse(text)).toEqual({
        error: { code, message: 'OTP verification failed' },
      })
      expect(text).not.toContain('refresh-secret')
      expect(text).not.toContain('10.0.0.7')
      expect(text).not.toContain('details')
    },
  )

  it.each(['-1', '1.5', '1e2', '9007199254740992'])(
    'does not forward an invalid Retry-After value %s',
    async (retryAfter) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve(
            Response.json(
              {
                data: null,
                error: { code: 'OTP_INVALID', message: 'secret' },
              },
              { status: 400, headers: { 'Retry-After': retryAfter } },
            ),
          ),
        ),
      )

      const response = await handleSessionRequest(
        new Request('https://rozbirka.pro/session/otp/verify', {
          method: 'POST',
          body: JSON.stringify({ phone: '+380501112233', code: '000000' }),
        }),
        env,
      )

      expect(response!.headers.get('retry-after')).toBeNull()
    },
  )

  it('omits Secure only for localhost or 127.0.0.1 over HTTP', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            data: {
              accessToken: 'access',
              refreshToken: 'refresh',
              expiresIn: 900,
            },
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
