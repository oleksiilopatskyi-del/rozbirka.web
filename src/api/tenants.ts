import { apiClient } from './client'
import type { RequestOptions } from './contracts'
import { normalizeApiProblem } from './errors'
import { tenantPreference } from './tenant-preference'
import type { CreateTenantRequest, CreateTenantResponse, Tenant } from './types'

const requestConfig = (options: RequestOptions) =>
  options.signal ? { signal: options.signal } : {}

export const tenantsApi = {
  async list(options: RequestOptions = {}): Promise<Tenant[]> {
    const resp = await apiClient.get<Tenant[]>(
      '/tenants',
      requestConfig(options),
    )
    return resp.data
  },

  async create(
    req: CreateTenantRequest,
    options: RequestOptions = {},
  ): Promise<CreateTenantResponse> {
    const resp = await apiClient.post<CreateTenantResponse>(
      '/tenants',
      req,
      requestConfig(options),
    )
    return resp.data
  },

  async ensureSelected(options: RequestOptions = {}): Promise<Tenant | null> {
    if (tenantPreference.get()) return null
    const tenants = await this.list(options).catch((error: unknown) => {
      if (normalizeApiProblem(error).kind === 'cancelled') throw error
      return []
    })
    const first = tenants[0]
    if (first) {
      tenantPreference.set(first.id)
      return first
    }
    return null
  },
}
