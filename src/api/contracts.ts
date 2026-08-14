export type ApiProblemKind =
  | 'cancelled'
  | 'network'
  | 'timeout'
  | 'session-expired'
  | 'forbidden'
  | 'not-found'
  | 'validation'
  | 'conflict'
  | 'server'
  | 'unknown'

export interface ApiProblem {
  kind: ApiProblemKind
  code?: string
  message: string
  status?: number
  fieldErrors?: Record<string, string[]>
  retryAfterSeconds?: number
  cause?: unknown
}

export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface IdempotentMutation {
  idempotencyKey?: string
}

export interface RequestOptions {
  signal?: AbortSignal
}
