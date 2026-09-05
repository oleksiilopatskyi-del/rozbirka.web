import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface Spec {
  label: string
  value: ReactNode
  /** Sits under the value: a note, a lock, a copy button. */
  note?: ReactNode
  /** Takes the full width — for values that run long: notes, codes. */
  wide?: boolean
}

/**
 * The fixed properties of a record, laid out as cells rather than rows. Short
 * values — a code, a condition, a type — waste a whole row each in a list and
 * are quicker to compare side by side; the hairline between cells does the
 * separating, so nothing needs a box of its own.
 *
 * Use `FactRows` instead when most values are sentences.
 */
export function SpecGrid({
  specs,
  className,
}: {
  specs: readonly Spec[]
  className?: string
}) {
  return (
    <dl
      className={cn(
        'bg-app-line rounded-panel grid gap-px overflow-hidden sm:grid-cols-2',
        className,
      )}
    >
      {specs.map((spec) => (
        <div
          className={cn(
            'bg-app-raised grid content-start gap-1.5 px-4 py-3.5',
            spec.wide && 'sm:col-span-2',
          )}
          key={spec.label}
        >
          <dt className="text-app-dim font-mono text-[10px] tracking-[0.14em] uppercase">
            {spec.label}
          </dt>
          <dd className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[15px] font-medium break-words text-white">
            {spec.value}
            {spec.note}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * A quiet aside inside a cell: why a value cannot be edited, where it came
 * from. Never the value itself.
 */
export function SpecNote({
  children,
  icon,
}: {
  children: ReactNode
  icon?: ReactNode
}) {
  return (
    <span className="text-app-dim inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 text-[12px] font-normal">
      {icon}
      {children}
    </span>
  )
}
