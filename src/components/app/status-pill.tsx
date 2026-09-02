import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type StatusTone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral'

const toneClass: Record<StatusTone, string> = {
  ok: 'bg-state-ok-soft text-state-ok',
  warn: 'bg-state-warn-soft text-state-warn',
  danger: 'bg-state-danger-soft text-state-danger',
  info: 'bg-state-info-soft text-state-info',
  neutral: 'bg-white/[0.06] text-app-muted',
}

/**
 * State always carries its label: colour alone would make the list unreadable
 * for anyone who cannot separate the hues.
 */
export function StatusPill({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: StatusTone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap',
        toneClass[tone],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}
