/* eslint-disable @typescript-eslint/unbound-method -- Vitest mock methods are asserted directly. */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { businessApi } from '@/api/business'
import type { Tenant } from '@/api/types'
import { useCabinet, type CabinetContextValue } from '../CabinetContext'
import { BusinessSettingsScreen } from './business-settings-screen'

vi.mock('@/api/business', () => ({ businessApi: { update: vi.fn() } }))
vi.mock('../CabinetContext', () => ({ useCabinet: vi.fn() }))

const tenant: Tenant = {
  id: 'tenant-1',
  name: 'Koval Auto',
  slug: 'koval',
  plan: 'active',
  planTier: 'pro',
  city: 'Львів',
  logoUrl: null,
  isActive: true,
  createdAt: '2026-08-01T10:00:00Z',
  roleName: 'owner',
}

const cabinet = (permissions = ['team.manage']) =>
  ({
    status: 'ready',
    targetTenant: tenant,
    snapshot: {
      userId: 'user-1',
      tenantId: tenant.id,
      generation: 4,
      role: 'owner',
      permissions: new Set(permissions),
      features: new Set(),
      entitlement: null,
      subscription: null,
    },
    error: null,
    retry: vi.fn(),
    switchTenant: vi.fn(),
  }) satisfies CabinetContextValue

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useCabinet).mockReturnValue(cabinet())
  vi.mocked(businessApi.update).mockResolvedValue(tenant)
})

it('round-trips trimmed business settings through the active tenant', async () => {
  const normalizedTenant = {
    ...tenant,
    name: 'Koval Parts LLC',
    city: 'Буча',
  }
  vi.mocked(businessApi.update).mockResolvedValue(normalizedTenant)
  const currentCabinet = cabinet()
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const user = userEvent.setup()
  render(<BusinessSettingsScreen />)

  await user.clear(screen.getByLabelText('Назва розбірки'))
  await user.type(screen.getByLabelText('Назва розбірки'), '  Koval Parts  ')
  await user.clear(screen.getByLabelText('Місто'))
  await user.type(screen.getByLabelText('Місто'), '  Київ  ')
  await user.click(screen.getByRole('button', { name: 'Зберегти' }))

  const updateCall = vi.mocked(businessApi.update).mock.calls[0]
  expect(updateCall?.[0]).toBe('tenant-1')
  expect(updateCall?.[1]).toEqual({ name: 'Koval Parts', city: 'Київ' })
  expect(updateCall?.[2]?.signal).toBeInstanceOf(AbortSignal)
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Налаштування бізнесу збережено.',
  )
  expect(screen.getByLabelText('Назва розбірки')).toHaveValue('Koval Parts LLC')
  expect(screen.getByLabelText('Місто')).toHaveValue('Буча')
  expect(currentCabinet.switchTenant).toHaveBeenCalledWith('tenant-1')
})

it('rechecks permission immediately before dispatching a business update', async () => {
  const currentCabinet = cabinet()
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const user = userEvent.setup()
  render(<BusinessSettingsScreen />)

  await user.clear(screen.getByLabelText('Назва розбірки'))
  await user.type(screen.getByLabelText('Назва розбірки'), 'Koval Parts')
  currentCabinet.snapshot?.permissions.delete('team.manage')
  await user.click(screen.getByRole('button', { name: 'Зберегти' }))

  expect(businessApi.update).not.toHaveBeenCalled()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Ви більше не маєте права змінювати налаштування бізнесу.',
  )
})
