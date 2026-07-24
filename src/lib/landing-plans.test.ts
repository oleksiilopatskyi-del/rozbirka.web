import { describe, expect, it } from 'vitest'
import { FALLBACK_LANDING_PLANS, resolveLandingPlans } from './landing-plans'

export const apiPlans = [
  {
    code: 'lite_monthly',
    name: 'Lite',
    amount: 19,
    currency: 'USD',
    interval: '1m',
    trialDays: 14,
    limits: {
      cars: 3,
      intakes: 0,
      parts: 100,
      users: 1,
      cashRegisters: 1,
      photosPerPart: null,
    },
    features: [],
  },
  {
    code: 'pro_monthly',
    name: 'Pro',
    amount: 59,
    currency: 'USD',
    interval: '1m',
    trialDays: 14,
    limits: {
      cars: 20,
      intakes: 25,
      parts: 2000,
      users: 5,
      cashRegisters: 2,
      photosPerPart: null,
    },
    features: [
      'intake_management',
      'reports.advanced',
      'team_collaboration',
      'multi_cash_registers',
      'qr_codes',
    ],
  },
  {
    code: 'enterprise_monthly',
    name: 'Enterprise',
    amount: 299,
    currency: 'USD',
    interval: '1m',
    trialDays: 14,
    limits: {
      cars: null,
      intakes: null,
      parts: null,
      users: null,
      cashRegisters: null,
      photosPerPart: null,
    },
    features: [
      'intake_management',
      'reports.advanced',
      'team_collaboration',
      'multi_cash_registers',
      'qr_codes',
    ],
  },
]

describe('landing plan contract', () => {
  it('maps the complete validated API catalog in canonical order', () => {
    expect(resolveLandingPlans([...apiPlans].reverse())).toEqual([
      expect.objectContaining({
        code: 'lite_monthly',
        price: '$19',
        trialDays: 14,
        perks: ['3 авто', '100 запчастин', '1 користувач, 1 каса'],
      }),
      expect.objectContaining({
        code: 'pro_monthly',
        price: '$59',
        trialDays: 14,
        perks: [
          '20 авто, 2 000 запчастин',
          '5 користувачів, 2 каси',
          'Партії, звіти та QR-коди',
        ],
      }),
      expect.objectContaining({
        code: 'enterprise_monthly',
        price: '$299',
        trialDays: 14,
        perks: [
          'Без лімітів на авто та запчастини',
          'Без лімітів на користувачів і каси',
          'Партії, звіти, команда та QR-коди',
        ],
      }),
    ])
  })

  it('falls back when any required plan is missing or malformed', () => {
    expect(resolveLandingPlans(apiPlans.slice(0, 2))).toEqual(
      FALLBACK_LANDING_PLANS,
    )
    expect(
      resolveLandingPlans([...apiPlans, { ...apiPlans[1]!, trialDays: 7 }]),
    ).toEqual(FALLBACK_LANDING_PLANS)
    expect(resolveLandingPlans(null)).toEqual(FALLBACK_LANDING_PLANS)
  })

  it('never maps unsupported product claims', () => {
    const text = JSON.stringify(resolveLandingPlans(apiPlans))
    expect(text).not.toMatch(
      /api access|multi-location|priority support|analytics|bulk export/i,
    )
  })
})
