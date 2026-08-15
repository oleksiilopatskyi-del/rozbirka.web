import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { tenantsApi } from '@/api/tenants'
import { tenantPreference } from '@/api/tenant-preference'
import { useAuth, type AuthContextValue } from '@/auth/AuthContext'
import { TenantOnboardingScreen } from './tenant-onboarding'

/* eslint-disable @typescript-eslint/unbound-method -- Vitest resolves the API method into a typed mock. */

vi.mock('@/api/tenants', () => ({ tenantsApi: { create: vi.fn() } }))
vi.mock('@/auth/AuthContext', () => ({ useAuth: vi.fn() }))

const create = vi.mocked(tenantsApi.create)
const hydrate = vi.fn<() => Promise<void>>()
const signOut = vi.fn<() => Promise<void>>()

function LocationProbe() {
  const location = useLocation()
  return (
    <output aria-label="Поточний маршрут">
      {location.pathname + location.search}
    </output>
  )
}

function renderOnboarding() {
  return render(
    <MemoryRouter initialEntries={['/account']}>
      <TenantOnboardingScreen />
      <LocationProbe />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  tenantPreference.clear()
  hydrate.mockResolvedValue()
  signOut.mockResolvedValue()
  vi.mocked(useAuth).mockReturnValue({
    status: 'authenticated',
    user: {
      id: 'user-1',
      phone: '+380501112233',
      displayName: 'Власник',
      role: 'owner',
      isActive: true,
      lastLoginAt: null,
    },
    tenant: null,
    tenants: [],
    hydrate,
    commitTenant: vi.fn(),
    signOut,
  } satisfies AuthContextValue)
})

it('creates the first tenant, hydrates, and enters its dashboard', async () => {
  create.mockResolvedValue({
    tenantId: 'tenant-new',
    name: 'New Yard',
    slug: 'new-yard',
    plan: 'trial',
    planTier: 'pro',
    isActive: true,
  })
  const user = userEvent.setup()
  renderOnboarding()

  await user.type(screen.getByLabelText('Назва розбірки'), 'New Yard')
  await user.type(screen.getByLabelText(/Місто/), 'Львів')
  await user.click(screen.getByRole('button', { name: 'Створити розбірку' }))

  expect(tenantPreference.get()).toBe('tenant-new')
  expect(hydrate).toHaveBeenCalledOnce()
  expect(await screen.findByLabelText('Поточний маршрут')).toHaveTextContent(
    '/app/new-yard/dashboard',
  )
})

it('leaves the protected route before waiting for logout', async () => {
  let finishLogout!: () => void
  signOut.mockReturnValue(
    new Promise<void>((resolve) => {
      finishLogout = resolve
    }),
  )
  const user = userEvent.setup()
  renderOnboarding()

  await user.click(screen.getByRole('button', { name: 'Вийти' }))

  expect(screen.getByLabelText('Поточний маршрут')).toHaveTextContent(/^\/$/)
  finishLogout()
})
