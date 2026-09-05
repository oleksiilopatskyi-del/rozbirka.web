import { apiClient } from './client'
import type { RequestOptions } from './contracts'

export type MediaEntityType = 'cars' | 'parts' | 'intakes' | 'tenants'

export interface MediaUploadResult {
  storageKey: string
  url: string
}

const mediaEntityTypes = new Set<MediaEntityType>([
  'cars',
  'parts',
  'intakes',
  'tenants',
])

const requestConfig = (options: RequestOptions) =>
  options.signal ? { signal: options.signal } : {}

export const mediaApi = {
  async upload(
    file: File,
    entityType: MediaEntityType,
    options: RequestOptions = {},
  ): Promise<MediaUploadResult> {
    if (!mediaEntityTypes.has(entityType)) {
      throw new TypeError('Unsupported media entity type')
    }
    const data = new FormData()
    data.append('file', file)
    const response = await apiClient.post<MediaUploadResult>(
      '/media/upload',
      data,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: { entityType },
        ...requestConfig(options),
      },
    )
    return response.data
  },

  async remove(
    storageKey: string,
    options: RequestOptions = {},
  ): Promise<void> {
    if (!storageKey.trim()) {
      throw new TypeError('Pending media storage key is required')
    }
    await apiClient.delete('/media', {
      data: { storageKey },
      ...requestConfig(options),
    })
  },
}
