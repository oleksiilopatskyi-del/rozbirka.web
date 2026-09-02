import { useCallback, useRef, useState } from 'react'
import { useToast } from './toast-context'

export type OperationStatus = 'idle' | 'pending' | 'done' | 'failed'

export interface OperationApi<Result> {
  status: OperationStatus
  pending: boolean
  /** Message from the last failure, cleared when the next attempt starts. */
  error: string | null
  result: Result | null
  run: () => void
  reset: () => void
  /** Spread onto the button that triggers it. */
  triggerProps: { disabled: boolean; 'aria-busy': boolean }
}

export interface OperationOptions<Result> {
  /** Confirmation shown once it succeeds. Omit for operations that navigate away. */
  successMessage?: string
  /** Turns a failure into something the user can act on. */
  errorMessage?: (error: unknown) => string
  onSuccess?: (result: Result) => void
  onError?: (error: unknown) => void
}

const defaultErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message
    ? error.message
    : 'Не вдалося виконати дію. Спробуйте ще раз.'

/**
 * One contract for "the user asked for something and it is happening": a
 * pending flag the trigger can wear, a success confirmation, and a failure that
 * stays on screen with its reason. Twenty-six screens had grown their own
 * version of this, and half of them reported nothing at all on success.
 *
 * Overlapping calls are ignored rather than queued — a double click must not
 * send a mutation twice.
 */
export function useOperation<Result>(
  operation: () => Promise<Result>,
  options: OperationOptions<Result> = {},
): OperationApi<Result> {
  const { successMessage, errorMessage, onSuccess, onError } = options
  const toast = useToast()
  const [status, setStatus] = useState<OperationStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const inFlight = useRef(false)

  const run = useCallback(() => {
    if (inFlight.current) return
    inFlight.current = true
    setStatus('pending')
    setError(null)

    void operation()
      .then((value) => {
        setResult(value)
        setStatus('done')
        if (successMessage !== undefined) {
          toast.show({ message: successMessage, tone: 'ok' })
        }
        onSuccess?.(value)
      })
      .catch((failure: unknown) => {
        setError((errorMessage ?? defaultErrorMessage)(failure))
        setStatus('failed')
        onError?.(failure)
      })
      .finally(() => {
        inFlight.current = false
      })
  }, [errorMessage, onError, onSuccess, operation, successMessage, toast])

  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
    setResult(null)
  }, [])

  const pending = status === 'pending'

  return {
    status,
    pending,
    error,
    result,
    run,
    reset,
    triggerProps: { disabled: pending, 'aria-busy': pending },
  }
}
