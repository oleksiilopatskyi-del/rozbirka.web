import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, Lock, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export type StateTone = 'neutral' | 'brand' | 'warn' | 'danger'

const iconToneClass: Record<StateTone, string> = {
  neutral: 'bg-white/[0.05] text-app-muted',
  brand: 'bg-brand/[0.12] text-brand',
  warn: 'bg-state-warn-soft text-state-warn',
  danger: 'bg-state-danger-soft text-state-danger',
}

export interface StateScreenProps {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  tone?: StateTone
  actions?: ReactNode
  /** Shown in mono under the actions: what support needs to find the request. */
  meta?: ReactNode
  role?: 'status' | 'alert'
  className?: string
}

/** Shared frame for empty, denied, blocked and failed screens. */
export function StateScreen({
  title,
  description,
  icon,
  tone = 'neutral',
  actions,
  meta,
  role = 'status',
  className,
}: StateScreenProps) {
  return (
    <section
      className={cn(
        'border-app-line-2 rounded-panel bg-app-raised grid justify-items-center gap-2.5 border border-dashed px-6 py-12 text-center',
        className,
      )}
      role={role}
    >
      {icon === undefined ? null : (
        <span
          className={cn(
            'mb-1 grid size-11 place-items-center rounded-xl [&_svg]:size-5',
            iconToneClass[tone],
          )}
        >
          {icon}
        </span>
      )}
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {description === undefined ? null : (
        <p className="text-app-muted max-w-[42ch] text-sm leading-6">
          {description}
        </p>
      )}
      {actions === undefined ? null : (
        <div className="mt-1.5 flex flex-wrap justify-center gap-2">
          {actions}
        </div>
      )}
      {meta === undefined ? null : (
        <p className="text-app-dim mt-1 font-mono text-[11px]">{meta}</p>
      )}
    </section>
  )
}

export function EmptyState({
  title,
  description,
  actions,
  icon,
  tone = 'brand',
}: Omit<StateScreenProps, 'role'>) {
  return (
    <StateScreen
      actions={actions}
      description={description}
      icon={icon ?? <Inbox aria-hidden />}
      title={title}
      tone={tone}
    />
  )
}

export function ErrorState({
  title = 'Не вдалося завантажити дані',
  description = 'Зв’язок із сервером перервався. Спробуйте ще раз.',
  onRetry,
  retryLabel = 'Спробувати ще раз',
  correlationId,
  actions,
}: {
  title?: ReactNode
  description?: ReactNode
  onRetry?: () => void
  retryLabel?: string
  correlationId?: string
  actions?: ReactNode
}) {
  return (
    <StateScreen
      actions={
        actions ??
        (onRetry === undefined ? undefined : (
          <Button onClick={onRetry}>
            <RefreshCw aria-hidden />
            {retryLabel}
          </Button>
        ))
      }
      description={description}
      icon={<AlertTriangle aria-hidden />}
      meta={
        correlationId === undefined ? undefined : `звернення ${correlationId}`
      }
      role="alert"
      title={title}
      tone="danger"
    />
  )
}

export function DeniedState({
  title,
  description,
  actions,
}: Pick<StateScreenProps, 'title' | 'description' | 'actions'>) {
  return (
    <StateScreen
      actions={actions}
      description={description}
      icon={<Lock aria-hidden />}
      title={title}
      tone="neutral"
    />
  )
}
