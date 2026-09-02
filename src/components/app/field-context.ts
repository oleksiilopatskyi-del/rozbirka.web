import { createContext, useContext } from 'react'

export interface FieldControlContext {
  id: string
  describedBy: string | undefined
  invalid: boolean
}

export const FieldContext = createContext<FieldControlContext | null>(null)

/**
 * Wiring a control inside `<Field>` picks up: label association, hint/error
 * description and the invalid flag. Outside a Field it returns nothing, so the
 * inputs stay usable on their own.
 */
export function useFieldControl(): {
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: true
} {
  const field = useContext(FieldContext)
  if (field === null) return {}

  return {
    id: field.id,
    ...(field.describedBy === undefined
      ? {}
      : { 'aria-describedby': field.describedBy }),
    ...(field.invalid ? { 'aria-invalid': true as const } : {}),
  }
}
