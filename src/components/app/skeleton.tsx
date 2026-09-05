import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'block h-3 rounded bg-white/[0.06] motion-safe:animate-pulse',
        className,
      )}
    />
  )
}

const widths = ['w-3/5', 'w-2/5', 'w-1/3', 'w-1/2']

/**
 * Placeholder for a loading list. Announced once as a status, not per row —
 * a screen reader should hear "завантажуємо", not thirty empty cells.
 */
export function SkeletonRows({
  rows = 5,
  columns = 4,
  label = 'Завантажуємо дані…',
}: {
  rows?: number
  columns?: number
  label?: string
}) {
  return (
    <div className="border-app-line rounded-panel bg-app-raised grid gap-px overflow-hidden border">
      <p className="sr-only" role="status">
        {label}
      </p>
      {Array.from({ length: rows }, (_, row) => (
        <div
          className="flex items-center gap-4 px-4 py-3.5"
          key={`skeleton-row-${String(row)}`}
        >
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              className={cn('flex-1', widths[(row + column) % widths.length])}
              key={`skeleton-cell-${String(column)}`}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
