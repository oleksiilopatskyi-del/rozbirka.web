import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { DashboardContractError } from './dashboard-contract'
import { dashboardApi } from './dashboard'

const dashboard = {
  userName: 'Maksym Master',
  role: 'master',
  yardName: 'Rozbirka Lviv',
  yardCity: null,
  isYardEmpty: true,
  todaySalesCount: 0,
  availablePartsCount: 0,
  intakesCount: 0,
  revenue: null,
  todayNewPartsCount: null,
  lastActivity: null,
  activeCarsCount: null,
  outOfStockPartsCount: null,
  customersCount: null,
  totalBalanceUah: null,
  teamMembersCount: null,
  totalInvested: null,
  totalRecouped: null,
  carsInWork: null,
  totalPartsSold: null,
  myPartsToday: null,
  lastMyActivity: null,
}

const analytics = {
  period: 'month',
  labels: ['Aug'],
  revenue: { totals: { UAH: 1200 }, trendPercent: 5, series: [1200] },
  partsSold: { total: 3, delta: 1, series: [3] },
  activeOrders: { total: 2, delta: 0, series: [2] },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('dashboardApi', () => {
  it('forwards the caller signal to the summary endpoint and returns validated data', async () => {
    const signal = new AbortController().signal
    const get = vi
      .spyOn(apiClient, 'get')
      .mockResolvedValue({ data: dashboard })

    await expect(dashboardApi.getSummary({ signal })).resolves.toMatchObject({
      userName: 'Maksym Master',
      totalBalanceUah: null,
    })

    expect(get).toHaveBeenCalledWith('/dashboard', { signal })
  })

  it('forwards the selected analytics period and caller signal to the analytics endpoint', async () => {
    const signal = new AbortController().signal
    const get = vi
      .spyOn(apiClient, 'get')
      .mockResolvedValue({ data: analytics })

    await expect(
      dashboardApi.getAnalytics('month', { signal }),
    ).resolves.toMatchObject({
      period: 'month',
      topPart: null,
    })

    expect(get).toHaveBeenCalledWith('/dashboard/analytics', {
      params: { period: 'month' },
      signal,
    })
  })

  it('rejects malformed successful dashboard data', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { userName: 'Maksym Master' },
    })

    await expect(dashboardApi.getSummary()).rejects.toBeInstanceOf(
      DashboardContractError,
    )
  })

  it('rejects malformed successful analytics data', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        ...analytics,
        revenue: { ...analytics.revenue, series: [] },
      },
    })

    await expect(dashboardApi.getAnalytics('month')).rejects.toBeInstanceOf(
      DashboardContractError,
    )
  })

  it('rejects valid analytics for a period other than the requested period', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { ...analytics, period: 'day' },
    })

    await expect(dashboardApi.getAnalytics('month')).rejects.toMatchObject({
      name: 'DashboardContractError',
      message: 'Invalid dashboard response',
    })
  })
})
