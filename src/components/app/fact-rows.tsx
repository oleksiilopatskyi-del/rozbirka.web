import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface FactRow {
  label: string
  value: ReactNode
  /** Sits at the end of the row: a copy button, a link. */
  action?: ReactNode
}

/**
 * The facts of a record read down a single column: label on the left, value on
 * the right, a rule between them. A grid packs more onto the screen; rows are
 * what a person scans when they are looking for one specific field.
 */
export function FactRows({
  rows,
  className,
}: {
  rows: readonly FactRow[]
  className?: string
}) {
  return (
    <dl className={cn('grid', className)}>
      {rows.map((row, index) => (
        <div
          className={cn(
            'flex flex-wrap items-baseline gap-x-6 gap-y-1 py-3',
            index > 0 && 'border-app-line border-t',
          )}
          key={row.label}
        >
          <dt className="text-app-dim w-40 shrink-0 font-mono text-[10.5px] tracking-[0.08em] uppercase">
            {row.label}
          </dt>
          <dd className="text-app-ink flex min-w-0 flex-1 flex-wrap items-center gap-3 text-sm break-words">
            {row.value}
            {row.action}
          </dd>
        </div>
      ))}
    </dl>
  )
}
