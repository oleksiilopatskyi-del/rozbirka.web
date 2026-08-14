import { apiClient } from '../api/client'
import type { RequestOptions } from '../api/contracts'
import type { MePermissionsDto } from './access-types'

const requestConfig = (options: RequestOptions) =>
  options.signal ? { signal: options.signal } : {}

export const accessApi = {
  async get(options: RequestOptions = {}): Promise<MePermissionsDto> {
    const response = await apiClient.get<MePermissionsDto>(
      '/me/permissions',
      requestConfig(options),
    )
    return response.data
  },
}
