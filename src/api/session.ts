import axios, { type AxiosInstance, type CreateAxiosDefaults } from 'axios'
import type { ApiProblem } from './contracts'
import { credentials } from './credentials'
import { normalizeApiProblem } from './errors'
import type {
  SessionRefreshResponse,
  SessionVerifyResponse,
  VerifyOtpRequest,
} from './types'

type AxiosInstanceFactory = (config: CreateAxiosDefaults) => AxiosInstance

const problemError = (problem: ApiProblem): Error & ApiProblem =>
  Object.assign(new Error(problem.message), problem)

export const createSessionApi = (
  createInstance: AxiosInstanceFactory = (config) => axios.create(config),
) => {
  const client = createInstance({
    baseURL: '',
    timeout: 15000,
    withCredentials: true,
  })

  return {
    async verify(req: VerifyOtpRequest): Promise<SessionVerifyResponse> {
      try {
        const response = await client.post<SessionVerifyResponse>(
          '/session/otp/verify',
          req,
        )
        credentials.setAccess(response.data.accessToken)
        return response.data
      } catch (error) {
        throw problemError(normalizeApiProblem(error))
      }
    },

    async refresh(): Promise<SessionRefreshResponse> {
      try {
        const response =
          await client.post<SessionRefreshResponse>('/session/refresh')
        credentials.setAccess(response.data.accessToken)
        return response.data
      } catch (error) {
        throw problemError(normalizeApiProblem(error))
      }
    },

    async logout(): Promise<void> {
      const accessToken = credentials.getAccess()
      try {
        await client.post(
          '/session/logout',
          undefined,
          accessToken
            ? { headers: { Authorization: `Bearer ${accessToken}` } }
            : {},
        )
      } catch (error) {
        throw problemError(normalizeApiProblem(error))
      } finally {
        credentials.clear()
      }
    },
  }
}

export const sessionApi = createSessionApi()
