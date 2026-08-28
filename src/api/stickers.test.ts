import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, expect, it } from 'vitest'
import { apiClient } from './client'
import { stickersApi } from './stickers'

const originalAdapter = apiClient.defaults.adapter!

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter
})

it('requests authenticated sticker data using the immutable batch request shape', async () => {
  let request: InternalAxiosRequestConfig | undefined
  apiClient.defaults.adapter = (config) => {
    request = config
    return Promise.resolve({
      data: { data: { items: [] } },
      status: 200,
      statusText: 'OK',
      headers: new AxiosHeaders(),
      config,
    } satisfies AxiosResponse)
  }

  await stickersApi.getBatchData(['part-1', 'part-2'])

  expect(request?.url).toBe('/parts/batch-sticker')
  expect(request?.method).toBe('post')
  expect(JSON.parse(request?.data as string)).toEqual({
    ids: ['part-1', 'part-2'],
  })
})

it('does not claim PDF support when batch sticker data is not a PDF contract', () => {
  expect(stickersApi.pdf).toEqual({ available: false })
})
