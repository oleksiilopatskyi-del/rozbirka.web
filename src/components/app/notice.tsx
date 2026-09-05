import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export type NoticeTone = 'info' | 'ok' | 'warn' | 'danger'

const toneClass: Record<NoticeTone, string> = {
  info: 'border-state-info/30 bg-state-info-soft text-state-info',
  ok: 'border-state-ok/30 bg-state-ok-soft text-state-ok',
  warn: 'border-state-warn/30 bg-state-warn-soft text-state-warn',
  danger: 'border-state-danger/30 bg-state-danger-soft text-state-danger',
}

const toneIcon: Record<NoticeTone, typeof Info> = {
  info: Info,
  ok: CheckCircle2,
  warn: AlertTriangle,
  danger: AlertTriangle,
}

/**
 * Inline message tied to the block it belongs to — the styled replacement for
 * a bare `<p role="alert">`. Keeps the live-region role it is given so existing
 * announcements do not change.
 */
export function Notice({
  tone = 'info',
  children,
  role = tone === 'danger' ? 'alert' : 'status',
  action,
  block = false,
  className,
}: {
  tone?: NoticeTone
  children: ReactNode
  role?: 'status' | 'alert'
  action?: ReactNode
  /** Render the body as a block, so it can host a list or several paragraphs. */
  block?: boolean
  className?: string
}) {
  const Icon = toneIcon[tone]

  return (
    <div
      className={cn(
        'rounded-control flex flex-wrap items-start gap-2.5 border px-3.5 py-2.5 text-[13.5px]',
        toneClass[tone],
        className,
      )}
      role={role}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      {block ? (
        <div className="text-app-ink min-w-0 flex-1">{children}</div>
      ) : (
        <span className="text-app-ink min-w-0 flex-1">{children}</span>
      )}
      {action}
    </div>
  )
}
