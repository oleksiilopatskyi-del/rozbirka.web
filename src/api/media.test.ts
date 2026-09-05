import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, describe, expect, it } from 'vitest'
import { apiClient } from './client'
import { mediaApi } from './media'

const originalAdapter = apiClient.defaults.adapter!

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter
})

function response<T>(
  config: InternalAxiosRequestConfig,
  data: T,
): AxiosResponse<{ data: T }> {
  return {
    data: { data },
    status: 201,
    statusText: 'Created',
    headers: new AxiosHeaders(),
    config,
  }
}

describe('mediaApi', () => {
  it('uploads a selected file as authenticated multipart data for its documented entity type', async () => {
    let request!: InternalAxiosRequestConfig
    apiClient.defaults.adapter = (config) => {
      request = config
      return Promise.resolve(
        response(config, {
          storageKey: 'pending/cars/image-1',
          url: 'https://cdn.example/image-1.jpg',
        }),
      )
    }
    const file = new File(['photo'], 'car.jpg', { type: 'image/jpeg' })

    await expect(mediaApi.upload(file, 'cars')).resolves.toEqual({
      storageKey: 'pending/cars/image-1',
      url: 'https://cdn.example/image-1.jpg',
    })

    expect(request.url).toBe('/media/upload')
    expect(request.method).toBe('post')
    expect(request.params).toEqual({ entityType: 'cars' })
    expect(request.data).toBeInstanceOf(FormData)
    expect((request.data as FormData).get('file')).toBe(file)
  })

  it('deletes only a documented pending storage key', async () => {
    let request!: InternalAxiosRequestConfig
    apiClient.defaults.adapter = (config) => {
      request = config
      return Promise.resolve({
        data: undefined,
        status: 204,
        statusText: 'No Content',
        headers: new AxiosHeaders(),
        config,
      })
    }

    await mediaApi.remove('pending/intakes/image-1')

    expect(request.url).toBe('/media')
    expect(request.method).toBe('delete')
    expect(JSON.parse(request.data as string)).toEqual({
      storageKey: 'pending/intakes/image-1',
    })
  })

  it('rejects an unsupported runtime entity type before making a request', async () => {
    const adapter = vi.fn()
    apiClient.defaults.adapter = adapter

    await expect(
      mediaApi.upload(
        new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }),
        'orders' as never,
      ),
    ).rejects.toThrow('Unsupported media entity type')
    expect(adapter).not.toHaveBeenCalled()
  })

  it('rejects an empty pending storage key before making a delete request', async () => {
    const adapter = vi.fn()
    apiClient.defaults.adapter = adapter

    await expect(mediaApi.remove('   ')).rejects.toThrow(
      'Pending media storage key is required',
    )
    expect(adapter).not.toHaveBeenCalled()
  })
})
