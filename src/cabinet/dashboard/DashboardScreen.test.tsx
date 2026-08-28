import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Tenant } from '@/api/types'
import type { TenantAccessSnapshot } from '../access-types'
import { useCabinet, type CabinetContextValue } from '../CabinetContext'
import { DashboardScreen } from './DashboardScreen'
import { useDashboardData, type DashboardDataState } from './use-dashboard-data'

vi.mock('../CabinetContext', () => ({ useCabinet: vi.fn() }))
vi.mock('./use-dashboard-data', () => ({ useDashboardData: vi.fn() }))

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
  vi.mocked(useDashboardData).mockReturnValue({
    summary: { status: 'loading', data: null, error: null },
    analytics: { status: 'loading', data: null, error: null },
    refreshing: false,
    refresh: vi.fn(),
    retrySummary: vi.fn(),
    retryAnalytics: vi.fn(),
  } satisfies DashboardDataState)
})

it('keeps the ready summary mounted when analytics fails and retries analytics only', async () => {
  const user = userEvent.setup()
  const retryAnalytics = vi.fn().mockResolvedValue(undefined)
  vi.mocked(useDashboardData).mockReturnValue({
    summary: {
      status: 'ready',
      data: {
        userName: 'Maksym',
        role: 'owner',
        yardName: 'Koval Auto',
        yardCity: 'Київ',
        isYardEmpty: false,
        todaySalesCount: 2,
        availablePartsCount: 10,
        intakesCount: 1,
        revenue: null,
        todayNewPartsCount: 1,
        lastActivity: null,
        activeCarsCount: 3,
        outOfStockPartsCount: 0,
        customersCount: 4,
        totalBalanceUah: 500,
        teamMembersCount: 2,
        totalInvested: 100,
        totalRecouped: 50,
        carsInWork: 3,
        totalPartsSold: 6,
        myPartsToday: 1,
        lastMyActivity: null,
      },
      error: null,
    },
    analytics: {
      status: 'error',
      data: null,
      error: { kind: 'network', message: 'Немає з’єднання з мережею.' },
    },
    refreshing: false,
    refresh: vi.fn(),
    retrySummary: vi.fn(),
    retryAnalytics,
  })

  renderDashboard(['/app/koval/dashboard?period=month'])

  expect(screen.getByRole('region', { name: 'Зведення' })).toHaveTextContent(
    'Продажів сьогодні',
  )
  expect(screen.getByRole('alert', { name: 'Аналітика' })).toHaveTextContent(
    'Не вдалося завантажити аналітику',
  )
  await user.click(screen.getByRole('button', { name: 'Спробувати ще раз' }))
  expect(retryAnalytics).toHaveBeenCalledOnce()
  expect(useDashboardData).toHaveBeenCalledWith('month')
})

it('retries only failed summary data and marks refresh as busy', async () => {
  const user = userEvent.setup()
  const retrySummary = vi.fn()
  const refresh = vi.fn()
  vi.mocked(useDashboardData).mockReturnValue({
    summary: {
      status: 'error',
      data: null,
      error: { kind: 'network', message: 'Немає з’єднання з мережею.' },
    },
    analytics: {
      status: 'ready',
      data: {
        period: 'week',
        labels: [],
        revenue: { totals: {}, trendPercent: 0, series: [] },
        partsSold: { total: 0, delta: 0, series: [] },
        activeOrders: { total: 0, delta: 0, series: [] },
        topPart: null,
      },
      error: null,
    },
    refreshing: true,
    refresh,
    retrySummary,
    retryAnalytics: vi.fn(),
  })

  renderDashboard(['/app/koval/dashboard'])

  await user.click(screen.getByRole('button', { name: 'Спробувати ще раз' }))
  expect(retrySummary).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: 'Оновлюємо…' })).toBeDisabled()
  expect(
    screen.getByRole('region', { name: 'Панель зведення' }),
  ).toHaveAttribute('aria-busy', 'true')
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

it('shows released account destinations after analytics from the full module registry', () => {
  renderDashboard(['/app/koval/dashboard'])

  const profile = screen.getByRole('link', { name: 'Профіль' })
  expect(profile).toHaveAttribute('href', '/app/koval/settings/profile')
  expect(
    screen.queryByRole('region', { name: 'Підготовка робочих модулів' }),
  ).not.toBeInTheDocument()

  const analytics = screen.getByRole('region', { name: 'Аналітика' })
  expect(
    analytics.compareDocumentPosition(profile) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0)
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
