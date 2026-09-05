import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The redesign's card: 20px corners, one hairline, a 17px title and an aside
 * opposite it. Screens adopt it one at a time — `SectionPanel` still carries
 * the parts of the cabinet that have not been redrawn yet.
 */
export function Card({
  title,
  aside,
  children,
  className,
  headerClassName,
  bodyClassName,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
  className?: string
  headerClassName?: string
  /** Set to `p-0` for content that runs to the card's edges. */
  bodyClassName?: string
}) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'border-app-line bg-app-raised rounded-[20px] border',
        className,
      )}
    >
      <header
        className={cn(
          'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 pt-[22px]',
          headerClassName,
        )}
      >
        <h2
          className="text-[17px] font-bold tracking-[-0.01em] text-white"
          id={titleId}
        >
          {title}
        </h2>
        {aside}
      </header>
      <div className={cn('px-6 pt-5 pb-6', bodyClassName)}>{children}</div>
    </section>
  )
}
