import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, expect, it } from 'vitest'
import { apiClient } from './client'
import { scannersApi } from './scanners'

const originalAdapter = apiClient.defaults.adapter!

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter
})

it('resolves a QR code only through the tenant-scoped authenticated client', async () => {
  let request: InternalAxiosRequestConfig | undefined
  apiClient.defaults.adapter = (config) => {
    request = config
    return Promise.resolve({
      data: { data: { id: 'part-1' } },
      status: 200,
      statusText: 'OK',
      headers: new AxiosHeaders(),
      config,
    } satisfies AxiosResponse)
  }

  await scannersApi.resolveQr('QR-123/part')

  expect(request?.url).toBe('/parts/qr/QR-123%2Fpart')
  expect(request?.method).toBe('get')
})

it('declares VIN and OEM decoding unavailable without a contract operation', () => {
  expect(scannersApi.decodeVin).toEqual({ available: false })
  expect(scannersApi.decodeOem).toEqual({ available: false })
})
