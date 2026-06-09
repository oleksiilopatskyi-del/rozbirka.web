import { identityClient } from './client'
import { tokens } from './tokens'
import type {
  OtpVerifyResponse,
  SendOtpRequest,
  SendOtpResponse,
  User,
  VerifyOtpRequest,
} from './types'

export const authApi = {
  async otpSend(req: SendOtpRequest): Promise<SendOtpResponse> {
    const resp = await identityClient.post<SendOtpResponse>('/auth/phone', req)
    return resp.data
  },

  async otpVerify(req: VerifyOtpRequest): Promise<OtpVerifyResponse> {
    // Web is the registration surface: allow account creation on first verify.
    const resp = await identityClient.post<OtpVerifyResponse>(
      '/auth/verify',
      { allowRegistration: true, ...req },
    )
    tokens.set(resp.data.accessToken, resp.data.refreshToken)
    return resp.data
  },

  async logout(): Promise<void> {
    const refresh = tokens.getRefresh()
    try {
      if (refresh) {
        await identityClient.post('/auth/logout', { refreshToken: refresh })
      }
    } catch {
      // ignore
    } finally {
      tokens.clear()
    }
  },

  async me(): Promise<User> {
    const resp = await identityClient.get<User>('/auth/me')
    return resp.data
  },

  async updateName(name: string): Promise<void> {
    await identityClient.patch('/auth/me/name', { name })
  },
}
