import { identityClient } from './client'
import { credentials } from './credentials'
import { sessionApi } from './session'
import type {
  SendOtpRequest,
  SendOtpResponse,
  SessionVerifyResponse,
  UpdateNameResponse,
  User,
  VerifyUser,
  VerifyOtpRequest,
} from './types'

export const authApi = {
  async otpSend(req: SendOtpRequest): Promise<SendOtpResponse> {
    return sessionApi.send(req)
  },

  async otpVerify(req: VerifyOtpRequest): Promise<SessionVerifyResponse> {
    // Web is the registration surface: allow account creation on first verify.
    return sessionApi.verify({
      allowRegistration: true,
      ...req,
    })
  },

  async logout(): Promise<void> {
    await sessionApi.logout()
  },

  async me(): Promise<User> {
    const resp = await identityClient.get<User>('/auth/me')
    return resp.data
  },

  async updateName(name: string): Promise<VerifyUser> {
    const response = await identityClient.patch<UpdateNameResponse>(
      '/auth/me/name',
      { name },
    )
    credentials.setAccess(response.data.accessToken)
    return response.data.user
  },
}
