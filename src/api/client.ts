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

identityClient.interceptors.response.use(undefined, on401)
apiClient.interceptors.response.use(undefined, on401)
