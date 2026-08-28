import { apiClient } from './client'
import type { RequestOptions } from './contracts'
import type { Tenant } from './types'

export interface UpdateBusinessRequest {
  name?: string
  city?: string | null
  logoUrl?: string | null
}

const requestConfig = (options: RequestOptions) =>
  options.signal ? { signal: options.signal } : {}

export const businessApi = {
  async update(
    tenantId: string,
    request: UpdateBusinessRequest,
    options: RequestOptions = {},
  ): Promise<Tenant> {
    const response = await apiClient.patch<Tenant>(
      `/tenants/${tenantId}`,
      request,
      requestConfig(options),
    )
    return response.data
  },
}
