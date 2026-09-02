import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type MeterTone = 'brand' | 'ok' | 'warn' | 'danger'

const fillTone: Record<MeterTone, string> = {
  brand: 'bg-brand',
  ok: 'bg-state-ok',
  warn: 'bg-state-warn',
  danger: 'bg-state-danger',
}

const textTone: Record<MeterTone, string> = {
  brand: 'text-brand',
  ok: 'text-state-ok',
  warn: 'text-state-warn',
  danger: 'text-state-danger',
}

/**
 * A figure against the limit that gives it meaning: recouped against invested,
 * used against a quota. The bar is capped at the limit so it never claims more
 * than full, while the number beside it stays honest — 153% reads as a full bar
 * and the real percentage, not as a bar that ran off its own scale.
 *
 * Never colour alone: the value is always written next to it.
 */
export function Meter({
  value,
  max,
  label,
  valueLabel,
  hint,
  emptyLabel,
  tone = 'brand',
  className,
}: {
  value: number | null | undefined
  /** The limit the value is judged against. Zero or missing means no scale. */
  max: number | null | undefined
  /** Names the measure for assistive technology, e.g. "Повернено від вкладеного". */
  label: string
  /** The figure as the user should read it — money, a count. */
  valueLabel: ReactNode
  /** Secondary line under the figure; the percentage by default. */
  hint?: ReactNode
  /** Shown instead of the bar when there is nothing to measure yet. */
  emptyLabel?: string
  tone?: MeterTone
  className?: string
}) {
  const hasScale =
    value !== null &&
    value !== undefined &&
    max !== null &&
    max !== undefined &&
    max > 0

  if (!hasScale) {
    return (
      <div className={cn('grid justify-items-end gap-1', className)}>
        <span className="text-app-muted text-sm tabular-nums">
          {valueLabel}
        </span>
        {emptyLabel === undefined ? null : (
          <span className="text-app-dim text-[11.5px]">{emptyLabel}</span>
        )}
      </div>
    )
  }

  const percent = Math.round((value / max) * 100)
  const filled = Math.max(0, Math.min(percent, 100))

  return (
    <div className={cn('grid justify-items-end gap-1.5', className)}>
      <span className="text-sm tabular-nums text-white">{valueLabel}</span>
      <span
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        aria-valuetext={`${String(percent)}%`}
        className="bg-app-line-2 block h-1.5 w-full max-w-36 overflow-hidden rounded-full"
        role="progressbar"
      >
        <span
          className={cn('block h-full rounded-full', fillTone[tone])}
          style={{ width: `${String(filled)}%` }}
        />
      </span>
      <span className={cn('text-[11.5px] tabular-nums', textTone[tone])}>
        {hint ?? `${String(percent)}%`}
      </span>
    </div>
  )
}
