import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, expect, it } from 'vitest'
import { businessApi } from './business'
import { apiClient } from './client'

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

const originalAdapter = apiClient.defaults.adapter!

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter
})

it('patches only the selected tenant business settings and forwards cancellation', async () => {
  const controller = new AbortController()
  let observed: InternalAxiosRequestConfig | undefined
  apiClient.defaults.adapter = (config) => {
    observed = config
    return Promise.resolve(
      response(config, {
        id: 'tenant-1',
        name: 'Koval Auto',
        slug: 'koval',
        city: 'Львів',
        logoUrl: null,
        isActive: true,
        createdAt: '2026-08-01T10:00:00Z',
        roleName: 'owner',
      }),
    )
  }

  await expect(
    businessApi.update(
      'tenant-1',
      { name: 'Koval Auto', city: 'Львів' },
      { signal: controller.signal },
    ),
  ).resolves.toMatchObject({ id: 'tenant-1', city: 'Львів' })

  expect(observed?.method).toBe('patch')
  expect(observed?.url).toBe('/tenants/tenant-1')
  expect(observed?.data).toBe(
    JSON.stringify({ name: 'Koval Auto', city: 'Львів' }),
  )
  expect(observed?.signal?.aborted).toBe(false)
  controller.abort()
  expect(observed?.signal?.aborted).toBe(true)
})
