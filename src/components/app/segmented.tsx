import { cn } from '@/lib/utils'

export interface SegmentedOption<Value extends string> {
  value: Value
  label: string
  /** Announced instead of the label when the label alone is ambiguous. */
  srLabel?: string
}

/**
 * A small set of exclusive choices, all visible at once — a period, a
 * direction, a status filter. Rendered as radios, so arrow keys move between
 * options and a screen reader reads "2 of 3" without any extra wiring.
 */
export function Segmented<Value extends string>({
  label,
  options,
  value,
  onChange,
  name,
  as = 'radio',
  className,
}: {
  /** Names the group for assistive technology. */
  label: string
  options: readonly SegmentedOption<Value>[]
  value: Value
  onChange: (value: Value) => void
  name: string
  /**
   * `radio` is the default. Use `toggle` where every option must stay
   * Tab-reachable — radios use roving tabindex, which some flows rely against.
   */
  as?: 'radio' | 'toggle'
  className?: string
}) {
  if (as === 'toggle') {
    return (
      <div
        aria-label={label}
        className={cn(
          'bg-app-input border-app-line-2 rounded-control flex flex-wrap gap-1 border p-1',
          className,
        )}
        onKeyDown={(event) => {
          const step =
            event.key === 'ArrowRight' || event.key === 'ArrowDown'
              ? 1
              : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                ? -1
                : 0
          if (step === 0) return
          event.preventDefault()
          const buttons = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
              'button:not([disabled])',
            ),
          ]
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          )
          if (index === -1) return
          buttons[(index + step + buttons.length) % buttons.length]?.focus()
        }}
        role="group"
      >
        {options.map((option) => {
          const pressed = option.value === value
          return (
            <button
              aria-pressed={pressed}
              className={cn(
                'rounded-control min-h-11 flex-1 px-3 text-[12.5px] transition-colors',
                pressed
                  ? 'bg-white/[0.09] font-medium text-white'
                  : 'text-app-muted hover:bg-white/[0.04]',
              )}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              {option.label}
              {option.srLabel === undefined ? null : (
                <span className="sr-only"> {option.srLabel}</span>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <fieldset
      className={cn(
        'bg-app-input border-app-line-2 rounded-control flex flex-wrap gap-1 border p-1',
        className,
      )}
    >
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const checked = option.value === value
        return (
          <label
            className={cn(
              'rounded-control flex min-h-11 flex-1 cursor-pointer items-center justify-center px-3 text-[12.5px] transition-colors',
              checked
                ? 'bg-white/[0.09] font-medium text-white'
                : 'text-app-muted hover:bg-white/[0.04]',
            )}
            key={option.value}
          >
            <input
              checked={checked}
              className="sr-only"
              name={name}
              onChange={() => onChange(option.value)}
              type="radio"
              value={option.value}
            />
            {option.label}
            {option.srLabel === undefined ? null : (
              <span className="sr-only"> {option.srLabel}</span>
            )}
          </label>
        )
      })}
    </fieldset>
  )
}
