import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, describe, expect, it } from 'vitest'
import { billingApi } from './billing'
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
})
