import { createContext, useContext } from 'react'

export type ToastTone = 'ok' | 'danger' | 'info'

export interface ToastRequest {
  tone?: ToastTone
  message: string
  /** One optional follow-up: "Відкрити", "Повторити", "Скасувати". */
  action?: { label: string; onAction: () => void }
  /** Milliseconds until it dismisses itself; 0 keeps it until dismissed. */
  duration?: number
}

export interface ToastApi {
  show: (request: ToastRequest) => void
  dismiss: (id: number) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

/**
 * Transient confirmation of something the user just did. Anything the user must
 * act on belongs on the page as a `Notice`, not here.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (api === null) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return api
}
