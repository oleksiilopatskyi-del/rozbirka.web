import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { useAuth, type AuthContextValue } from '@/auth/AuthContext'
import { AccountScreen } from './account'

vi.mock('@/auth/AuthContext', () => ({ useAuth: vi.fn() }))

const tenant = {
  id: 'tenant-1',
  name: 'Koval Auto',
  slug: 'koval',
  plan: 'active' as const,
  planTier: 'pro',
  city: 'Київ',
  logoUrl: null,
  isActive: true,
  createdAt: '2026-08-01T10:00:00Z',
  roleName: 'owner',
}

function LocationProbe() {
  const location = useLocation()
  return (
    <output aria-label="Поточний маршрут">
      {location.pathname + location.search}
    </output>
  )
}

function renderAccount(path = '/account') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/account" element={<AccountScreen />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
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
    tenant,
    tenants: [tenant],
    hydrate: vi.fn(),
    commitTenant: vi.fn(),
    updateName: vi.fn(),
    signOut: vi.fn(),
  } satisfies AuthContextValue)
})

it('redirects an authenticated account visit to the selected tenant dashboard', async () => {
  renderAccount()

  expect(await screen.findByLabelText('Поточний маршрут')).toHaveTextContent(
    '/app/koval/dashboard',
  )
})

it('preserves the selected plan in the billing plans route', async () => {
  renderAccount('/account?section=plans&plan=pro_monthly')

  expect(await screen.findByLabelText('Поточний маршрут')).toHaveTextContent(
    '/app/koval/settings/billing/plans?plan=pro_monthly',
  )
})

it('retains a safe scan intent on the selected tenant dashboard', async () => {
  renderAccount('/account?scan=QR-123~part')

  expect(await screen.findByLabelText('Поточний маршрут')).toHaveTextContent(
    '/app/koval/dashboard?scan=QR-123~part',
  )
})

it('never shows first-tenant onboarding when a tenant already exists', async () => {
  const current = vi.mocked(useAuth)()
  vi.mocked(useAuth).mockReturnValue({ ...current, tenant: null })

  renderAccount()

  expect(await screen.findByLabelText('Поточний маршрут')).toHaveTextContent(
    '/app/koval/dashboard',
  )
  expect(screen.queryByText('Перший крок')).toBeNull()
})

it('renders first-tenant onboarding for an authenticated user with no tenants', () => {
  const current = vi.mocked(useAuth)()
  vi.mocked(useAuth).mockReturnValue({
    ...current,
    tenant: null,
    tenants: [],
  })

  renderAccount()

  expect(screen.getByRole('heading', { name: /Створіть/ })).toBeInTheDocument()
  expect(screen.getByLabelText('Назва розбірки')).toBeInTheDocument()
  expect(screen.queryByLabelText('Поточний маршрут')).toBeNull()
})
