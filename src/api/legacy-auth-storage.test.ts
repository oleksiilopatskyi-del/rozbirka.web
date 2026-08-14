import { beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})

it('removes legacy auth keys on module initialization without clearing tenant preference', async () => {
  localStorage.setItem('rozbirka.accessToken', 'legacy-access')
  localStorage.setItem('rozbirka.refreshToken', 'legacy-refresh')
  localStorage.setItem('rozbirka.tenantId', 'tenant-123')
  const getItem = vi.spyOn(Storage.prototype, 'getItem')

  await import('./credentials')

  expect(getItem).not.toHaveBeenCalledWith('rozbirka.accessToken')
  expect(getItem).not.toHaveBeenCalledWith('rozbirka.refreshToken')
  getItem.mockRestore()
  expect(localStorage.getItem('rozbirka.accessToken')).toBeNull()
  expect(localStorage.getItem('rozbirka.refreshToken')).toBeNull()
  expect(localStorage.getItem('rozbirka.tenantId')).toBe('tenant-123')
})
