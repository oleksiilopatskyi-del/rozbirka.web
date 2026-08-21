import axios from 'axios'
import type { ApiProblem, ApiProblemKind } from './contracts'

interface ErrorBody {
  error?: string | { code?: string; message?: string }
  message?: string
  errors?: Record<string, unknown>
}

const fallbackMessages: Record<ApiProblemKind, string> = {
  cancelled: 'Запит скасовано.',
  network: 'Немає з’єднання з мережею.',
  timeout: 'Час очікування запиту минув.',
  'session-expired': 'Сеанс завершився. Увійдіть знову.',
  forbidden: 'У вас немає доступу до цієї дії.',
  'not-found': 'Ресурс не знайдено.',
  validation: 'Перевірте правильність введених даних.',
  conflict: 'Не вдалося виконати дію через конфлікт даних.',
  server: 'Сталася помилка сервера. Спробуйте пізніше.',
  unknown: 'Сталася непередбачена помилка. Спробуйте ще раз.',
}

const kindForStatus = (status: number | undefined): ApiProblemKind => {
  if (status === 401) return 'session-expired'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  if (status === 409) return 'conflict'
  if (status === 422) return 'validation'
  if (status !== undefined && status >= 500 && status < 600) return 'server'
  return 'unknown'
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const problemKinds = new Set<ApiProblemKind>([
  'cancelled',
  'network',
  'timeout',
  'session-expired',
  'forbidden',
  'not-found',
  'validation',
  'conflict',
  'server',
  'unknown',
])

const isApiProblem = (value: unknown): value is ApiProblem =>
  isRecord(value) &&
  typeof value['kind'] === 'string' &&
  problemKinds.has(value['kind'] as ApiProblemKind) &&
  typeof value['message'] === 'string'

const readFieldErrors = (
  value: unknown,
): Record<string, string[]> | undefined => {
  if (!isRecord(value)) return undefined

  const fieldErrors = Object.fromEntries(
    Object.entries(value).flatMap(([field, messages]) => {
      if (
        !Array.isArray(messages) ||
        !messages.every((message) => typeof message === 'string')
      ) {
        return []
      }
      return [[field, messages]]
    }),
  )
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined
}

const readRetryAfter = (headers: unknown) => {
  const raw =
    headers instanceof axios.AxiosHeaders
      ? headers.get('retry-after')
      : isRecord(headers)
        ? headers['retry-after']
        : undefined
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return undefined
  const seconds = Number(raw)
  return Number.isSafeInteger(seconds) ? seconds : undefined
}

export const normalizeApiProblem = (error: unknown): ApiProblem => {
  if (isApiProblem(error)) return error

  if (axios.isCancel(error)) {
    return {
      kind: 'cancelled',
      message: fallbackMessages.cancelled,
      cause: error,
    }
  }

  if (!axios.isAxiosError(error)) {
    return { kind: 'unknown', message: fallbackMessages.unknown, cause: error }
  }

  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return { kind: 'timeout', message: fallbackMessages.timeout, cause: error }
  }

  if (error.code === 'ERR_NETWORK') {
    return { kind: 'network', message: fallbackMessages.network, cause: error }
  }

  const status = error.response?.status
  const kind = kindForStatus(status)
  const body = isRecord(error.response?.data)
    ? (error.response.data as ErrorBody)
    : undefined
  const nestedError = isRecord(body?.error) ? body.error : undefined
  const code =
    typeof body?.error === 'string'
      ? body.error
      : typeof nestedError?.code === 'string'
        ? nestedError.code
        : undefined
  const message =
    typeof nestedError?.message === 'string'
      ? nestedError.message
      : typeof body?.message === 'string'
        ? body.message
        : fallbackMessages[kind]
  const fieldErrors = readFieldErrors(body?.errors)
  const retryAfterSeconds = readRetryAfter(error.response?.headers)

  return {
    kind,
    ...(status !== undefined ? { status } : {}),
    ...(code ? { code } : {}),
    message,
    ...(fieldErrors ? { fieldErrors } : {}),
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    cause: error,
  }
}
