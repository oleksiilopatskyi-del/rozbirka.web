import { apiClient } from './client'
import type { RequestOptions } from './contracts'
import {
  parseDashboardAnalytics,
  parseDashboardData,
  type DashboardAnalytics,
  type DashboardData,
  type DashboardPeriod,
} from './dashboard-contract'

const requestConfig = (options: RequestOptions) =>
  options.signal ? { signal: options.signal } : {}

export const dashboardApi = {
  async getSummary(options: RequestOptions = {}): Promise<DashboardData> {
    const response = await apiClient.get<unknown>(
      '/dashboard',
      requestConfig(options),
    )
    return parseDashboardData(response.data)
  },

  async getAnalytics(
    period: DashboardPeriod,
    options: RequestOptions = {},
  ): Promise<DashboardAnalytics> {
    const response = await apiClient.get<unknown>('/dashboard/analytics', {
      params: { period },
      ...requestConfig(options),
    })
    return parseDashboardAnalytics(response.data)
  },
}
