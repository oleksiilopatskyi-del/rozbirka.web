import {
  DASHBOARD_PERIODS,
  type DashboardPeriod,
} from '@/api/dashboard-contract'

export interface DashboardPeriodSelection {
  period: DashboardPeriod
  normalize: boolean
}

export function readDashboardPeriod(
  searchParams: URLSearchParams,
): DashboardPeriodSelection {
  const periods = searchParams.getAll('period')

  if (periods.length === 0) return { period: 'week', normalize: false }

  const [period] = periods
  if (
    periods.length === 1 &&
    DASHBOARD_PERIODS.includes(period as DashboardPeriod)
  ) {
    return { period: period as DashboardPeriod, normalize: false }
  }

  return { period: 'week', normalize: true }
}

export function writeDashboardPeriod(
  searchParams: URLSearchParams,
  period: DashboardPeriod,
): URLSearchParams {
  const next = new URLSearchParams(searchParams)
  next.delete('period')
  next.set('period', period)
  return next
}
