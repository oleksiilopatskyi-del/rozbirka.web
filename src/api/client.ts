import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import type { ApiProblem, IdempotentMutation } from './contracts'
import { tenantRequestScope } from '../cabinet/tenant-request-scope'
import { credentials } from './credentials'
import { normalizeApiProblem } from './errors'
import {
  createRefreshCoordinator,
  type SessionRetryConfig,
} from './refresh-coordinator'
import { sessionApi } from './session'
import { tenantPreference } from './tenant-preference'

// The deployed landing and API gateway use separate hosts
// (rozbirka.pro → api.rozbirka.pro, qa.rozbirka.pro → qaapi.rozbirka.pro).
// Local development may omit VITE_API_URL to keep same-origin proxying.
const API_URL = (import.meta.env['VITE_API_URL'] as string | undefined) ?? ''

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

// Public client — /api/v1, no auth or tenant headers (for example, billing plans)
export const publicApiClient: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: TIMEOUT,
})

export const withIdempotency = <T extends AxiosRequestConfig>(
  config: T,
  option: IdempotentMutation | undefined,
): T => (option ? { ...config, idempotency: option } : config)

const attachAuth = (config: InternalAxiosRequestConfig) => {
  const access = credentials.getAccess()
  if (access) {
    config.headers.set('Authorization', `Bearer ${access}`)
  }
  return config
}

const attachIdempotency = (config: InternalAxiosRequestConfig) => {
  const method = config.method?.toLowerCase()
  const isSafeMethod =
    method === 'get' || method === 'head' || method === 'options'
  if (!config.idempotency || isSafeMethod) {
    config.headers.delete('Idempotency-Key')
    return config
  }

  const existingKey = config.headers.get('Idempotency-Key')
  config.headers.set(
    'Idempotency-Key',
    config.idempotency.idempotencyKey ??
      (typeof existingKey === 'string' ? existingKey : crypto.randomUUID()),
  )
  return config
}

identityClient.interceptors.request.use(attachAuth)
apiClient.interceptors.request.use((config) => {
  attachAuth(config)
  const tenant = tenantPreference.get()
  if (tenant) {
    config.headers.set('X-Tenant-Id', tenant)
  }
  config.signal = AbortSignal.any([
    ...(config.signal ? [config.signal as AbortSignal] : []),
    tenantRequestScope.signal,
  ])
  return config
})

identityClient.interceptors.request.use(attachIdempotency)
apiClient.interceptors.request.use(attachIdempotency)
publicApiClient.interceptors.request.use(attachIdempotency)

// Unwrap { data: { data: T } } → T
const unwrap = (response: AxiosResponse): AxiosResponse => {
  const body = response.data as { data?: unknown } | null
  if (
    body &&
    typeof body === 'object' &&
    'data' in body &&
    body.data !== undefined
  ) {
    response.data = body.data
  }
  return response
}

const replayOwners = new WeakMap<SessionRetryConfig, AxiosInstance>()
const refreshCoordinator = createRefreshCoordinator({
  refresh: async () => (await sessionApi.refresh()).accessToken,
  setAccess: (token) => credentials.setAccess(token),
  clearAccess: () => credentials.clear(),
  replay: (request) => {
    const owner = replayOwners.get(request)
    if (!owner) {
      throw new Error('Authenticated request owner is unavailable')
    }
    return owner.request(request)
  },
})

const stampProblem = (error: AxiosError, problemSource: unknown = error) => {
  error.problem = normalizeApiProblem(problemSource)
  throw error
}

const recoverSession = (owner: AxiosInstance) => async (error: AxiosError) => {
  if (error.config) {
    replayOwners.set(error.config, owner)
  }

  try {
    return await refreshCoordinator.recover(error)
  } catch (terminalError) {
    stampProblem(error, terminalError)
  }
}

identityClient.interceptors.response.use(unwrap, recoverSession(identityClient))
apiClient.interceptors.response.use(unwrap, recoverSession(apiClient))
publicApiClient.interceptors.response.use(unwrap, (error: AxiosError) => {
  stampProblem(error)
})

declare module 'axios' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- must match Axios declaration exactly
  interface AxiosRequestConfig<D = any> {
    idempotency?: IdempotentMutation
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- must match Axios declaration exactly
  interface InternalAxiosRequestConfig<D = any> {
    _sessionRetry?: boolean
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- must match Axios declaration exactly
  interface AxiosError<T = unknown, D = any> {
    problem?: ApiProblem
  }
}
