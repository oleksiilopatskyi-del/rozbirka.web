import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api/client'
import { accessApi } from './access-api'
import { ALL_PERMISSIONS, type MePermissionsDto } from './access-types'

const accessDto: MePermissionsDto = {
  role: 'manager',
  permissions: ['cars.view', 'future.permission'],
  features: ['reports.advanced'],
  entitlement: {
    state: 'active',
    usage: {
      cars: { used: 2, max: 20 },
      intakes: { used: 1, max: 25 },
      parts: { used: 8, max: 2_000 },
      users: { used: 2, max: 5 },
      cashRegisters: { used: 1, max: 2 },
    },
  },
}

describe('accessApi', () => {
  it('loads effective access through the tenant-scoped core client', async () => {
    const signal = new AbortController().signal
    const get = vi
      .spyOn(apiClient, 'get')
      .mockResolvedValue({ data: accessDto })

    await expect(accessApi.get({ signal })).resolves.toEqual(accessDto)
    expect(get).toHaveBeenCalledWith('/me/permissions', { signal })

    get.mockRestore()
  })

  it('includes billing permissions in the canonical permission union', () => {
    expect(ALL_PERMISSIONS).toContain('billing.view')
    expect(ALL_PERMISSIONS).toContain('billing.manage')
  })
})
