import { describe, expect, it } from 'vitest'
import type { Tenant } from '../api/types'
import { cabinetPath, resolveAccountDestination } from './cabinet-paths'

const tenant: Tenant = {
  id: 'tenant-1',
  name: 'Koval Auto',
  slug: 'koval',
  plan: 'active',
  planTier: 'pro',
  city: 'Київ',
  logoUrl: null,
  isActive: true,
  createdAt: '2026-08-01T10:00:00Z',
  roleName: 'owner',
}

describe('cabinetPath', () => {
  it('builds canonical tenant module paths with an encoded suffix', () => {
    expect(cabinetPath('koval', 'dashboard')).toBe('/app/koval/dashboard')
    expect(cabinetPath('koval', 'cars', 'car 42/photos')).toBe(
      '/app/koval/cars/car%2042/photos',
    )
    expect(
      cabinetPath('koval', 'inventory', 'sessions/session 1/results'),
    ).toBe('/app/koval/inventory/sessions/session%201/results')
  })

  it.each(['', '-koval', 'Koval', 'koval_auto', 'koval\n', 'a'.repeat(64)])(
    'rejects a non-canonical tenant slug %j',
    (slug) => {
      expect(() => cabinetPath(slug, 'dashboard')).toThrow(
        'Invalid tenant slug',
      )
    },
  )
})

describe('resolveAccountDestination', () => {
  it('maps legacy plan selection into tenant billing', () => {
    expect(
      resolveAccountDestination(
        tenant,
        '?section=plans&plan=pro_monthly&ignored=value',
      ),
    ).toBe('/app/koval/settings/billing/plans?plan=pro_monthly')
  })

  it.each([
    ['?section=subscription', '/app/koval/settings/billing/overview'],
    ['?section=payment', '/app/koval/settings/billing/payments'],
    ['?section=billing', '/app/koval/settings/billing/payments'],
    ['', '/app/koval/dashboard'],
    ['?section=unknown', '/app/koval/dashboard'],
  ])('maps legacy search %s to %s', (search, expected) => {
    expect(resolveAccountDestination(tenant, search)).toBe(expected)
  })

  it('omits an invalid legacy plan code', () => {
    expect(
      resolveAccountDestination(tenant, '?section=plans&plan=%2Fcheckout'),
    ).toBe('/app/koval/settings/billing/plans')
  })

  it('preserves only a safe scan intent on the dashboard destination', () => {
    expect(resolveAccountDestination(tenant, '?scan=QR-123~part')).toBe(
      '/app/koval/dashboard?scan=QR-123~part',
    )
    expect(resolveAccountDestination(tenant, '?scan=%5Cevil')).toBe(
      '/app/koval/dashboard',
    )
  })
})
