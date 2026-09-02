import type { ComponentProps } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFieldControl } from './field-context'

/**
 * 44px is the floor for every cabinet control: the touch-target gate checks the
 * rendered box, so the size belongs to the component, not to a page-level rule.
 */
const controlBase =
  'bg-app-input text-app-ink placeholder:text-app-dim border-app-line-2 rounded-control min-h-11 w-full border px-3 text-sm outline-none transition-colors hover:border-white/20 focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-55 aria-[invalid=true]:border-state-danger'

export function TextInput({ className, ...props }: ComponentProps<'input'>) {
  const field = useFieldControl()
  return <input {...field} {...props} className={cn(controlBase, className)} />
}

export function TextArea({ className, ...props }: ComponentProps<'textarea'>) {
  const field = useFieldControl()
  return (
    <textarea
      {...field}
      {...props}
      className={cn(controlBase, 'min-h-24 py-2 leading-6', className)}
    />
  )
}

export function SelectInput({
  className,
  children,
  ...props
}: ComponentProps<'select'>) {
  const field = useFieldControl()
  return (
    <div className="relative">
      <select
        {...field}
        {...props}
        className={cn(
          controlBase,
          'cursor-pointer appearance-none pr-9',
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="text-app-dim pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
      />
    </div>
  )
}

/** Search box with a leading icon; the icon never steals the click. */
export function SearchInput({ className, ...props }: ComponentProps<'input'>) {
  const field = useFieldControl()
  return (
    <div className="relative w-full">
      <svg
        aria-hidden
        className="text-app-dim pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5 21 21" strokeLinecap="round" />
      </svg>
      <input
        {...field}
        type="search"
        {...props}
        className={cn(controlBase, 'pl-9', className)}
      />
    </div>
  )
}
