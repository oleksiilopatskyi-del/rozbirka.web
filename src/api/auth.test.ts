import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { authApi } from './auth'
import { identityClient } from './client'
import { credentials } from './credentials'
import { sessionApi } from './session'

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

beforeEach(() => {
  credentials.clear()
})

afterEach(() => {
  identityClient.defaults.adapter = originalAdapter
  vi.restoreAllMocks()
})

it('delegates OTP sending to the browser session facade', async () => {
  const payload = { cooldownSeconds: 60, retryAfterSeconds: 300 }
  const send = vi.spyOn(sessionApi, 'send').mockResolvedValue(payload)

  await expect(authApi.otpSend({ phone: '+380501112233' })).resolves.toEqual(
    payload,
  )
  expect(send).toHaveBeenCalledWith({ phone: '+380501112233' })
})

it('delegates OTP verification to the browser session facade', async () => {
  const payload = {
    accessToken: 'access',
    user: {
      id: 'user-1',
      phone: '+380501112233',
      displayName: 'Власник',
    },
    isNewUser: true,
  }
  const verify = vi.spyOn(sessionApi, 'verify').mockResolvedValue(payload)

  await expect(
    authApi.otpVerify({ phone: '+380501112233', code: '123456' }),
  ).resolves.toEqual(payload)
  expect(verify).toHaveBeenCalledWith({
    phone: '+380501112233',
    code: '123456',
    allowRegistration: true,
  })
})

it('delegates logout to the browser session facade', async () => {
  const logout = vi.spyOn(sessionApi, 'logout').mockResolvedValue(undefined)

  await authApi.logout()

  expect(logout).toHaveBeenCalledOnce()
})

it('commits the access returned by update-name and returns the updated user', async () => {
  const updatedUser = {
    id: 'user-1',
    phone: '+380501112233',
    displayName: 'Нове ім’я',
  }
  identityClient.defaults.adapter = (config) =>
    Promise.resolve(
      response(config, {
        data: {
          user: updatedUser,
          accessToken: 'updated-access',
          expiresIn: 900,
        },
      }),
    )

  await expect(authApi.updateName('Нове ім’я')).resolves.toEqual(updatedUser)
  expect(credentials.getAccess()).toBe('updated-access')
})
