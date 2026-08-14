import {
  AxiosError,
  AxiosHeaders,
  CanceledError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  apiClient,
  identityClient,
  publicApiClient,
  withIdempotency,
} from './client'
import { credentials } from './credentials'
import { sessionApi } from './session'
import { tenantPreference } from './tenant-preference'
import { tenantRequestScope } from '../cabinet/tenant-request-scope'

function response<T>(
  config: InternalAxiosRequestConfig,
  data: T,
  status = 200,
): AxiosResponse<T> {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new AxiosHeaders(),
    config,
  }
}

function failure(config: InternalAxiosRequestConfig, status: number) {
  return new AxiosError(
    'request failed',
    'ERR_BAD_RESPONSE',
    config,
    undefined,
    {
      ...response(
        config,
        { error: 'REQUEST_FAILED', message: 'Request failed' },
        status,
      ),
      status,
      statusText: 'Error',
    },
  )
}

const originalAdapters = {
  api: apiClient.defaults.adapter!,
  identity: identityClient.defaults.adapter!,
  public: publicApiClient.defaults.adapter!,
}

beforeEach(() => {
  credentials.clear()
  tenantPreference.clear()
  tenantRequestScope.rotate()
  localStorage.clear()
})

afterEach(() => {
  apiClient.defaults.adapter = originalAdapters.api
  identityClient.defaults.adapter = originalAdapters.identity
  publicApiClient.defaults.adapter = originalAdapters.public
  vi.restoreAllMocks()
})

describe('authenticated Axios clients', () => {
  it('attaches Bearer access from memory and tenant preference to Core requests', async () => {
    credentials.setAccess('memory-access')
    tenantPreference.set('tenant-123')
    let request: InternalAxiosRequestConfig | undefined
    apiClient.defaults.adapter = (config) => {
      request = config
      return Promise.resolve(response(config, { ok: true }))
    }

    await apiClient.get('/cars')

    expect(request?.headers.get('Authorization')).toBe('Bearer memory-access')
    expect(request?.headers.get('X-Tenant-Id')).toBe('tenant-123')
  })

  it('never reads accessToken or refreshToken from localStorage', async () => {
    localStorage.setItem('rozbirka.accessToken', 'persisted-access')
    localStorage.setItem('rozbirka.refreshToken', 'persisted-refresh')
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    let request: InternalAxiosRequestConfig | undefined
    apiClient.defaults.adapter = (config) => {
      request = config
      return Promise.resolve(response(config, { ok: true }))
    }

    await apiClient.get('/cars')

    expect(request?.headers.has('Authorization')).toBe(false)
    expect(getItem).not.toHaveBeenCalledWith('rozbirka.accessToken')
    expect(getItem).not.toHaveBeenCalledWith('rozbirka.refreshToken')
  })

  it('replays concurrent Core and Identity 401 responses after one session refresh', async () => {
    credentials.setAccess('expired')
    let release!: () => void
    const refresh = vi.spyOn(sessionApi, 'refresh').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ accessToken: 'fresh', expiresIn: 900 })
        }),
    )
    const attempts: string[] = []
    const adapter: AxiosAdapter = (config) => {
      const owner = config.baseURL?.endsWith('/api/v1') ? 'core' : 'identity'
      attempts.push(`${owner}:${String(config.headers.get('Authorization'))}`)
      if (!config._sessionRetry) return Promise.reject(failure(config, 401))
      return Promise.resolve(response(config, { data: { owner } }))
    }
    apiClient.defaults.adapter = adapter
    identityClient.defaults.adapter = adapter

    const core = apiClient.get<{ owner: string }>('/cars')
    const identity = identityClient.get<{ owner: string }>('/auth/me')
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    release()

    await expect(Promise.all([core, identity])).resolves.toEqual([
      expect.objectContaining({ data: { owner: 'core' } }),
      expect.objectContaining({ data: { owner: 'identity' } }),
    ])
    expect(refresh).toHaveBeenCalledOnce()
    expect(attempts).toEqual([
      'core:Bearer expired',
      'identity:Bearer expired',
      'core:Bearer fresh',
      'identity:Bearer fresh',
    ])
  })

  it('does not refresh public or session requests', async () => {
    const refresh = vi.spyOn(sessionApi, 'refresh')
    const rejectingAdapter: AxiosAdapter = (config) =>
      Promise.reject(failure(config, 401))
    publicApiClient.defaults.adapter = rejectingAdapter
    identityClient.defaults.adapter = rejectingAdapter

    await expect(publicApiClient.get('/billing/plans')).rejects.toMatchObject({
      problem: { kind: 'session-expired' },
    })
    await expect(identityClient.post('/session/refresh')).rejects.toMatchObject(
      {
        problem: { kind: 'session-expired' },
      },
    )
    expect(refresh).not.toHaveBeenCalled()
  })
})

it('stamps normalized ApiProblem metadata on terminal failures', async () => {
  publicApiClient.defaults.adapter = (config) =>
    Promise.reject(failure(config, 409))

  await expect(
    publicApiClient.post('/billing/subscribe'),
  ).rejects.toMatchObject({
    problem: {
      kind: 'conflict',
      code: 'REQUEST_FAILED',
      message: 'Request failed',
      status: 409,
    },
  })
})

it('composes caller and tenant cancellation for Core requests', async () => {
  const beginRequest = async () => {
    const caller = new AbortController()
    const tenantSignal = tenantRequestScope.signal
    let adapterSignal: AbortSignal | undefined
    apiClient.defaults.adapter = (config) =>
      new Promise((_resolve, reject) => {
        adapterSignal = config.signal as AbortSignal | undefined
        config.signal?.addEventListener?.('abort', () => {
          reject(new CanceledError(undefined, config))
        })
      })

    const pending = apiClient.get('/cars', { signal: caller.signal })
    await vi.waitFor(() => expect(adapterSignal).toBeDefined())
    expect(adapterSignal).not.toBe(caller.signal)
    expect(adapterSignal).not.toBe(tenantSignal)
    return { adapterSignal, caller, pending, tenantSignal }
  }

  const callerRequest = await beginRequest()
  callerRequest.caller.abort()
  await expect(callerRequest.pending).rejects.toMatchObject({
    problem: { kind: 'cancelled' },
  })
  expect(callerRequest.adapterSignal?.aborted).toBe(true)
  expect(callerRequest.tenantSignal.aborted).toBe(false)

  const tenantRequest = await beginRequest()
  tenantRequestScope.rotate()
  await expect(tenantRequest.pending).rejects.toMatchObject({
    problem: { kind: 'cancelled' },
  })
  expect(tenantRequest.adapterSignal?.aborted).toBe(true)
  expect(tenantRequest.caller.signal.aborted).toBe(false)
})

it('leaves Identity and Public requests outside the tenant request scope', async () => {
  const signals: unknown[] = []
  const adapter: AxiosAdapter = (config) => {
    signals.push(config.signal)
    return Promise.resolve(response(config, { ok: true }))
  }
  identityClient.defaults.adapter = adapter
  publicApiClient.defaults.adapter = adapter

  await identityClient.get('/auth/me')
  await publicApiClient.get('/billing/plans')

  expect(signals).toEqual([undefined, undefined])
})

it('adds Idempotency-Key only when an idempotent mutation opts in', async () => {
  const generatedKey = '00000000-0000-4000-8000-000000000001'
  const randomUUID = vi
    .spyOn(globalThis.crypto, 'randomUUID')
    .mockReturnValue(generatedKey)
  const observed: { method: string; key: unknown }[] = []
  apiClient.defaults.adapter = (config) => {
    observed.push({
      method: String(config.method),
      key: config.headers.get('Idempotency-Key'),
    })
    return Promise.resolve(response(config, { ok: true }))
  }

  await apiClient.post('/cars', {}, withIdempotency({}, {}))
  await apiClient.post(
    '/cars',
    {},
    withIdempotency({}, { idempotencyKey: 'caller-key' }),
  )
  await apiClient.post('/cars', {})
  await apiClient.get('/cars', withIdempotency({}, {}))
  await apiClient.head('/cars', withIdempotency({}, {}))
  await apiClient.options('/cars', withIdempotency({}, {}))

  expect(observed).toEqual([
    { method: 'post', key: generatedKey },
    { method: 'post', key: 'caller-key' },
    { method: 'post', key: undefined },
    { method: 'get', key: undefined },
    { method: 'head', key: undefined },
    { method: 'options', key: undefined },
  ])
  expect(randomUUID).toHaveBeenCalledOnce()
})

it('strips pre-existing idempotency keys unless a mutation explicitly opts in', async () => {
  const observed: { method: string; key: unknown }[] = []
  apiClient.defaults.adapter = (config) => {
    observed.push({
      method: String(config.method),
      key: config.headers.get('Idempotency-Key'),
    })
    return Promise.resolve(response(config, { ok: true }))
  }
  const injectedHeader = { headers: { 'Idempotency-Key': 'injected-key' } }

  await apiClient.post('/cars', {}, injectedHeader)
  await apiClient.get('/cars', withIdempotency(injectedHeader, {}))
  await apiClient.head('/cars', withIdempotency(injectedHeader, {}))
  await apiClient.options('/cars', withIdempotency(injectedHeader, {}))
  await apiClient.post('/cars', {}, withIdempotency(injectedHeader, {}))

  expect(observed).toEqual([
    { method: 'post', key: undefined },
    { method: 'get', key: undefined },
    { method: 'head', key: undefined },
    { method: 'options', key: undefined },
    { method: 'post', key: 'injected-key' },
  ])
})
