import { resolvePostLoginDestination } from '@/auth/post-login'

export const planCodes = [
  'lite_monthly',
  'pro_monthly',
  'enterprise_monthly',
] as const

export type PlanCode = (typeof planCodes)[number]

export function isPlanCode(value: string | null): value is PlanCode {
  return planCodes.includes(value as PlanCode)
}

export function readPlanCode(search: string): PlanCode | null {
  const value = new URLSearchParams(search).get('plan')
  return isPlanCode(value) ? value : null
}

export function loginPathForPlan(planCode: PlanCode): string {
  return `/login?plan=${planCode}`
}

export function accountPathForPlan(planCode: PlanCode): string {
  return `/account?section=plans&plan=${planCode}`
}

export function postAuthPath(search: string, fallback: string): string {
  return resolvePostLoginDestination(search, fallback)
}
