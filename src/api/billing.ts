import { apiClient } from './client'
import type {
  CancelRequest,
  CheckoutResponse,
  PagedResult,
  PaymentDto,
  SubscriptionDto,
} from './types'

export const billingApi = {
  async getSubscription(): Promise<SubscriptionDto> {
    const resp = await apiClient.get<SubscriptionDto>('/billing/subscription')
    return resp.data
  },

  async subscribe(): Promise<CheckoutResponse> {
    const resp = await apiClient.post<CheckoutResponse>('/billing/subscribe')
    return resp.data
  },

  async cancel(req?: CancelRequest): Promise<void> {
    await apiClient.post('/billing/cancel', req ?? {})
  },

  async getPayments(page = 1, pageSize = 20): Promise<PagedResult<PaymentDto>> {
    const resp = await apiClient.get<PagedResult<PaymentDto>>(
      '/billing/payments',
      { params: { page, pageSize } },
    )
    return resp.data
  },
}
