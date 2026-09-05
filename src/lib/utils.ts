import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Ukrainian counts take three forms: 1 деталь, 2 деталі, 5 деталей. Screens
 * that write a count next to a noun need all three or they read as machine
 * output.
 */
export function plural(count: number, forms: [string, string, string]) {
  const rest = Math.abs(count) % 100
  if (rest >= 11 && rest <= 14) return forms[2]
  if (rest % 10 === 1) return forms[0]
  if (rest % 10 >= 2 && rest % 10 <= 4) return forms[1]
  return forms[2]
}
