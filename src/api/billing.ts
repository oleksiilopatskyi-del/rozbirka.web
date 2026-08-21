import { apiClient, publicApiClient } from './client'
import type { RequestOptions } from './contracts'
import type {
  CancelRequest,
  CheckoutResponse,
  PagedResult,
  PaymentDto,
  PublicPlanDto,
  SubscribeRequest,
  SubscriptionDto,
} from './types'

const requestConfig = (options: RequestOptions) =>
  options.signal ? { signal: options.signal } : {}

export const billingApi = {
  /**
   * Current billing state — source of truth for UI.
   * Call on app boot and after mutations that affect usage or subscription state.
   */
  async getSubscription(
    options: RequestOptions = {},
  ): Promise<SubscriptionDto> {
    const resp = await apiClient.get<SubscriptionDto>(
      '/billing/subscription',
      requestConfig(options),
    )
    return resp.data
  },

  /**
   * Public plan catalog. Auth optional (pricing page).
   */
  async getPlans(options: RequestOptions = {}): Promise<PublicPlanDto[]> {
    const resp = await publicApiClient.get<PublicPlanDto[]>(
      '/billing/plans',
      requestConfig(options),
    )
    return resp.data
  },

  /**
   * Start Mono checkout. Returns hosted URL — caller must redirect user there.
   * Pass `planCode` (from /billing/plans) to choose a specific tier; omit to
   * use backend default (Pro).
   */
  async subscribe(
    req?: SubscribeRequest,
    options: RequestOptions = {},
  ): Promise<CheckoutResponse> {
    const resp = await apiClient.post<CheckoutResponse>(
      '/billing/subscribe',
      req ?? {},
      requestConfig(options),
    )
    return resp.data
  },

  async cancel(
    req?: CancelRequest,
    options: RequestOptions = {},
  ): Promise<void> {
    await apiClient.post('/billing/cancel', req ?? {}, requestConfig(options))
  },

  async getPayments(
    page = 1,
    pageSize = 20,
    options: RequestOptions = {},
  ): Promise<PagedResult<PaymentDto>> {
    const resp = await apiClient.get<PagedResult<PaymentDto>>(
      '/billing/payments',
      { params: { page, pageSize }, ...requestConfig(options) },
    )
    return resp.data
  },

  /**
   * Cancel a pending checkout the user no longer wants to complete.
   * Backend: 404 if not the tenant's payment, 409 if status != pending.
   */
  async cancelPayment(
    paymentId: string,
    options: RequestOptions = {},
  ): Promise<void> {
    await apiClient.post(
      `/billing/payments/${paymentId}/cancel`,
      undefined,
      requestConfig(options),
    )
  },
}
