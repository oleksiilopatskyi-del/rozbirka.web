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

export type BillingSource = 'mono' | 'apple_iap' | 'google_play' | null
export type BillingManageVia = 'web' | 'apple' | 'google' | null
export type ProviderAwareSubscriptionDto = SubscriptionDto & {
  source: BillingSource
  manageVia: BillingManageVia
}

export type ProviderManagement =
  | { kind: 'mono' }
  | { kind: 'provider'; label: string; url: string }
  | { kind: 'unavailable' }

export function resolveProviderManagement(
  subscription: Pick<ProviderAwareSubscriptionDto, 'source' | 'manageVia'>,
): ProviderManagement {
  if (subscription.source === 'mono' && subscription.manageVia === 'web') {
    return { kind: 'mono' }
  }
  if (
    subscription.source === 'apple_iap' &&
    subscription.manageVia === 'apple'
  ) {
    return {
      kind: 'provider',
      label: 'App Store',
      url: 'https://apps.apple.com/account/subscriptions',
    }
  }
  if (
    subscription.source === 'google_play' &&
    subscription.manageVia === 'google'
  ) {
    return {
      kind: 'provider',
      label: 'Google Play',
      url: 'https://play.google.com/store/account/subscriptions',
    }
  }
  return { kind: 'unavailable' }
}

const requestConfig = (options: RequestOptions) =>
  options.signal ? { signal: options.signal } : {}

export const billingApi = {
  /**
   * Current billing state — source of truth for UI.
   * Call on app boot and after mutations that affect usage or subscription state.
   */
  async getSubscription(
    options: RequestOptions = {},
  ): Promise<ProviderAwareSubscriptionDto> {
    const resp = await apiClient.get<ProviderAwareSubscriptionDto>(
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
