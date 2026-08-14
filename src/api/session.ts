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

interface ActiveRefresh {
  controller: AbortController
  settled: Promise<void>
  settle: () => void
}

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
  let sessionGeneration = 0
  let logoutInProgress = false
  const activeRefreshes = new Set<ActiveRefresh>()

  return {
    async verify(req: VerifyOtpRequest): Promise<SessionVerifyResponse> {
      try {
        const response = await client.post<SessionVerifyResponse>(
          '/session/otp/verify',
          req,
        )
        const payload: SessionVerifyResponse = {
          accessToken: response.data.accessToken,
          user: {
            id: response.data.user.id,
            phone: response.data.user.phone,
            displayName: response.data.user.displayName,
          },
          isNewUser: response.data.isNewUser,
        }
        credentials.setAccess(payload.accessToken)
        return payload
      } catch (error) {
        throw problemError(normalizeApiProblem(error))
      }
    },

    async refresh(): Promise<SessionRefreshResponse> {
      if (logoutInProgress) {
        throw problemError(normalizeApiProblem(new axios.CanceledError()))
      }

      const generation = sessionGeneration
      const controller = new AbortController()
      let settle!: () => void
      const activeRefresh: ActiveRefresh = {
        controller,
        settled: new Promise((resolve) => {
          settle = resolve
        }),
        settle: () => settle(),
      }
      activeRefreshes.add(activeRefresh)

      try {
        const response = await client.post<SessionRefreshResponse>(
          '/session/refresh',
          undefined,
          { signal: controller.signal },
        )
        if (generation !== sessionGeneration) {
          throw new axios.CanceledError()
        }
        const payload: SessionRefreshResponse = {
          accessToken: response.data.accessToken,
          expiresIn: response.data.expiresIn,
        }
        credentials.setAccess(payload.accessToken)
        return payload
      } catch (error) {
        throw problemError(normalizeApiProblem(error))
      } finally {
        activeRefreshes.delete(activeRefresh)
        activeRefresh.settle()
      }
    },

    async logout(): Promise<void> {
      const accessToken = credentials.getAccess()
      sessionGeneration += 1
      logoutInProgress = true
      credentials.clear()
      const refreshes = [...activeRefreshes]
      refreshes.forEach(({ controller }) => controller.abort())
      await Promise.all(refreshes.map(({ settled }) => settled))

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
        logoutInProgress = false
      }
    },
  }
}

export const sessionApi = createSessionApi()
