import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '../api/client'
import { accessApi } from './access-api'
import { ALL_PERMISSIONS, type MePermissionsDto } from './access-types'

const accessDto: MePermissionsDto = {
  role: 'manager',
  permissions: ['cars.view', 'future.permission'],
  features: ['reports.advanced'],
}

describe('accessApi', () => {
  it('loads effective access through the tenant-scoped core client', async () => {
    const signal = new AbortController().signal
    const get = vi
      .spyOn(apiClient, 'get')
      .mockResolvedValue({ data: accessDto } as never)

    await expect(accessApi.get({ signal })).resolves.toEqual(accessDto)
    expect(get).toHaveBeenCalledWith('/me/permissions', { signal })

    get.mockRestore()
  })

  it('includes billing permissions in the canonical permission union', () => {
    expect(ALL_PERMISSIONS).toContain('billing.view')
    expect(ALL_PERMISSIONS).toContain('billing.manage')
  })
})
