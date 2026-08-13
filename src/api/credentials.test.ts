import { beforeEach, expect, it, vi } from 'vitest'
import { credentials } from './credentials'
import { tenantPreference } from './tenant-preference'

beforeEach(() => {
  credentials.clear()
  tenantPreference.clear()
})

it('keeps the access token in module memory only', () => {
  const localSet = vi.spyOn(Storage.prototype, 'setItem')
  const sessionSet = vi.spyOn(sessionStorage, 'setItem')

  credentials.setAccess('access-token')

  expect(credentials.getAccess()).toBe('access-token')
  expect(localSet).not.toHaveBeenCalled()
  expect(sessionSet).not.toHaveBeenCalled()
})

it('notifies subscribers once per authenticated-to-cleared transition', () => {
  const listener = vi.fn()
  const unsubscribe = credentials.onCleared(listener)

  credentials.setAccess('one')
  credentials.clear()
  credentials.clear()

  expect(listener).toHaveBeenCalledTimes(1)
  unsubscribe()
})

it('persists only the selected tenant preference', () => {
  tenantPreference.set('tenant-123')

  expect(tenantPreference.get()).toBe('tenant-123')
  expect(localStorage.getItem('rozbirka.tenantId')).toBe('tenant-123')

  tenantPreference.clear()

  expect(tenantPreference.get()).toBeNull()
})
