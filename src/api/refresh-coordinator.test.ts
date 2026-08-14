import { AxiosError, AxiosHeaders } from 'axios'
import { expect, it, vi } from 'vitest'
import { createRefreshCoordinator } from './refresh-coordinator'

function unauthorized(url?: string, retried = false) {
  const config = url
    ? {
        headers: new AxiosHeaders(),
        method: 'get',
        url,
        ...(retried ? { _sessionRetry: true } : {}),
      }
    : undefined

  return new AxiosError('unauthorized', 'ERR_BAD_RESPONSE', config, undefined, {
    data: {},
    status: 401,
    statusText: 'Unauthorized',
    headers: new AxiosHeaders(),
    config: config ?? { headers: new AxiosHeaders() },
  })
}

it('shares one refresh and replays every concurrent request once', async () => {
  let release!: (token: string) => void
  const refresh = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        release = resolve
      }),
  )
  const replay = vi.fn((request: { _sessionRetry?: boolean }) =>
    Promise.resolve(request),
  )
  const setAccess = vi.fn()
  const coordinator = createRefreshCoordinator({
    refresh,
    setAccess,
    clearAccess: vi.fn(),
    replay,
  })

  const first = coordinator.recover(unauthorized('/cars'))
  const second = coordinator.recover(unauthorized('/orders'))

  expect(refresh).toHaveBeenCalledTimes(1)
  release('fresh')
  await expect(Promise.all([first, second])).resolves.toHaveLength(2)
  expect(setAccess).toHaveBeenCalledOnce()
  expect(setAccess).toHaveBeenCalledWith('fresh')
  expect(replay).toHaveBeenCalledTimes(2)
  expect(replay.mock.calls[0]?.[0]).toMatchObject({ _sessionRetry: true })
  expect(replay.mock.calls[1]?.[0]).toMatchObject({ _sessionRetry: true })
})

it('does not recover a request that was already retried', async () => {
  const refresh = vi.fn(() => Promise.resolve('fresh'))
  const replay = vi.fn()
  const coordinator = createRefreshCoordinator({
    refresh,
    setAccess: vi.fn(),
    clearAccess: vi.fn(),
    replay,
  })

  await expect(
    coordinator.recover(unauthorized('/cars', true)),
  ).rejects.toMatchObject({ kind: 'session-expired', status: 401 })
  expect(refresh).not.toHaveBeenCalled()
  expect(replay).not.toHaveBeenCalled()
})

it('does not recover a session endpoint failure', async () => {
  const refresh = vi.fn(() => Promise.resolve('fresh'))
  const coordinator = createRefreshCoordinator({
    refresh,
    setAccess: vi.fn(),
    clearAccess: vi.fn(),
    replay: vi.fn(),
  })

  await expect(
    coordinator.recover(unauthorized('/session/refresh')),
  ).rejects.toMatchObject({ kind: 'session-expired', status: 401 })
  expect(refresh).not.toHaveBeenCalled()
})

it('does not recover an error with missing request config', async () => {
  const refresh = vi.fn(() => Promise.resolve('fresh'))
  const coordinator = createRefreshCoordinator({
    refresh,
    setAccess: vi.fn(),
    clearAccess: vi.fn(),
    replay: vi.fn(),
  })

  await expect(coordinator.recover(unauthorized())).rejects.toMatchObject({
    kind: 'session-expired',
    status: 401,
  })
  expect(refresh).not.toHaveBeenCalled()
})

it('normalizes refresh rejection as session-expired and clears access once', async () => {
  const clearAccess = vi.fn()
  const refresh = vi.fn(() => Promise.reject(unauthorized('/session/refresh')))
  const replay = vi.fn()
  const coordinator = createRefreshCoordinator({
    refresh,
    setAccess: vi.fn(),
    clearAccess,
    replay,
  })

  const first = coordinator.recover(unauthorized('/cars'))
  const second = coordinator.recover(unauthorized('/orders'))

  await expect(Promise.all([first, second])).rejects.toMatchObject({
    kind: 'session-expired',
    status: 401,
  })
  expect(clearAccess).toHaveBeenCalledOnce()
  expect(replay).not.toHaveBeenCalled()
})

it('clears the single-flight promise after refresh rejection', async () => {
  const refresh = vi
    .fn<() => Promise<string>>()
    .mockRejectedValueOnce(unauthorized('/session/refresh'))
    .mockResolvedValueOnce('fresh')
  const coordinator = createRefreshCoordinator({
    refresh,
    setAccess: vi.fn(),
    clearAccess: vi.fn(),
    replay: vi.fn(() => Promise.resolve('replayed')),
  })

  await expect(
    coordinator.recover(unauthorized('/cars')),
  ).rejects.toMatchObject({ kind: 'session-expired' })
  await expect(coordinator.recover(unauthorized('/cars'))).resolves.toBe(
    'replayed',
  )
  expect(refresh).toHaveBeenCalledTimes(2)
})

it('normalizes a synchronous refresh failure and releases the flight', async () => {
  let attempts = 0
  const refresh = vi.fn((): Promise<string> => {
    attempts += 1
    if (attempts === 1) throw new Error('synchronous refresh failure')
    return Promise.resolve('fresh')
  })
  const clearAccess = vi.fn()
  const coordinator = createRefreshCoordinator({
    refresh,
    setAccess: vi.fn(),
    clearAccess,
    replay: vi.fn(() => Promise.resolve('replayed')),
  })

  await expect(
    coordinator.recover(unauthorized('/cars')),
  ).rejects.toMatchObject({ kind: 'session-expired', status: 401 })
  expect(clearAccess).toHaveBeenCalledOnce()

  await expect(coordinator.recover(unauthorized('/cars'))).resolves.toBe(
    'replayed',
  )
  expect(refresh).toHaveBeenCalledTimes(2)
})
