import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Tenant } from '../api/types'
import type { AuthContextValue } from '../auth/AuthContext'
import { useAuth } from '../auth/AuthContext'
import type { TenantAccessSnapshot } from './access-types'
import type { CabinetContextValue } from './CabinetContext'
import { useCabinet } from './CabinetContext'
import { CabinetShell } from './CabinetShell'
import { CabinetHomeScreen } from './screens/cabinet-home'
import cabinetStyles from '../index.css?inline'

vi.mock('../auth/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('./CabinetContext', () => ({ useCabinet: vi.fn() }))

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

const snapshot: TenantAccessSnapshot = {
  userId: 'user-1',
  tenantId: tenant.id,
  generation: 1,
  role: 'owner',
  permissions: new Set(['billing.view']),
  features: new Set(),
  entitlement: null,
  subscription: null,
}

const signOut = vi.fn<() => Promise<void>>()

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="Поточний маршрут">{location.pathname}</output>
}

beforeEach(() => {
  signOut.mockReset()
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
    tenant,
    tenants: [tenant],
    hydrate: vi.fn(),
    commitTenant: vi.fn(),
    updateName: vi.fn(),
    signOut,
  } satisfies AuthContextValue)
  vi.mocked(useCabinet).mockReturnValue({
    status: 'ready',
    targetTenant: tenant,
    snapshot,
    error: null,
    retry: vi.fn(),
    switchTenant: vi.fn(),
  } satisfies CabinetContextValue)
})

it('navigates home before awaiting cabinet logout', async () => {
  let finishLogout!: () => void
  signOut.mockReturnValue(
    new Promise<void>((resolve) => {
      finishLogout = resolve
    }),
  )
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/koval/dashboard']}>
      <Routes>
        <Route path="/app/:tenant" element={<CabinetShell />}>
          <Route path="dashboard" element={<p>Вміст модуля</p>} />
        </Route>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )

  await user.click(screen.getAllByRole('button', { name: 'Вийти' })[0]!)

  expect(screen.getByLabelText('Поточний маршрут')).toHaveTextContent(/^\/$/)
  expect(signOut).toHaveBeenCalledOnce()
  finishLogout()
})

it('renders nested cabinet content in a responsive overflow-safe shell', () => {
  const style = document.createElement('style')
  style.dataset['testCabinetShellStyles'] = 'true'
  style.textContent = Array.from(
    cabinetStyles.matchAll(/\.cabinet-shell(?![_a-zA-Z0-9-])[^{}]*\{[^{}]*\}/g),
    ([rule]) => rule,
  ).join('\n')
  document.head.append(style)

  try {
    render(
      <MemoryRouter initialEntries={['/app/koval/dashboard']}>
        <Routes>
          <Route path="/app/:tenant" element={<CabinetShell />}>
            <Route path="dashboard" element={<p>Вміст модуля</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('main')).toHaveClass('min-w-0')
    expect(screen.getByText('Вміст модуля')).toBeVisible()
    const shell = screen.getByRole('main').parentElement
    expect(shell).not.toBeNull()
    expect(getComputedStyle(shell!).overflowX).not.toMatch(/clip|hidden/)
    expect(screen.getByLabelText('rozbirka — на головну')).toHaveAttribute(
      'href',
      '/app/koval/dashboard',
    )
  } finally {
    style.remove()
  }
})

it('renders the minimal tenant dashboard home', () => {
  render(<CabinetHomeScreen />)

  expect(
    screen.getByRole('heading', { name: 'Вітаємо в Koval Auto' }),
  ).toBeVisible()
  expect(screen.getByText('Ваш робочий простір готовий.')).toBeVisible()
})
