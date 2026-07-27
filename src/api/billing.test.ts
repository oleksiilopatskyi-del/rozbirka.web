import { describe, expect, it } from 'vitest'
import { billingApi } from './billing'

describe('billingApi', () => {
  it('does not expose manual trial activation', () => {
    expect(billingApi).not.toHaveProperty('activateTrial')
  })
})
