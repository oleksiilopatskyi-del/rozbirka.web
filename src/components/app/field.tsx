import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { FieldContext } from './field-context'

export interface FieldProps {
  label: ReactNode
  children: ReactNode
  /** Guidance shown under the control. Never part of the accessible name. */
  hint?: ReactNode
  /** Replaces the hint and marks the control invalid. */
  error?: ReactNode
  required?: boolean
  className?: string
}

/**
 * One labelled control. The label is explicit (`htmlFor`), so hint and error
 * text describe the control without leaking into its accessible name.
 */
export function Field({
  label,
  children,
  hint,
  error,
  required = false,
  className,
}: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const invalid = error !== undefined && error !== null && error !== false
  const describedBy = invalid
    ? errorId
    : hint !== undefined && hint !== null && hint !== false
      ? hintId
      : undefined

  return (
    <div className={cn('grid gap-1.5', className)}>
      <label className="text-app-muted text-[12.5px]" htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden className="text-brand ml-1">
            *
          </span>
        ) : null}
      </label>
      <FieldContext.Provider value={{ id, describedBy, invalid }}>
        {children}
      </FieldContext.Provider>
      {invalid ? (
        <p className="text-state-danger text-[11.5px]" id={errorId}>
          {error}
        </p>
      ) : describedBy === hintId ? (
        <p className="text-app-dim text-[11.5px]" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
