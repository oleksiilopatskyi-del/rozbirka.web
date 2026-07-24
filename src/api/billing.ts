import { apiClient } from './client'
import type {
  CancelRequest,
  CheckoutResponse,
  PagedResult,
  PaymentDto,
  PublicPlanDto,
  SubscribeRequest,
  SubscriptionDto,
} from './types'

export const billingApi = {
  /**
   * Current billing state — source of truth for UI.
   * Call on app boot and after mutations that affect usage or subscription state.
   */
  async getSubscription(): Promise<SubscriptionDto> {
    const resp = await apiClient.get<SubscriptionDto>('/billing/subscription')
    return resp.data
  },

  /**
   * Public plan catalog. Auth optional (pricing page).
   */
  async getPlans(): Promise<PublicPlanDto[]> {
    const resp = await apiClient.get<PublicPlanDto[]>('/billing/plans')
    return resp.data
  },

  /**
   * Start Mono checkout. Returns hosted URL — caller must redirect user there.
   * Pass `planCode` (from /billing/plans) to choose a specific tier; omit to
   * use backend default (Pro).
   */
  async subscribe(req?: SubscribeRequest): Promise<CheckoutResponse> {
    const resp = await apiClient.post<CheckoutResponse>(
      '/billing/subscribe',
      req ?? {},
    )
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

  /**
   * Cancel a pending checkout the user no longer wants to complete.
   * Backend: 404 if not the tenant's payment, 409 if status != pending.
   */
  async cancelPayment(paymentId: string): Promise<void> {
    await apiClient.post(`/billing/payments/${paymentId}/cancel`)
  },
}
