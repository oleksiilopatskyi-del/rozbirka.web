import { describe, expect, it } from 'vitest'
import {
  accountPathForPlan,
  isPlanCode,
  loginPathForPlan,
  postAuthPath,
  readPlanCode,
} from './plan-selection'

describe('plan selection', () => {
  it.each(['pro_monthly', 'enterprise_monthly'])(
    'accepts supported plan %s',
    (planCode) => {
      expect(isPlanCode(planCode)).toBe(true)
      expect(readPlanCode(`?plan=${planCode}`)).toBe(planCode)
    },
  )

  it('rejects missing and unknown plan codes', () => {
    expect(readPlanCode('')).toBeNull()
    expect(readPlanCode('?plan=unknown')).toBeNull()
    expect(readPlanCode('?plan=lite_monthly')).toBeNull()
  })

  it('builds stable login and account destinations', () => {
    expect(loginPathForPlan('pro_monthly')).toBe('/login?plan=pro_monthly')
    expect(accountPathForPlan('pro_monthly')).toBe(
      '/account?section=plans&plan=pro_monthly',
    )
  })

  it('uses the account plans destination only for a valid requested plan', () => {
    expect(postAuthPath('?plan=pro_monthly', '/account')).toBe(
      '/account?section=plans&plan=pro_monthly',
    )
    expect(postAuthPath('?plan=unknown', '/account')).toBe('/account')
  })

  it('falls back to account instead of an unsafe post-auth destination', () => {
    expect(postAuthPath('', 'https://evil.example/x')).toBe('/account')
  })
})
