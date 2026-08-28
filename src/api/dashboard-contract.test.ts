import { describe, expect, it } from 'vitest'
import {
  DashboardContractError,
  parseDashboardAnalytics,
  parseDashboardData,
} from './dashboard-contract'

const ownerDashboard = {
  userName: 'Olena Owner',
  role: 'owner',
  yardName: 'Rozbirka Kyiv',
  yardCity: 'Kyiv',
  isYardEmpty: false,
  todaySalesCount: 3,
  availablePartsCount: 42,
  intakesCount: 7,
  revenue: {
    today: [{ currency: 'UAH', amount: 1200 }],
    week: [{ currency: 'USD', amount: 85.5 }],
    month: [{ currency: 'EUR', amount: 300 }],
  },
  todayNewPartsCount: 5,
  lastActivity: {
    type: 'part_sold',
    userName: 'Olena Owner',
    timestamp: '2026-08-28T09:30:00.000Z',
  },
  activeCarsCount: 12,
  outOfStockPartsCount: 4,
  customersCount: 24,
  totalBalanceUah: 3500.75,
  teamMembersCount: 6,
  totalInvested: 10000,
  totalRecouped: 6500,
  carsInWork: 3,
  totalPartsSold: 99,
  myPartsToday: 2,
  lastMyActivity: {
    type: 'part_added',
    userName: 'Olena Owner',
    timestamp: '2026-08-28T08:15:00.000Z',
  },
  additiveField: 'ignore this',
}

const masterDashboard = {
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
  period: 'week',
  labels: ['Mon', 'Tue', 'Wed'],
  revenue: {
    totals: { UAH: 1200, USD: 20 },
    trendPercent: 12.5,
    series: [100, 400, 700],
  },
  partsSold: {
    total: 8,
    delta: 2,
    series: [1, 3, 4],
  },
  activeOrders: {
    total: 5,
    delta: -1,
    series: [3, 2, 5],
  },
  topPart: {
    id: 'd01593a6-9a4a-4a9c-a5ce-a7ec2ecf03e1',
    name: 'Front bumper',
    photoUrl: null,
    revenueUsd: 250.5,
    salesCount: 4,
    salesSeries: [1, 1, 2],
  },
  additiveField: true,
}

const clone = <T>(value: T): T => structuredClone(value)

describe('parseDashboardData', () => {
  it('returns the documented owner data and ignores unknown additive fields', () => {
    expect(parseDashboardData(ownerDashboard)).toEqual({
      userName: 'Olena Owner',
      role: 'owner',
      yardName: 'Rozbirka Kyiv',
      yardCity: 'Kyiv',
      isYardEmpty: false,
      todaySalesCount: 3,
      availablePartsCount: 42,
      intakesCount: 7,
      revenue: {
        today: [{ currency: 'UAH', amount: 1200 }],
        week: [{ currency: 'USD', amount: 85.5 }],
        month: [{ currency: 'EUR', amount: 300 }],
      },
      todayNewPartsCount: 5,
      lastActivity: {
        type: 'part_sold',
        userName: 'Olena Owner',
        timestamp: '2026-08-28T09:30:00.000Z',
      },
      activeCarsCount: 12,
      outOfStockPartsCount: 4,
      customersCount: 24,
      totalBalanceUah: 3500.75,
      teamMembersCount: 6,
      totalInvested: 10000,
      totalRecouped: 6500,
      carsInWork: 3,
      totalPartsSold: 99,
      myPartsToday: 2,
      lastMyActivity: {
        type: 'part_added',
        userName: 'Olena Owner',
        timestamp: '2026-08-28T08:15:00.000Z',
      },
    })
  })

  it('preserves nullable master fields as null', () => {
    expect(parseDashboardData(masterDashboard)).toEqual(masterDashboard)
  })

  it('rejects dashboard data missing a required string', () => {
    const payload = clone(ownerDashboard)
    delete (payload as { userName?: string }).userName

    expect(() => parseDashboardData(payload)).toThrow(DashboardContractError)
  })

  it.each([NaN, Infinity])(
    'rejects non-finite dashboard numbers (%s)',
    (todaySalesCount) => {
      const payload = { ...ownerDashboard, todaySalesCount }

      expect(() => parseDashboardData(payload)).toThrow(DashboardContractError)
    },
  )

  it('rejects an invalid activity timestamp without exposing the response', () => {
    const payload = {
      ...ownerDashboard,
      lastActivity: {
        ...ownerDashboard.lastActivity,
        timestamp: 'not-a-timestamp',
      },
    }

    expect(() => parseDashboardData(payload)).toThrowError(
      'Invalid dashboard response',
    )
  })

  it('rejects a date-only activity timestamp where Core requires date-time', () => {
    expect(() =>
      parseDashboardData({
        ...ownerDashboard,
        lastActivity: {
          ...ownerDashboard.lastActivity,
          timestamp: '2026-08-28',
        },
      }),
    ).toThrow(DashboardContractError)
  })

  it('rejects an activity timestamp with an impossible calendar date', () => {
    expect(() =>
      parseDashboardData({
        ...ownerDashboard,
        lastActivity: {
          ...ownerDashboard.lastActivity,
          timestamp: '2026-02-30T09:30:00.000Z',
        },
      }),
    ).toThrow(DashboardContractError)
  })
})

describe('parseDashboardAnalytics', () => {
  it('returns documented analytics data and ignores unknown additive fields', () => {
    expect(parseDashboardAnalytics(analytics)).toEqual({
      period: 'week',
      labels: ['Mon', 'Tue', 'Wed'],
      revenue: {
        totals: { UAH: 1200, USD: 20 },
        trendPercent: 12.5,
        series: [100, 400, 700],
      },
      partsSold: {
        total: 8,
        delta: 2,
        series: [1, 3, 4],
      },
      activeOrders: {
        total: 5,
        delta: -1,
        series: [3, 2, 5],
      },
      topPart: {
        id: 'd01593a6-9a4a-4a9c-a5ce-a7ec2ecf03e1',
        name: 'Front bumper',
        photoUrl: null,
        revenueUsd: 250.5,
        salesCount: 4,
        salesSeries: [1, 1, 2],
      },
    })
  })

  it('rejects an unsupported analytics period', () => {
    expect(() =>
      parseDashboardAnalytics({ ...analytics, period: 'quarter' }),
    ).toThrow(DashboardContractError)
  })

  it('rejects analytics series whose length differs from the labels', () => {
    expect(() =>
      parseDashboardAnalytics({
        ...analytics,
        revenue: { ...analytics.revenue, series: [100, 400] },
      }),
    ).toThrow(DashboardContractError)
  })

  it('rejects a partial top part', () => {
    expect(() =>
      parseDashboardAnalytics({
        ...analytics,
        topPart: { id: analytics.topPart.id },
      }),
    ).toThrow(DashboardContractError)
  })
})
