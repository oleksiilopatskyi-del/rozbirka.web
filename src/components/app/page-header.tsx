import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Every cabinet screen opens the same way: where am I, what is this, what can
 * I do here. Actions stay on one row with the title on desktop and wrap below
 * it on narrow screens instead of shrinking.
 */
export function PageHeader({
  eyebrow,
  title,
  actions,
  className,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-end justify-between gap-3',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow === undefined ? null : (
          <p className="text-app-dim font-mono text-[10.5px] tracking-[0.12em] uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-white">
          {title}
        </h1>
      </div>
      {actions === undefined ? null : (
        <div className="flex flex-wrap gap-2">{actions}</div>
      )}
    </header>
  )
}

/** Screen body: one column, consistent rhythm, never wider than its content. */
export function PageBody({
  children,
  width = 'wide',
  className,
}: {
  children: ReactNode
  width?: 'wide' | 'narrow'
  className?: string
}) {
  return (
    <section
      className={cn(
        'mx-auto grid w-full min-w-0 gap-4',
        width === 'wide' ? 'max-w-6xl' : 'max-w-3xl',
        className,
      )}
    >
      {children}
    </section>
  )
}
