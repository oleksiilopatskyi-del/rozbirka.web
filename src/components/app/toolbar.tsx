import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Filter row above a list. Filters apply as they change — no Apply button. */
export function Toolbar({
  children,
  trailing,
  className,
}: {
  children: ReactNode
  trailing?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'border-app-line rounded-panel bg-app-raised flex flex-wrap items-end gap-2.5 border p-2.5',
        className,
      )}
    >
      {children}
      {trailing === undefined ? null : (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {trailing}
        </div>
      )}
    </div>
  )
}

export interface ActiveFilter {
  key: string
  label: string
  onClear: () => void
}

/** What is currently narrowing the list, and how to undo it. */
export function ActiveFilters({
  filters,
  onReset,
}: {
  filters: readonly ActiveFilter[]
  onReset?: () => void
}) {
  if (filters.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((filter) => (
        <button
          className="border-brand/30 bg-brand/[0.12] text-brand inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs"
          key={filter.key}
          onClick={filter.onClear}
          type="button"
        >
          {filter.label}
          <X aria-hidden className="size-3.5 opacity-70" />
          <span className="sr-only">Прибрати фільтр</span>
        </button>
      ))}
      {onReset === undefined ? null : (
        <button
          className="text-app-muted hover:text-app-ink min-h-11 text-[12.5px] underline underline-offset-4"
          onClick={onReset}
          type="button"
        >
          Скинути
        </button>
      )}
    </div>
  )
}
