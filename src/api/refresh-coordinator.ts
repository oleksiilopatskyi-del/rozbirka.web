import axios, { type InternalAxiosRequestConfig } from 'axios'
import type { ApiProblem } from './contracts'
import { normalizeApiProblem } from './errors'

export type SessionRetryConfig = InternalAxiosRequestConfig & {
  _sessionRetry?: boolean
}

interface RefreshCoordinatorDependencies {
  refresh: () => Promise<string>
  setAccess: (token: string) => void
  clearAccess: () => void
  replay: (request: SessionRetryConfig) => Promise<unknown>
}

const problemError = (problem: ApiProblem): Error & ApiProblem =>
  Object.assign(new Error(problem.message), problem)

const isSessionEndpoint = (url: string | undefined) => {
  if (!url) return false

  try {
    const pathname = new URL(url, 'http://session.local').pathname
    return pathname === '/session' || pathname.startsWith('/session/')
  } catch {
    return false
  }
}

const isReplayableRequest = (request: SessionRetryConfig) => {
  const body: unknown = request.data
  if (typeof body !== 'object' || body === null) return true

  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    return false
  }

  const candidate = body as Record<string, unknown>
  return (
    candidate['bodyUsed'] !== true &&
    typeof candidate['getReader'] !== 'function' &&
    typeof candidate['pipe'] !== 'function'
  )
}

export const createRefreshCoordinator = ({
  refresh,
  setAccess,
  clearAccess,
  replay,
}: RefreshCoordinatorDependencies) => {
  let refreshPromise: Promise<string> | null = null

  const invokeRefresh = () => {
    try {
      return refresh()
    } catch (error) {
      return Promise.reject(
        error instanceof Error
          ? error
          : new Error('Refresh failed', { cause: error }),
      )
    }
  }

  const startRefresh = (sessionExpired: ApiProblem) => {
    refreshPromise ??= invokeRefresh()
      .then((token) => {
        setAccess(token)
        return token
      })
      .catch((error: unknown) => {
        clearAccess()
        const refreshProblem = normalizeApiProblem(error)
        throw problemError(
          refreshProblem.kind === 'session-expired'
            ? refreshProblem
            : { ...sessionExpired, cause: error },
        )
      })
      .finally(() => {
        refreshPromise = null
      })

    return refreshPromise
  }

  return {
    async recover(error: unknown): Promise<unknown> {
      const problem = normalizeApiProblem(error)
      if (!axios.isAxiosError(error) || problem.kind !== 'session-expired') {
        throw problemError(problem)
      }

      const request = error.config as SessionRetryConfig | undefined
      if (
        !request ||
        request._sessionRetry ||
        isSessionEndpoint(request.url) ||
        !isReplayableRequest(request)
      ) {
        throw problemError(problem)
      }

      request._sessionRetry = true
      await startRefresh(problem)
      return replay(request)
    },
  }
}
