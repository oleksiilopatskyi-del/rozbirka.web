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
    if (!response.ok) return identityFailure(response.status)

    const data = await upstreamData(response)
    if (!isRecord(data) || typeof data.refreshToken !== 'string') {
      return identityFailure()
    }
    const { refreshToken, ...browserPayload } = data
    return withCookie(json(browserPayload), refreshCookie(url, refreshToken))
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
    if (!isRecord(data) || typeof data.refreshToken !== 'string') {
      return identityFailure()
    }
    const { refreshToken: nextRefreshToken, ...browserPayload } = data
    return withCookie(
      json(browserPayload),
      refreshCookie(url, nextRefreshToken),
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

  const data = await upstreamData(response)
  if (data === undefined) {
    return withCookie(identityFailure(), expiredCookie)
  }
  return withCookie(json(data), expiredCookie)
}
