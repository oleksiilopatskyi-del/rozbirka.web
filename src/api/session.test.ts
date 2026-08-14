import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type CreateAxiosDefaults,
  type InternalAxiosRequestConfig,
} from 'axios'
import { beforeEach, expect, it, vi } from 'vitest'
import { credentials } from './credentials'
import { normalizeApiProblem } from './errors'
import { createSessionApi } from './session'

const verifyPayload = {
  accessToken: 'access-token',
  refreshToken: 'must-not-escape',
  user: {
    id: 'user-1',
    phone: '+380501234567',
    displayName: 'Олена',
  },
  isNewUser: true,
}

function response<T>(
  config: InternalAxiosRequestConfig,
  data: T,
): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: new AxiosHeaders(),
    config,
  }
}

function failure(
  config: InternalAxiosRequestConfig,
  status: number,
  data: unknown = {},
) {
  return new AxiosError(
    'request failed',
    'ERR_BAD_RESPONSE',
    config,
    undefined,
    {
      data,
      status,
      statusText: 'Error',
      headers: new AxiosHeaders(),
      config,
    },
  )
}

function sessionHarness(adapter: AxiosAdapter) {
  let defaults: CreateAxiosDefaults | undefined
  const requests: InternalAxiosRequestConfig[] = []
  const session = createSessionApi((config) => {
    defaults = config
    return axios.create({
      ...config,
      adapter: async (request) => {
        requests.push(request)
        return adapter(request)
      },
    })
  })

  return {
    session,
    requests,
    get defaults() {
      return defaults
    },
  }
}

beforeEach(() => {
  credentials.clear()
  vi.restoreAllMocks()
})

it('posts verify to the same-origin session route and stores only access in memory', async () => {
  const localSet = vi.spyOn(Storage.prototype, 'setItem')
  const sessionSet = vi.spyOn(sessionStorage, 'setItem')
  const harness = sessionHarness((config) =>
    Promise.resolve(response(config, verifyPayload)),
  )

  const result = await harness.session.verify({
    phone: '+380501234567',
    code: '123456',
  })

  expect(result).toEqual({
    accessToken: 'access-token',
    user: {
      id: 'user-1',
      phone: '+380501234567',
      displayName: 'Олена',
    },
    isNewUser: true,
  })
  expect(result).not.toHaveProperty('refreshToken')
  expect(harness.requests[0]).toMatchObject({
    url: '/session/otp/verify',
    method: 'post',
  })
  expect(JSON.parse(harness.requests[0]?.data as string)).toEqual({
    phone: '+380501234567',
    code: '123456',
  })
  expect(credentials.getAccess()).toBe('access-token')
  expect(localSet).not.toHaveBeenCalled()
  expect(sessionSet).not.toHaveBeenCalled()
})

it('uses credentials: include semantics through withCredentials', async () => {
  const harness = sessionHarness((config) =>
    Promise.resolve(
      response(config, {
        accessToken: 'fresh-token',
        expiresIn: 900,
        refreshToken: 'must-not-escape',
      }),
    ),
  )

  const result = await harness.session.refresh()

  expect(result).toEqual({ accessToken: 'fresh-token', expiresIn: 900 })
  expect(result).not.toHaveProperty('refreshToken')
  expect(harness.defaults).toMatchObject({
    baseURL: '',
    timeout: 15000,
    withCredentials: true,
  })
  expect(harness.requests[0]?.withCredentials).toBe(true)
  expect(credentials.getAccess()).toBe('fresh-token')
})

it('maps an absent refresh cookie to session-expired', async () => {
  const harness = sessionHarness((config) =>
    Promise.reject(failure(config, 401)),
  )

  await expect(harness.session.refresh()).rejects.toMatchObject({
    kind: 'session-expired',
    status: 401,
  })
})

it('keeps normalized facade problems stable across API boundaries', async () => {
  const harness = sessionHarness((config) =>
    Promise.reject(
      failure(config, 422, {
        error: { code: 'INVALID_CODE', message: 'Code is invalid' },
        errors: { code: ['Try another code'] },
      }),
    ),
  )

  const problem = await harness.session
    .verify({ phone: '+380501234567', code: '000000' })
    .then(
      () => undefined,
      (error: unknown) => normalizeApiProblem(error),
    )

  expect(problem).toMatchObject({
    kind: 'validation',
    status: 422,
    code: 'INVALID_CODE',
    message: 'Code is invalid',
    fieldErrors: { code: ['Try another code'] },
  })
})

it('logout clears access even when the request fails', async () => {
  credentials.setAccess('current-token')
  const harness = sessionHarness((config) =>
    Promise.reject(failure(config, 503)),
  )

  await expect(harness.session.logout()).rejects.toMatchObject({
    kind: 'server',
    status: 503,
  })

  expect(harness.requests[0]).toMatchObject({
    url: '/session/logout',
    method: 'post',
  })
  expect(harness.requests[0]?.headers.get('Authorization')).toBe(
    'Bearer current-token',
  )
  expect(credentials.getAccess()).toBeNull()
})

it('returns void from logout when the request succeeds', async () => {
  credentials.setAccess('current-token')
  const harness = sessionHarness((config) =>
    Promise.resolve(response(config, undefined)),
  )

  await expect(harness.session.logout()).resolves.toBeUndefined()
  expect(credentials.getAccess()).toBeNull()
})

it('settles an invalidated refresh before dispatching logout', async () => {
  credentials.setAccess('current-token')
  const order: string[] = []
  let releaseRefresh!: () => void
  const harness = sessionHarness((config) => {
    if (config.url === '/session/refresh') {
      order.push('refresh-start')
      config.signal?.addEventListener?.('abort', () => {
        order.push('refresh-abort')
      })
      return new Promise((resolve) => {
        releaseRefresh = () => {
          order.push('refresh-settle')
          resolve(
            response(config, { accessToken: 'late-access', expiresIn: 900 }),
          )
        }
      })
    }

    if (config.url === '/session/logout') {
      order.push('logout-start')
      return Promise.resolve(response(config, undefined))
    }

    return Promise.reject(new Error(`Unexpected route: ${String(config.url)}`))
  })

  const refreshProblem = harness.session.refresh().then(
    () => null,
    (error: unknown) => normalizeApiProblem(error),
  )
  await vi.waitFor(() => expect(order).toEqual(['refresh-start']))

  const logout = harness.session.logout()
  await vi.waitFor(() => expect(order).toHaveLength(2))
  const logoutStartedBeforeRefreshSettlement = order.includes('logout-start')
  const refreshWasAborted = order.includes('refresh-abort')
  releaseRefresh()

  await expect(refreshProblem).resolves.toMatchObject({ kind: 'cancelled' })
  await expect(logout).resolves.toBeUndefined()
  expect(refreshWasAborted).toBe(true)
  expect(logoutStartedBeforeRefreshSettlement).toBe(false)
  expect(order).toEqual([
    'refresh-start',
    'refresh-abort',
    'refresh-settle',
    'logout-start',
  ])
  expect(credentials.getAccess()).toBeNull()
})
