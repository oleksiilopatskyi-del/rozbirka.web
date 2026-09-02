import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Neutral surface for grouped content: cards, filter bars, summaries. */
export function Panel({
  children,
  className,
  padded = true,
  ...props
}: ComponentProps<'div'> & { padded?: boolean }) {
  return (
    <div
      className={cn(
        'border-app-line rounded-panel bg-app-raised border',
        padded && 'p-4',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/** A single number with its label. Digits stay in one column across cards. */
export function StatCard({
  label,
  value,
  delta,
  tone = 'neutral',
  accent = false,
}: {
  label: ReactNode
  value: ReactNode
  delta?: ReactNode
  tone?: 'up' | 'down' | 'neutral'
  accent?: boolean
}) {
  return (
    <Panel
      className={cn(accent && 'border-brand/30 bg-brand/[0.06]')}
      padded={false}
    >
      <div className="p-4">
        <p className="text-app-dim text-[12.5px]">{label}</p>
        <p className="mt-1.5 text-[25px] leading-tight font-light tracking-[-0.02em] tabular-nums text-white">
          {value}
        </p>
        {delta === undefined ? null : (
          <p
            className={cn(
              'mt-1 font-mono text-[11.5px]',
              tone === 'up' && 'text-state-ok',
              tone === 'down' && 'text-state-danger',
              tone === 'neutral' && 'text-app-dim',
            )}
          >
            {delta}
          </p>
        )}
      </div>
    </Panel>
  )
}

/** Inline summary numbers above a list: total, available, reserved. */
export function StatStrip({
  items,
}: {
  items: readonly { label: string; value: ReactNode }[]
}) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 px-0.5">
      {items.map((item) => (
        <div className="flex items-baseline gap-1.5" key={item.label}>
          <dd className="text-[17px] font-semibold tabular-nums text-white">
            {item.value}
          </dd>
          <dt className="text-app-dim text-[12.5px]">{item.label}</dt>
        </div>
      ))}
    </dl>
  )
}
