import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, describe, expect, it } from 'vitest'
import { billingApi, type ProviderAwareSubscriptionDto } from './billing'
import { apiClient, publicApiClient } from './client'

function response(
  config: InternalAxiosRequestConfig,
): AxiosResponse<{ data: never[] }> {
  return {
    data: { data: [] },
    status: 200,
    statusText: 'OK',
    headers: new AxiosHeaders(),
    config,
  }
}

const originalApiAdapter = apiClient.defaults.adapter!
const originalPublicAdapter = publicApiClient.defaults.adapter!

afterEach(() => {
  apiClient.defaults.adapter = originalApiAdapter
  publicApiClient.defaults.adapter = originalPublicAdapter
})

describe('billingApi', () => {
  it('does not expose manual trial activation', () => {
    expect(billingApi).not.toHaveProperty('activateTrial')
  })

  it('forwards AbortSignal through every request config', async () => {
    const controller = new AbortController()
    const observed: AbortSignal[] = []
    const adapter = (config: InternalAxiosRequestConfig) => {
      observed.push(config.signal as AbortSignal)
      return Promise.resolve(response(config))
    }
    apiClient.defaults.adapter = adapter
    publicApiClient.defaults.adapter = adapter

    await billingApi.getSubscription({ signal: controller.signal })
    await billingApi.getPlans({ signal: controller.signal })
    await billingApi.subscribe(undefined, { signal: controller.signal })
    await billingApi.cancel(undefined, { signal: controller.signal })
    await billingApi.getPayments(1, 20, { signal: controller.signal })
    await billingApi.cancelPayment('payment-1', { signal: controller.signal })

    expect(observed).toHaveLength(6)
    expect(observed.every((signal) => !signal.aborted)).toBe(true)

    controller.abort()

    expect(observed.every((signal) => signal.aborted)).toBe(true)
  })

  it('preserves the authoritative provider source and management destination', async () => {
    const subscription: ProviderAwareSubscriptionDto = {
      state: 'active',
      planCode: 'pro_monthly',
      planName: 'Pro',
      trialEndsAt: null,
      trialDaysRemaining: null,
      currentPeriodEnd: '2026-09-01T00:00:00Z',
      nextChargeAt: '2026-09-01T00:00:00Z',
      amount: 29,
      currency: 'USD',
      cardLast4: null,
      cardBrand: null,
      canSubscribe: false,
      canCancel: false,
      canReactivate: false,
      canActivateTrial: false,
      usage: {
        cars: { used: 0, max: 10 },
        intakes: { used: 0, max: 10 },
        parts: { used: 0, max: 10 },
        users: { used: 0, max: 10 },
        cashRegisters: { used: 0, max: 10 },
      },
      features: [],
      source: 'apple_iap',
      manageVia: 'apple',
    }
    apiClient.defaults.adapter = (config) =>
      Promise.resolve({ ...response(config), data: { data: subscription } })

    await expect(billingApi.getSubscription()).resolves.toMatchObject({
      source: 'apple_iap',
      manageVia: 'apple',
    })
  })
})
