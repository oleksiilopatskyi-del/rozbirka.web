import { apiClient } from './client'
import { tokens } from './tokens'
import type { Tenant } from './types'

export const tenantsApi = {
  async list(): Promise<Tenant[]> {
    const resp = await apiClient.get<Tenant[]>('/tenants')
    return resp.data
  },

  async ensureSelected(): Promise<Tenant | null> {
    if (tokens.getTenant()) return null
    const tenants = await this.list().catch(() => [])
    const first = tenants[0]
    if (first) {
      tokens.setTenant(first.id)
      return first
    }
    return null
  },
}
