import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SectionPanelProps {
  title: ReactNode
  /** One line on what this section is for. Skip it when the title says enough. */
  description?: ReactNode
  /** Sits opposite the title: a count, a total, a secondary action. */
  aside?: ReactNode
  children: ReactNode
  /** Actions for this section, pinned to the bottom of the panel. */
  footer?: ReactNode
  /** Drop to 3 when this section sits inside another one. */
  headingLevel?: 2 | 3
  className?: string
}

/**
 * A titled block of a screen. Three screens grew their own copy of this during
 * the first pass, which is what earned it a place in the kit.
 */
export function SectionPanel({
  title,
  description,
  aside,
  children,
  footer,
  headingLevel = 2,
  className,
}: SectionPanelProps) {
  const titleId = useId()
  const Heading = headingLevel === 3 ? 'h3' : 'h2'

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'border-app-line rounded-panel bg-app-raised border',
        className,
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-4">
        <Heading className="text-base font-semibold text-white" id={titleId}>
          {title}
        </Heading>
        {aside === undefined ? null : (
          <div className="text-app-muted text-[12.5px]">{aside}</div>
        )}
        {description === undefined ? null : (
          <p className="text-app-dim w-full text-[12.5px]">{description}</p>
        )}
      </header>
      <div className="grid gap-3 p-4">{children}</div>
      {footer === undefined ? null : <PanelFooter>{footer}</PanelFooter>}
    </section>
  )
}

/**
 * Action bar for a panel or a form: primary action on the right, everything
 * else trailing left, wrapping instead of overflowing on a phone.
 */
export function PanelFooter({
  children,
  leading,
  standalone = false,
  className,
}: {
  children: ReactNode
  /** Context that belongs with the actions: a total, a draft timestamp. */
  leading?: ReactNode
  /** Use under a form rather than inside a panel: gains its own surface. */
  standalone?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'border-app-line flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3',
        standalone && 'rounded-panel bg-app-raised border',
        className,
      )}
    >
      <div className="text-app-dim min-w-0 text-[12.5px]">{leading}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}
