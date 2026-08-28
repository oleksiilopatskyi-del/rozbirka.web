import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Tenant } from '@/api/types'
import type { TenantAccessSnapshot } from '../access-types'
import { useCabinet, type CabinetContextValue } from '../CabinetContext'
import { DashboardScreen } from './DashboardScreen'

vi.mock('../CabinetContext', () => ({ useCabinet: vi.fn() }))

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
  permissions: new Set(),
  features: new Set(),
  entitlement: null,
  subscription: null,
}

function LocationProbe() {
  const location = useLocation()
  return (
    <output aria-label="Поточний маршрут">{`${location.pathname}${location.search}`}</output>
  )
}

function renderDashboard(initialEntries: string[]) {
  const router = createMemoryRouter(
    [
      {
        path: '/app/:tenant/dashboard',
        element: (
          <>
            <DashboardScreen />
            <LocationProbe />
          </>
        ),
      },
    ],
    { initialEntries },
  )
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  vi.mocked(useCabinet).mockReturnValue({
    status: 'ready',
    targetTenant: tenant,
    snapshot,
    error: null,
    retry: vi.fn(),
    switchTenant: vi.fn(),
  } satisfies CabinetContextValue)
})

it('uses week for a missing period without changing the URL', () => {
  renderDashboard(['/app/koval/dashboard?scan=QR-123~part'])

  expect(screen.getByRole('button', { name: 'Тиждень' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.getByLabelText('Поточний маршрут')).toHaveTextContent(
    '/app/koval/dashboard?scan=QR-123~part',
  )
})

it.each(['period=year', 'period=day&period=month'])(
  'replaces %s with one week period while preserving scan',
  async (period) => {
    renderDashboard([`/app/koval/dashboard?scan=QR-123~part&${period}`])

    expect(await screen.findByLabelText('Поточний маршрут')).toHaveTextContent(
      '/app/koval/dashboard?scan=QR-123%7Epart&period=week',
    )
  },
)

it('pushes selected periods and keeps tenant, scan, and browser-back state', async () => {
  const user = userEvent.setup()
  const router = renderDashboard(['/app/koval/dashboard?scan=QR-123~part'])

  await user.click(screen.getByRole('button', { name: 'День' }))
  expect(screen.getByLabelText('Поточний маршрут')).toHaveTextContent(
    '/app/koval/dashboard?scan=QR-123%7Epart&period=day',
  )

  await user.click(screen.getByRole('button', { name: 'Місяць' }))
  expect(screen.getByLabelText('Поточний маршрут')).toHaveTextContent(
    '/app/koval/dashboard?scan=QR-123%7Epart&period=month',
  )

  await act(() => router.navigate(-1))
  expect(screen.getByLabelText('Поточний маршрут')).toHaveTextContent(
    '/app/koval/dashboard?scan=QR-123%7Epart&period=day',
  )
})
