import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { tokens } from './tokens'
import type { RefreshResponse } from './types'

const API_URL =
  (import.meta.env['VITE_API_URL'] as string | undefined) ??
  'https://qa.rozbirka.com'

const TIMEOUT = 15000

// Identity client — base URL, no tenant, used for /auth/*
export const identityClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: TIMEOUT,
})

// Core client — /api/v1, attaches tenant
export const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: TIMEOUT,
})

// Attach auth + tenant headers on every request
const attachAuth = (config: InternalAxiosRequestConfig) => {
  const access = tokens.getAccess()
  if (access) {
    config.headers.set('Authorization', `Bearer ${access}`)
  }
  return config
}

identityClient.interceptors.request.use(attachAuth)
apiClient.interceptors.request.use((config) => {
  attachAuth(config)
  const tenant = tokens.getTenant()
  if (tenant) {
    config.headers.set('X-Tenant-Id', tenant)
  }
  return config
})

// Unwrap { data: { data: T } } → T
const unwrap = (resp: AxiosResponse): AxiosResponse => {
  const body = resp.data as { data?: unknown } | null
  if (
    body &&
    typeof body === 'object' &&
    'data' in body &&
    body.data !== undefined
  ) {
    resp.data = body.data
  }
  return resp
}

identityClient.interceptors.response.use(unwrap)
apiClient.interceptors.response.use(unwrap)

// 401 refresh handling — deduped
let refreshPromise: Promise<string | null> | null = null

const refreshAccessToken = async (): Promise<string | null> => {
  const refresh = tokens.getRefresh()
  if (!refresh) return null
  try {
    const resp = await axios.post<RefreshResponse | { data: RefreshResponse }>(
      `${API_URL}/auth/refresh`,
      { refreshToken: refresh },
      { headers: { 'Content-Type': 'application/json' }, timeout: TIMEOUT },
    )
    const payload =
      'data' in resp.data
        ? (resp.data as { data: RefreshResponse }).data
        : (resp.data as RefreshResponse)
    tokens.set(payload.accessToken, payload.refreshToken)
    return payload.accessToken
  } catch {
    tokens.clear()
    return null
  }
}

const on401 = async (error: AxiosError) => {
  const original = error.config as
    | (InternalAxiosRequestConfig & { _retry?: boolean })
    | undefined
  if (!original || original._retry) throw error
  if (error.response?.status !== 401) throw error
  if (original.url?.includes('/auth/refresh')) throw error

  original._retry = true
  refreshPromise ??= refreshAccessToken().finally(() => {
    refreshPromise = null
  })
  const newToken = await refreshPromise
  if (!newToken) {
    tokens.clear()
    throw error
  }
  original.headers.set('Authorization', `Bearer ${newToken}`)
  return axios.request(original)
}

/**
 * Normalize the backend's three error envelope shapes into a single
 * `{ code, message }` pair stamped onto the error object as `error.normalized`.
 * See rozbirka.core/docs/billing-integration.md → "Error Handling".
 *
 *   • Nested  (ErrorHandlingMiddleware): { data: null, error: { code, message } }
 *   • Flat    (TenantMiddleware):        { error: "tenant_blocked", message }
 *   • Flat+ok (AuthorizePermissionAttr): { success: false, error: "FORBIDDEN", message }
 */
export interface NormalizedApiError {
  code?: string
  message?: string
  status?: number
}

export const normalizeApiError = (
  error: AxiosError,
): NormalizedApiError => {
  const body = error.response?.data as
    | { error?: string | { code?: string; message?: string }; message?: string }
    | undefined
  const status = error.response?.status

  const out: NormalizedApiError = {}
  if (status !== undefined) out.status = status

  if (typeof body?.error === 'string') {
    if (body.error) out.code = body.error
    if (body.message) out.message = body.message
  } else if (body?.error && typeof body.error === 'object') {
    if (body.error.code) out.code = body.error.code
    if (body.error.message) out.message = body.error.message
  }

  return out
}

const stampError = (error: AxiosError) => {
  ;(error as AxiosError & { normalized?: NormalizedApiError }).normalized =
    normalizeApiError(error)
  throw error
}

identityClient.interceptors.response.use(undefined, async (e: AxiosError) => {
  try {
    return await on401(e)
  } catch (err) {
    stampError(err as AxiosError)
  }
})

apiClient.interceptors.response.use(undefined, async (e: AxiosError) => {
  try {
    return await on401(e)
  } catch (err) {
    stampError(err as AxiosError)
  }
})

declare module 'axios' {
  interface AxiosError {
    normalized?: NormalizedApiError
  }
}
