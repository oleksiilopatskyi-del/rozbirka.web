import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ToastContext,
  type ToastApi,
  type ToastRequest,
  type ToastTone,
} from './toast-context'

interface ActiveToast extends ToastRequest {
  id: number
}

const toneIcon: Record<ToastTone, typeof Info> = {
  ok: CheckCircle2,
  danger: AlertTriangle,
  info: Info,
}

const toneColor: Record<ToastTone, string> = {
  ok: 'text-state-ok',
  danger: 'text-state-danger',
  info: 'text-state-info',
}

const DEFAULT_DURATION = 6000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([])
  const nextId = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (request: ToastRequest) => {
      const id = nextId.current++
      setToasts((current) => [...current.slice(-2), { ...request, id }])
      const duration = request.duration ?? DEFAULT_DURATION
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        )
      }
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach((timer) => clearTimeout(timer))
      pending.clear()
    }
  }, [])

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [dismiss, show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[70] grid justify-items-center gap-2 md:inset-x-auto md:right-6 md:bottom-6 md:justify-items-end">
        {toasts.map((toast) => {
          const tone = toast.tone ?? 'info'
          const Icon = toneIcon[tone]
          return (
            <div
              className="bg-app-overlay border-app-line-2 rounded-control text-app-ink pointer-events-auto flex w-full max-w-md items-center gap-2.5 border px-3.5 py-2.5 text-[13.5px] shadow-2xl"
              key={toast.id}
              role={tone === 'danger' ? 'alert' : 'status'}
            >
              <Icon
                aria-hidden
                className={cn('size-4 shrink-0', toneColor[tone])}
              />
              <span className="min-w-0 flex-1">{toast.message}</span>
              {toast.action === undefined ? null : (
                <button
                  className="text-brand shrink-0 text-[12.5px] underline underline-offset-4"
                  onClick={() => {
                    toast.action?.onAction()
                    dismiss(toast.id)
                  }}
                  type="button"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                aria-label="Закрити сповіщення"
                className="text-app-dim hover:text-app-ink grid size-6 shrink-0 place-items-center"
                onClick={() => dismiss(toast.id)}
                type="button"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
