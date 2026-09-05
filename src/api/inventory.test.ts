import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, expect, it } from 'vitest'
import { apiClient } from './client'
import { inventoryApi } from './inventory'

const originalAdapter = apiClient.defaults.adapter!

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter
})

function capture() {
  const requests: InternalAxiosRequestConfig[] = []
  apiClient.defaults.adapter = (config) => {
    requests.push(config)
    return Promise.resolve({
      data: { data: [] },
      status: 200,
      statusText: 'OK',
      headers: new AxiosHeaders(),
      config,
    } satisfies AxiosResponse)
  }
  return requests
}

it('loads management inventory resources through tenant-scoped routes', async () => {
  const requests = capture()
  const controller = new AbortController()

  await inventoryApi.getWarehouses({ signal: controller.signal })
  await inventoryApi.getSessions({ signal: controller.signal })
  await inventoryApi.getResults('session/1', { signal: controller.signal })

  expect(requests.map(({ method, url }) => [method, url])).toEqual([
    ['get', '/warehouses'],
    ['get', '/inventory/sessions'],
    ['get', '/inventory/sessions/session%2F1/results'],
  ])
  expect(requests.every(({ signal }) => signal?.aborted === false)).toBe(true)
  controller.abort()
  expect(requests.every(({ signal }) => signal?.aborted === true)).toBe(true)
})

it('sends exact warehouse, session, adjustment, and placement mutations', async () => {
  const requests = capture()

  await inventoryApi.createWarehouse({ name: 'Основний', code: 'main' })
  await inventoryApi.createSession(['zone-1'])
  await inventoryApi.cancelSession('session-1', 'Перерахунок')
  await inventoryApi.applyAdjustment('session-1', 'part-1', 'Перевірено')
  await inventoryApi.replacePartZones('part-1', ['zone-1'])

  expect(
    requests.map(
      ({
        method,
        url,
        data,
      }): [string | undefined, string | undefined, unknown] => [
        method,
        url,
        data as unknown,
      ],
    ),
  ).toEqual([
    ['post', '/warehouses', JSON.stringify({ name: 'Основний', code: 'main' })],
    ['post', '/inventory/sessions', JSON.stringify({ zoneIds: ['zone-1'] })],
    [
      'post',
      '/inventory/sessions/session-1/cancel',
      JSON.stringify({ reason: 'Перерахунок' }),
    ],
    [
      'post',
      '/inventory/sessions/session-1/adjustments/part-1',
      JSON.stringify({ reason: 'Перевірено' }),
    ],
    [
      'put',
      '/parts/part-1/inventory-zones',
      JSON.stringify({ zoneIds: ['zone-1'] }),
    ],
  ])
})

it('exposes scans as read-only management data without scan mutations', () => {
  expect(inventoryApi).toHaveProperty('getScans')
  expect(inventoryApi).not.toHaveProperty('recordScan')
  expect(inventoryApi).not.toHaveProperty('acquireLease')
  expect(inventoryApi).not.toHaveProperty('completeZone')
})
