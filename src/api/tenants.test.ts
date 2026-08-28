import { AxiosError, AxiosHeaders, CanceledError } from 'axios'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { tenantPreference } from './tenant-preference'
import { tenantsApi } from './tenants'

const originalAdapter = apiClient.defaults.adapter!

beforeEach(() => {
  tenantPreference.clear()
})

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter
})

it('rethrows cancellation from automatic tenant selection', async () => {
  const controller = new AbortController()
  let adapterSignal: AbortSignal | undefined
  apiClient.defaults.adapter = (config) =>
    new Promise((_resolve, reject) => {
      adapterSignal = config.signal as AbortSignal | undefined
      config.signal?.addEventListener?.('abort', () => {
        reject(new CanceledError(undefined, config))
      })
    })

  const pending = tenantsApi.ensureSelected({ signal: controller.signal })
  await vi.waitFor(() => expect(adapterSignal).toBeDefined())
  expect(adapterSignal?.aborted).toBe(false)
  controller.abort()

  await expect(pending).rejects.toMatchObject({
    problem: { kind: 'cancelled' },
  })
  expect(adapterSignal?.aborted).toBe(true)
  expect(tenantPreference.get()).toBeNull()
})

it('retains the null fallback for non-cancellation lookup failures', async () => {
  apiClient.defaults.adapter = (config) =>
    Promise.reject(
      new AxiosError('unavailable', 'ERR_BAD_RESPONSE', config, undefined, {
        data: {},
        status: 503,
        statusText: 'Unavailable',
        headers: new AxiosHeaders(),
        config,
      }),
    )

  await expect(tenantsApi.ensureSelected()).resolves.toBeNull()
})
