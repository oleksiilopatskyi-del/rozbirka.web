import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, expect, it } from 'vitest'
import { identityClient } from './client'
import { credentials } from './credentials'
import { profileApi } from './profile'

function response<T>(
  config: InternalAxiosRequestConfig,
  data: T,
): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: new AxiosHeaders(),
    config,
  }
}

const originalAdapter = identityClient.defaults.adapter!

afterEach(() => {
  identityClient.defaults.adapter = originalAdapter
})

it('updates the authenticated profile name and forwards cancellation', async () => {
  const controller = new AbortController()
  let observed: InternalAxiosRequestConfig | undefined
  identityClient.defaults.adapter = (config) => {
    observed = config
    return Promise.resolve(
      response(config, {
        data: {
          user: {
            id: 'user-1',
            phone: '+380501112233',
            displayName: 'Олена',
          },
          accessToken: 'updated-access',
          expiresIn: 900,
        },
      }),
    )
  }

  await expect(
    profileApi.updateName('Олена', { signal: controller.signal }),
  ).resolves.toEqual({
    id: 'user-1',
    phone: '+380501112233',
    displayName: 'Олена',
  })

  expect(observed?.method).toBe('patch')
  expect(observed?.url).toBe('/auth/me/name')
  expect(observed?.data).toBe(JSON.stringify({ name: 'Олена' }))
  expect(observed?.signal).toBe(controller.signal)
  expect(credentials.getAccess()).toBe('updated-access')
})

it('deletes the authenticated account only through the identity endpoint', async () => {
  const controller = new AbortController()
  let observed: InternalAxiosRequestConfig | undefined
  identityClient.defaults.adapter = (config) => {
    observed = config
    return Promise.resolve(response(config, undefined))
  }

  await expect(
    profileApi.deleteAccount({ signal: controller.signal }),
  ).resolves.toBeUndefined()

  expect(observed?.method).toBe('delete')
  expect(observed?.url).toBe('/auth/me')
  expect(observed?.signal).toBe(controller.signal)
})
