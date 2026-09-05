import { cn } from '@/lib/utils'

export interface PillOption {
  value: string
  label: string
}

/**
 * A small set of mutually exclusive choices, shown as pills in a tray. Radio
 * semantics, so the whole group is one stop in the tab order and arrow keys
 * move between the options — a row of buttons would make every choice its own
 * stop and never announce which one is current.
 */
export function PillGroup({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly PillOption[]
  value: string
  onChange: (value: string) => void
  /** Names the group for assistive technology, e.g. "Статус автомобілів". */
  label: string
  className?: string
}) {
  return (
    <div
      aria-label={label}
      className={cn(
        'border-app-line bg-app-raised flex shrink-0 items-center gap-1 rounded-[14px] border p-1.5',
        className,
      )}
      role="radiogroup"
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            aria-checked={active}
            className={cn(
              'focus-visible:outline-brand min-h-9 cursor-pointer rounded-[10px] px-4 text-sm transition-colors',
              active
                ? 'bg-app-input font-bold text-white'
                : 'text-app-muted hover:text-app-ink font-medium',
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="radio"
            type="button"
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
