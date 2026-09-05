import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Step {
  key: string
  title: string
  /** What this step is for, one line. Shown under the title of the current step. */
  description?: string
  /** Set while the step is missing something; the step reads as blocked. */
  error?: string | null
}

/**
 * Progress through a creation flow: where I am, what is behind me, how much is
 * left. Completed steps are reachable again — going back to fix an entry must
 * never mean starting over.
 */
export function Stepper({
  steps,
  current,
  onSelect,
  className,
}: {
  steps: readonly Step[]
  current: number
  /** Omit to make the strip read-only. */
  onSelect?: (index: number) => void
  className?: string
}) {
  return (
    <ol
      className={cn(
        'border-app-line rounded-panel bg-app-raised flex flex-wrap gap-1 border p-2',
        className,
      )}
    >
      {steps.map((step, index) => {
        const done = index < current
        const active = index === current
        const failed = Boolean(step.error)
        const reachable = onSelect !== undefined && (done || active)
        const label = `Крок ${String(index + 1)} з ${String(steps.length)}: ${step.title}`

        const content = (
          <>
            <span
              aria-hidden
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums',
                failed && 'bg-state-danger-soft text-state-danger',
                !failed && active && 'bg-brand text-brand-foreground',
                !failed && done && 'bg-state-ok-soft text-state-ok',
                !failed && !active && !done && 'bg-white/[0.06] text-app-dim',
              )}
            >
              {done && !failed ? <Check className="size-3" /> : index + 1}
            </span>
            <span className="truncate">{step.title}</span>
          </>
        )

        return (
          <li className="min-w-0 flex-1" key={step.key}>
            {reachable ? (
              <button
                aria-current={active ? 'step' : undefined}
                aria-label={label}
                className={cn(
                  'rounded-control flex min-h-11 w-full items-center gap-2 px-3 text-[12.5px] transition-colors',
                  active ? 'bg-white/[0.05] text-white' : 'text-app-muted',
                  'hover:bg-white/[0.06]',
                )}
                onClick={() => onSelect(index)}
                type="button"
              >
                {content}
              </button>
            ) : (
              <span
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'rounded-control flex min-h-11 w-full items-center gap-2 px-3 text-[12.5px]',
                  active ? 'bg-white/[0.05] text-white' : 'text-app-dim',
                )}
              >
                <span className="sr-only">{label}</span>
                {content}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** The body of one step: its heading, purpose and fields. */
export function StepPanel({
  step,
  children,
}: {
  step: Step
  children: ReactNode
}) {
  return (
    <section aria-label={step.title} className="grid gap-3">
      {step.description === undefined ? null : (
        <p className="text-app-dim text-[12.5px]">{step.description}</p>
      )}
      {children}
    </section>
  )
}
