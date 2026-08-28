import {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, describe, expect, it } from 'vitest'
import { apiClient, publicApiClient } from './client'
import { invitationsApi } from './invitations'

const originalApiAdapter = apiClient.defaults.adapter!
const originalPublicAdapter = publicApiClient.defaults.adapter!

afterEach(() => {
  apiClient.defaults.adapter = originalApiAdapter
  publicApiClient.defaults.adapter = originalPublicAdapter
})

function response<T>(
  config: InternalAxiosRequestConfig,
  data: T,
): AxiosResponse<{ data: T }> {
  return {
    data: { data },
    status: 200,
    statusText: 'OK',
    headers: new AxiosHeaders(),
    config,
  }
}

describe('invitationsApi', () => {
  it('loads public information without authenticated client headers and forwards cancellation', async () => {
    const controller = new AbortController()
    let publicRequest: InternalAxiosRequestConfig | undefined
    apiClient.defaults.adapter = () => {
      throw new Error('authenticated client must not load invitation info')
    }
    publicApiClient.defaults.adapter = (config) => {
      publicRequest = config
      return Promise.resolve(
        response(config, {
          tenantName: 'Garage',
          roleName: 'Manager',
          createdByName: 'Олена',
          expiresAt: '2026-09-01T00:00:00Z',
          isValid: true,
        }),
      )
    }

    await expect(
      invitationsApi.info('AB/CD', { signal: controller.signal }),
    ).resolves.toMatchObject({ tenantName: 'Garage' })

    expect(publicRequest?.url).toBe('/invitations/AB%2FCD/info')
    expect(publicRequest?.signal).toBe(controller.signal)
    expect(publicRequest?.headers.get('Authorization')).toBeUndefined()
    expect(publicRequest?.headers.get('X-Tenant-Id')).toBeUndefined()
  })

  it('accepts through the authenticated client and forwards cancellation', async () => {
    const controller = new AbortController()
    let authenticatedRequest: InternalAxiosRequestConfig | undefined
    let authenticatedSignal: AbortSignal | undefined
    publicApiClient.defaults.adapter = () => {
      throw new Error('public client must not accept invitations')
    }
    apiClient.defaults.adapter = (config) => {
      authenticatedRequest = config
      authenticatedSignal = config.signal as AbortSignal | undefined
      return Promise.resolve(
        response(config, {
          tenantId: 'tenant-2',
          tenantName: 'Garage',
          role: 'manager',
          permissions: ['cars.view'],
        }),
      )
    }

    await expect(
      invitationsApi.accept('ABCD1234', { signal: controller.signal }),
    ).resolves.toMatchObject({ tenantId: 'tenant-2' })

    expect(authenticatedRequest?.url).toBe('/invitations/accept')
    expect(authenticatedRequest?.method).toBe('post')
    expect(authenticatedRequest?.data).toBe('{"code":"ABCD1234"}')
    expect(authenticatedSignal?.aborted).toBe(false)

    controller.abort()

    expect(authenticatedSignal?.aborted).toBe(true)
  })

  it('rejects with a normalized API problem', async () => {
    publicApiClient.defaults.adapter = (config) =>
      Promise.reject(
        new AxiosError('missing', 'ERR_BAD_RESPONSE', config, undefined, {
          data: { error: { code: 'INVITE_NOT_FOUND', message: 'Missing' } },
          status: 404,
          statusText: 'Not Found',
          headers: new AxiosHeaders(),
          config,
        }),
      )

    await expect(invitationsApi.info('missing')).rejects.toMatchObject({
      kind: 'not-found',
      code: 'INVITE_NOT_FOUND',
    })
  })
})
