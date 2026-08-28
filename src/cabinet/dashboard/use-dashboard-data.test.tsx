import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dashboardApi } from '@/api/dashboard'
import type {
  DashboardAnalytics,
  DashboardData,
  DashboardPeriod,
} from '@/api/dashboard-contract'
import type { Tenant } from '@/api/types'
import type { TenantAccessSnapshot } from '../access-types'
import { useCabinet, type CabinetContextValue } from '../CabinetContext'
import { tenantRequestScope } from '../tenant-request-scope'
import { tenantResetRegistry } from '../tenant-reset-registry'
import { useDashboardData } from './use-dashboard-data'

/* eslint-disable @typescript-eslint/unbound-method -- Vitest resolves API singleton methods into typed mocks. */

vi.mock('@/api/dashboard', () => ({
  dashboardApi: {
    getSummary: vi.fn(),
    getAnalytics: vi.fn(),
  },
}))
vi.mock('../CabinetContext', () => ({ useCabinet: vi.fn() }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

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

const snapshot = (overrides: Partial<TenantAccessSnapshot> = {}) => ({
  userId: 'user-1',
  tenantId: tenant.id,
  generation: 1,
  role: 'owner',
  permissions: new Set<string>(),
  features: new Set<string>(),
  entitlement: null,
  subscription: null,
  ...overrides,
})

const cabinet = (
  overrides: Partial<CabinetContextValue> = {},
): CabinetContextValue => ({
  status: 'ready',
  targetTenant: tenant,
  snapshot: snapshot(),
  error: null,
  retry: vi.fn(),
  switchTenant: vi.fn(),
  ...overrides,
})

const summary = (userName: string): DashboardData => ({
  userName,
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
})

const analytics = (
  period: DashboardPeriod,
  total: number,
): DashboardAnalytics => ({
  period,
  labels: ['28 сер'],
  revenue: { totals: { UAH: total }, trendPercent: 0, series: [total] },
  partsSold: { total, delta: 0, series: [total] },
  activeOrders: { total, delta: 0, series: [total] },
  topPart: null,
})

const renderData = (period: DashboardPeriod = 'week') =>
  renderHook(({ selectedPeriod }) => useDashboardData(selectedPeriod), {
    initialProps: { selectedPeriod: period },
  })

beforeEach(() => {
  vi.mocked(useCabinet).mockReturnValue(cabinet())
})

afterEach(() => {
  cleanup()
  tenantRequestScope.rotate()
  vi.clearAllMocks()
})

describe('useDashboardData tenant lifecycle', () => {
  it('waits for a ready snapshot and settles summary and analytics independently', async () => {
    const summaryRequest = deferred<DashboardData>()
    const analyticsRequest = deferred<DashboardAnalytics>()
    const analyticsFailure = new Error('analytics unavailable')
    vi.mocked(dashboardApi.getSummary).mockReturnValue(summaryRequest.promise)
    vi.mocked(dashboardApi.getAnalytics).mockReturnValue(
      analyticsRequest.promise,
    )
    vi.mocked(useCabinet).mockReturnValue(
      cabinet({ status: 'loading', snapshot: null, targetTenant: null }),
    )

    const view = renderData()

    expect(dashboardApi.getSummary).not.toHaveBeenCalled()
    expect(dashboardApi.getAnalytics).not.toHaveBeenCalled()

    vi.mocked(useCabinet).mockReturnValue(cabinet())
    view.rerender({ selectedPeriod: 'week' })

    expect(dashboardApi.getSummary).toHaveBeenCalledTimes(1)
    expect(dashboardApi.getAnalytics).toHaveBeenCalledTimes(1)
    expect(vi.mocked(dashboardApi.getAnalytics).mock.calls[0]?.[0]).toBe('week')
    expect(
      vi.mocked(dashboardApi.getAnalytics).mock.calls[0]?.[1]?.signal,
    ).toBeInstanceOf(AbortSignal)

    await act(() => {
      summaryRequest.resolve(summary('Current user'))
      return summaryRequest.promise
    })

    expect(view.result.current.summary).toMatchObject({
      status: 'ready',
      data: { userName: 'Current user' },
    })
    expect(view.result.current.analytics.status).toBe('loading')

    await act(() => {
      analyticsRequest.reject(analyticsFailure)
      return analyticsRequest.promise.catch(() => undefined)
    })

    expect(view.result.current.summary.status).toBe('ready')
    expect(view.result.current.analytics).toMatchObject({
      status: 'error',
      error: { kind: 'unknown', cause: analyticsFailure },
    })
  })

  it('reloads only analytics for a new period and ignores the old period completion', async () => {
    const summaryRequest = deferred<DashboardData>()
    const oldAnalytics = deferred<DashboardAnalytics>()
    const newAnalytics = deferred<DashboardAnalytics>()
    vi.mocked(dashboardApi.getSummary).mockReturnValue(summaryRequest.promise)
    vi.mocked(dashboardApi.getAnalytics)
      .mockReturnValueOnce(oldAnalytics.promise)
      .mockReturnValueOnce(newAnalytics.promise)

    const view = renderData('week')
    const oldSignal = vi.mocked(dashboardApi.getAnalytics).mock.calls[0]?.[1]
      ?.signal

    view.rerender({ selectedPeriod: 'month' })

    expect(dashboardApi.getSummary).toHaveBeenCalledTimes(1)
    expect(dashboardApi.getAnalytics).toHaveBeenCalledTimes(2)
    expect(vi.mocked(dashboardApi.getAnalytics).mock.calls[1]?.[0]).toBe(
      'month',
    )
    expect(
      vi.mocked(dashboardApi.getAnalytics).mock.calls[1]?.[1]?.signal,
    ).toBeInstanceOf(AbortSignal)
    expect(oldSignal?.aborted).toBe(true)

    await act(() => {
      summaryRequest.resolve(summary('Current user'))
      newAnalytics.resolve(analytics('month', 30))
      return Promise.all([summaryRequest.promise, newAnalytics.promise])
    })
    await act(() => {
      oldAnalytics.resolve(analytics('week', 7))
      return oldAnalytics.promise
    })

    expect(view.result.current.summary.data?.userName).toBe('Current user')
    expect(view.result.current.analytics).toMatchObject({
      status: 'ready',
      data: { period: 'month', partsSold: { total: 30 } },
    })
  })

  it('coalesces duplicate refreshes into one summary and analytics flight', async () => {
    vi.mocked(dashboardApi.getSummary).mockResolvedValue(summary('Initial'))
    vi.mocked(dashboardApi.getAnalytics).mockResolvedValue(analytics('week', 1))
    const view = renderData()
    await waitFor(() =>
      expect(view.result.current.analytics.status).toBe('ready'),
    )

    const refreshedSummary = deferred<DashboardData>()
    const refreshedAnalytics = deferred<DashboardAnalytics>()
    vi.mocked(dashboardApi.getSummary).mockReturnValueOnce(
      refreshedSummary.promise,
    )
    vi.mocked(dashboardApi.getAnalytics).mockReturnValueOnce(
      refreshedAnalytics.promise,
    )

    let first!: Promise<void>
    let duplicate!: Promise<void>
    act(() => {
      first = view.result.current.refresh()
      duplicate = view.result.current.refresh()
    })

    expect(duplicate).toBe(first)
    expect(dashboardApi.getSummary).toHaveBeenCalledTimes(2)
    expect(dashboardApi.getAnalytics).toHaveBeenCalledTimes(2)
    expect(view.result.current.refreshing).toBe(true)

    await act(async () => {
      refreshedSummary.resolve(summary('Refreshed'))
      refreshedAnalytics.resolve(analytics('week', 2))
      await first
    })

    expect(view.result.current.refreshing).toBe(false)
    expect(view.result.current.summary.data?.userName).toBe('Refreshed')
    expect(view.result.current.analytics.data?.partsSold.total).toBe(2)
  })

  it('retries only the failed resource requested by the caller', async () => {
    vi.mocked(dashboardApi.getSummary).mockRejectedValueOnce(
      new Error('summary unavailable'),
    )
    vi.mocked(dashboardApi.getAnalytics).mockRejectedValueOnce(
      new Error('analytics unavailable'),
    )
    const view = renderData()
    await waitFor(() =>
      expect(view.result.current.analytics.status).toBe('error'),
    )

    vi.mocked(dashboardApi.getSummary).mockResolvedValueOnce(summary('Retried'))
    await act(async () => view.result.current.retrySummary())

    expect(dashboardApi.getSummary).toHaveBeenCalledTimes(2)
    expect(dashboardApi.getAnalytics).toHaveBeenCalledTimes(1)
    expect(view.result.current.summary.data?.userName).toBe('Retried')
    expect(view.result.current.analytics.status).toBe('error')

    vi.mocked(dashboardApi.getAnalytics).mockResolvedValueOnce(
      analytics('week', 4),
    )
    await act(async () => view.result.current.retryAnalytics())

    expect(dashboardApi.getSummary).toHaveBeenCalledTimes(2)
    expect(dashboardApi.getAnalytics).toHaveBeenCalledTimes(2)
    expect(view.result.current.analytics.data?.partsSold.total).toBe(4)
  })

  it('clears on tenant request rotation and hides a late cancellation', async () => {
    const pendingAnalytics = deferred<DashboardAnalytics>()
    vi.mocked(dashboardApi.getSummary).mockResolvedValue(summary('Loaded'))
    vi.mocked(dashboardApi.getAnalytics).mockReturnValue(
      pendingAnalytics.promise,
    )
    const view = renderData()
    await waitFor(() =>
      expect(view.result.current.summary.status).toBe('ready'),
    )
    const analyticsSignal = vi.mocked(dashboardApi.getAnalytics).mock
      .calls[0]?.[1]?.signal

    act(() => tenantRequestScope.rotate())

    expect(analyticsSignal?.aborted).toBe(true)
    expect(view.result.current.summary).toEqual({
      status: 'loading',
      data: null,
      error: null,
    })

    await act(() => {
      pendingAnalytics.reject(new Error('aborted request'))
      return pendingAnalytics.promise.catch(() => undefined)
    })

    expect(view.result.current.analytics.status).toBe('loading')
  })

  it('ignores unrelated resets but cancels and clears its matching tenant reset', async () => {
    const pendingAnalytics = deferred<DashboardAnalytics>()
    vi.mocked(dashboardApi.getSummary).mockResolvedValue(summary('Loaded'))
    vi.mocked(dashboardApi.getAnalytics).mockReturnValue(
      pendingAnalytics.promise,
    )
    const view = renderData()
    await waitFor(() =>
      expect(view.result.current.summary.status).toBe('ready'),
    )
    const analyticsSignal = vi.mocked(dashboardApi.getAnalytics).mock
      .calls[0]?.[1]?.signal

    await tenantResetRegistry.clear({ userId: 'user-1', tenantId: 'other' })
    expect(analyticsSignal?.aborted).toBe(false)
    expect(view.result.current.summary.status).toBe('ready')

    await act(() =>
      tenantResetRegistry.clear({ userId: 'user-1', tenantId: tenant.id }),
    )

    expect(analyticsSignal?.aborted).toBe(true)
    expect(view.result.current.summary.status).toBe('loading')
  })

  it('cancels on unmount and ignores late completions from the old tenant', async () => {
    const oldSummary = deferred<DashboardData>()
    const oldAnalytics = deferred<DashboardAnalytics>()
    const newSummary = deferred<DashboardData>()
    const newAnalytics = deferred<DashboardAnalytics>()
    vi.mocked(dashboardApi.getSummary)
      .mockReturnValueOnce(oldSummary.promise)
      .mockReturnValueOnce(newSummary.promise)
    vi.mocked(dashboardApi.getAnalytics)
      .mockReturnValueOnce(oldAnalytics.promise)
      .mockReturnValueOnce(newAnalytics.promise)
    const view = renderData()
    const oldSummarySignal = vi.mocked(dashboardApi.getSummary).mock
      .calls[0]?.[0]?.signal

    vi.mocked(useCabinet).mockReturnValue(
      cabinet({
        targetTenant: { ...tenant, id: 'tenant-2', slug: 'new-yard' },
        snapshot: snapshot({ tenantId: 'tenant-2', generation: 2 }),
      }),
    )
    view.rerender({ selectedPeriod: 'week' })

    expect(oldSummarySignal?.aborted).toBe(true)
    await act(() => {
      newSummary.resolve(summary('New tenant'))
      newAnalytics.resolve(analytics('week', 20))
      return Promise.all([newSummary.promise, newAnalytics.promise])
    })
    await act(() => {
      oldSummary.resolve(summary('Old tenant'))
      oldAnalytics.resolve(analytics('week', 10))
      return Promise.all([oldSummary.promise, oldAnalytics.promise])
    })

    expect(view.result.current.summary.data?.userName).toBe('New tenant')
    expect(view.result.current.analytics.data?.partsSold.total).toBe(20)

    const unmountAnalytics = deferred<DashboardAnalytics>()
    vi.mocked(dashboardApi.getAnalytics).mockReturnValueOnce(
      unmountAnalytics.promise,
    )
    act(() => {
      void view.result.current.retryAnalytics()
    })
    const currentAnalyticsSignal = vi.mocked(dashboardApi.getAnalytics).mock
      .calls[2]?.[1]?.signal
    view.unmount()
    expect(currentAnalyticsSignal?.aborted).toBe(true)

    await expect(
      tenantResetRegistry.clear({ userId: 'user-1', tenantId: 'tenant-2' }),
    ).resolves.toBeUndefined()
  })
})
