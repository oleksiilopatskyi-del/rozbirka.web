const COOKIE_NAME = 'rozbirka_refresh'
const REFRESH_MAX_AGE = 90 * 24 * 60 * 60
const SESSION_PATHS = new Set([
  '/session/otp/verify',
  '/session/refresh',
  '/session/logout',
])

export interface SessionEnv {
  IDENTITY_ORIGIN: string
}

type JsonRecord = Record<string, unknown>

interface VerifyBrowserDto {
  accessToken: string
  user: {
    id: string
    phone: string
    displayName: string
  }
  isNewUser: boolean
}

interface RefreshBrowserDto {
  accessToken: string
  expiresIn: number
}

const SAFE_OTP_ERROR_CODES = new Set([
  'OTP_INVALID',
  'OTP_COOLDOWN',
  'OTP_RATE_LIMITED',
  'OTP_EXPIRED',
  'OTP_MAX_ATTEMPTS',
])

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function responseHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra)
  headers.set('Cache-Control', 'no-store')
  return headers
}

function json(value: unknown, init?: ResponseInit) {
  return Response.json(value, {
    ...init,
    headers: responseHeaders(init?.headers),
  })
}

function jsonProblem(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
) {
  return json({ error: { code, message } }, { status, headers })
}

function cookieValue(request: Request) {
  const cookie = request.headers.get('cookie')
  if (!cookie) return null

  for (const part of cookie.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    if (part.slice(0, separator).trim() !== COOKIE_NAME) continue
    const value = part.slice(separator + 1).trim()
    if (!value) return null
    try {
      return decodeURIComponent(value)
    } catch {
      return null
    }
  }

  return null
}

function isInsecureLocalRequest(url: URL) {
  return (
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  )
}

function refreshCookie(url: URL, refreshToken: string | null) {
  const parts = [
    `${COOKIE_NAME}=${refreshToken ? encodeURIComponent(refreshToken) : ''}`,
    `Max-Age=${refreshToken ? REFRESH_MAX_AGE : 0}`,
    'HttpOnly',
  ]
  if (!isInsecureLocalRequest(url)) parts.push('Secure')
  parts.push('SameSite=Strict', 'Path=/session')
  return parts.join('; ')
}

async function requestBody(request: Request) {
  try {
    const body: unknown = await request.json()
    return isRecord(body) ? body : null
  } catch {
    return null
  }
}

function identityFailure(status = 502) {
  return jsonProblem(
    status,
    'IDENTITY_REQUEST_FAILED',
    'Identity service request failed',
  )
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function verifyBrowserData(data: unknown): {
  browser: VerifyBrowserDto
  refreshToken: string
} | null {
  if (!isRecord(data) || !isRecord(data.user)) return null
  if (
    !isNonEmptyString(data.accessToken) ||
    !isNonEmptyString(data.refreshToken) ||
    !isNonEmptyString(data.user.id) ||
    !isNonEmptyString(data.user.phone) ||
    typeof data.user.displayName !== 'string' ||
    typeof data.isNewUser !== 'boolean'
  ) {
    return null
  }

  return {
    browser: {
      accessToken: data.accessToken,
      user: {
        id: data.user.id,
        phone: data.user.phone,
        displayName: data.user.displayName,
      },
      isNewUser: data.isNewUser,
    },
    refreshToken: data.refreshToken,
  }
}

function refreshBrowserData(data: unknown): {
  browser: RefreshBrowserDto
  refreshToken: string
} | null {
  if (
    !isRecord(data) ||
    !isNonEmptyString(data.accessToken) ||
    !isNonEmptyString(data.refreshToken) ||
    typeof data.expiresIn !== 'number' ||
    !Number.isSafeInteger(data.expiresIn) ||
    data.expiresIn < 0
  ) {
    return null
  }

  return {
    browser: { accessToken: data.accessToken, expiresIn: data.expiresIn },
    refreshToken: data.refreshToken,
  }
}

function safeRetryAfter(response: Response) {
  const raw = response.headers.get('retry-after')
  if (raw === null || !/^(0|[1-9]\d*)$/.test(raw)) return undefined
  const seconds = Number(raw)
  return Number.isSafeInteger(seconds) ? raw : undefined
}

async function otpFailure(response: Response) {
  let code: string | undefined
  try {
    const payload: unknown = await response.json()
    if (isRecord(payload) && isRecord(payload.error)) {
      const candidate = payload.error.code
      if (
        typeof candidate === 'string' &&
        SAFE_OTP_ERROR_CODES.has(candidate)
      ) {
        code = candidate
      }
    }
  } catch {
    // Malformed upstream errors are intentionally collapsed below.
  }

  if (!code) return identityFailure(response.status)
  const retryAfter = safeRetryAfter(response)
  return jsonProblem(
    response.status,
    code,
    'OTP verification failed',
    retryAfter === undefined ? undefined : { 'Retry-After': retryAfter },
  )
}

async function callIdentity(
  url: string,
  body: JsonRecord,
  authorization?: string | null,
) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (authorization) headers.set('Authorization', authorization)

  try {
    return await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  } catch {
    return null
  }
}

async function upstreamData(response: Response) {
  try {
    const payload: unknown = await response.json()
    if (!isRecord(payload) || !('data' in payload)) return undefined
    return payload.data
  } catch {
    return undefined
  }
}

function withCookie(response: Response, cookie: string) {
  const headers = new Headers(response.headers)
  headers.set('Set-Cookie', cookie)
  headers.set('Cache-Control', 'no-store')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export async function handleSessionRequest(
  request: Request,
  env: SessionEnv,
): Promise<Response | null> {
  const url = new URL(request.url)
  if (!SESSION_PATHS.has(url.pathname)) return null

  const origin = request.headers.get('origin')
  if (origin && origin !== url.origin) {
    return jsonProblem(403, 'INVALID_ORIGIN', 'Request origin is not allowed')
  }

  if (request.method !== 'POST') {
    return jsonProblem(405, 'METHOD_NOT_ALLOWED', 'Method not allowed', {
      Allow: 'POST',
    })
  }

  if (url.pathname === '/session/otp/verify') {
    const body = await requestBody(request)
    if (!body) return jsonProblem(400, 'INVALID_REQUEST', 'Invalid request')

    const response = await callIdentity(`${env.IDENTITY_ORIGIN}/auth/verify`, {
      allowRegistration: true,
      ...body,
    })
    if (!response) return identityFailure()
    if (!response.ok) return otpFailure(response)

    const data = await upstreamData(response)
    const validated = verifyBrowserData(data)
    if (!validated) return identityFailure()
    return withCookie(
      json(validated.browser),
      refreshCookie(url, validated.refreshToken),
    )
  }

  const refreshToken = cookieValue(request)
  if (!refreshToken) {
    const response = jsonProblem(
      401,
      'MISSING_REFRESH_TOKEN',
      'Refresh credential is missing',
    )
    return url.pathname === '/session/logout'
      ? withCookie(response, refreshCookie(url, null))
      : response
  }

  if (url.pathname === '/session/refresh') {
    const response = await callIdentity(`${env.IDENTITY_ORIGIN}/auth/refresh`, {
      refreshToken,
    })
    if (!response) return identityFailure()
    if (!response.ok) return identityFailure(response.status)

    const data = await upstreamData(response)
    const validated = refreshBrowserData(data)
    if (!validated) return identityFailure()
    return withCookie(
      json(validated.browser),
      refreshCookie(url, validated.refreshToken),
    )
  }

  const response = await callIdentity(
    `${env.IDENTITY_ORIGIN}/auth/logout`,
    { refreshToken },
    request.headers.get('authorization'),
  )
  const expiredCookie = refreshCookie(url, null)
  if (!response) return withCookie(identityFailure(), expiredCookie)
  if (!response.ok) {
    return withCookie(identityFailure(response.status), expiredCookie)
  }
  return withCookie(new Response(null, { status: 204 }), expiredCookie)
}
