import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const numberFormatter = new Intl.NumberFormat('uk-UA')
const dateTimeFormatter = new Intl.DateTimeFormat('uk-UA', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Kyiv',
})
const dateFormatter = new Intl.DateTimeFormat('uk-UA', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Kyiv',
})

const currencyLabel: Record<string, string> = {
  UAH: '₴',
  USD: '$',
  EUR: '€',
}

/**
 * Money. Grouped digits, tabular figures so columns line up, and the currency
 * kept next to the number rather than in a separate column.
 */
export function Amount({
  value,
  currency = 'UAH',
  className,
  fallback = '—',
}: {
  value: number | string | null | undefined
  currency?: string | null
  className?: string
  fallback?: string
}) {
  const numeric = typeof value === 'string' ? Number(value) : value
  if (numeric === null || numeric === undefined || Number.isNaN(numeric)) {
    return <span className={cn('tabular-nums', className)}>{fallback}</span>
  }

  const suffix = currency ? (currencyLabel[currency] ?? currency) : ''
  return (
    <span className={cn('tabular-nums whitespace-nowrap', className)}>
      {numberFormatter.format(numeric)}
      {suffix ? ` ${suffix}` : ''}
    </span>
  )
}

/** A count with its unit, so "3" never floats without saying 3 of what. */
export function Quantity({
  value,
  unit,
  className,
  fallback = '—',
}: {
  value: number | null | undefined
  unit?: string | null
  className?: string
  fallback?: string
}) {
  if (value === null || value === undefined) {
    return <span className={cn('tabular-nums', className)}>{fallback}</span>
  }

  return (
    <span className={cn('tabular-nums whitespace-nowrap', className)}>
      {numberFormatter.format(value)}
      {unit ? ` ${unit}` : ''}
    </span>
  )
}

/**
 * A moment in time, rendered in Kyiv time inside a real `<time>` element so the
 * machine-readable value survives alongside the readable one.
 */
export function DateValue({
  value,
  withTime = true,
  className,
  fallback = '—',
}: {
  value: string | null | undefined
  withTime?: boolean
  className?: string
  fallback?: string
}) {
  if (!value) return <span className={className}>{fallback}</span>

  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) {
    return <span className={className}>{fallback}</span>
  }

  return (
    <time
      className={cn('tabular-nums whitespace-nowrap', className)}
      dateTime={value}
    >
      {(withTime ? dateTimeFormatter : dateFormatter).format(date)}
    </time>
  )
}

/** Label and value as a definition pair — the shape every detail screen needs. */
export function Fact({
  label,
  children,
  className,
}: {
  label: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid min-w-0 gap-1', className)}>
      <dt className="text-app-dim text-[12.5px]">{label}</dt>
      <dd className="text-sm break-words text-white">{children}</dd>
    </div>
  )
}

/** The definition list that holds `Fact`s. Three columns on a desktop. */
export function FactList({
  children,
  columns = 3,
  className,
}: {
  children: ReactNode
  columns?: 2 | 3
  className?: string
}) {
  return (
    <dl
      className={cn(
        'grid gap-3 sm:grid-cols-2',
        columns === 3 && 'lg:grid-cols-3',
        className,
      )}
    >
      {children}
    </dl>
  )
}
