import type { PublicPlanDto } from '@/api/types'
import type { PlanCode } from '@/lib/plan-selection'

export interface LandingPlan {
  code: PlanCode
  name: 'Lite' | 'Pro' | 'Enterprise'
  price: string
  period: 'місяць'
  trialDays: 14
  description: string
  perks: string[]
  ctaLabel: string
  variant: 'lite' | 'pro' | 'enterprise'
}

export const FALLBACK_LANDING_PLANS: readonly LandingPlan[] = [
  {
    code: 'lite_monthly',
    name: 'Lite',
    price: '$19',
    period: 'місяць',
    trialDays: 14,
    description: 'Старт для маленької розбірки',
    perks: ['3 авто', '100 запчастин', '1 користувач, 1 каса'],
    ctaLabel: 'Обрати',
    variant: 'lite',
  },
  {
    code: 'pro_monthly',
    name: 'Pro',
    price: '$59',
    period: 'місяць',
    trialDays: 14,
    description: 'Все необхідне, щоб масштабувати продажі',
    perks: [
      '20 авто, 2 000 запчастин',
      '5 користувачів, 2 каси',
      'Партії, звіти та QR-коди',
    ],
    ctaLabel: 'Почати 14 днів безкоштовно',
    variant: 'pro',
  },
  {
    code: 'enterprise_monthly',
    name: 'Enterprise',
    price: '$299',
    period: 'місяць',
    trialDays: 14,
    description: 'Для розбірок без обмежень каталогу',
    perks: [
      'Без лімітів на авто та запчастини',
      'Без лімітів на користувачів і каси',
      'Партії, звіти, команда та QR-коди',
    ],
    ctaLabel: 'Обрати',
    variant: 'enterprise',
  },
] as const

const order: PlanCode[] = ['lite_monthly', 'pro_monthly', 'enterprise_monthly']

const featureContract = [
  'intake_management',
  'multi_cash_registers',
  'qr_codes',
  'reports.advanced',
  'team_collaboration',
] as const

const contracts = {
  lite_monthly: {
    amount: 19,
    features: [] as string[],
    limits: {
      cars: 3,
      intakes: 0,
      parts: 100,
      users: 1,
      cashRegisters: 1,
      photosPerPart: null,
    },
  },
  pro_monthly: {
    amount: 59,
    features: featureContract,
    limits: {
      cars: 20,
      intakes: 25,
      parts: 2000,
      users: 5,
      cashRegisters: 2,
      photosPerPart: null,
    },
  },
  enterprise_monthly: {
    amount: 299,
    features: featureContract,
    limits: {
      cars: null,
      intakes: null,
      parts: null,
      users: null,
      cashRegisters: null,
      photosPerPart: null,
    },
  },
} as const

function isPublicPlan(value: unknown): value is PublicPlanDto {
  if (!value || typeof value !== 'object') return false
  const plan = value as Partial<PublicPlanDto>
  return (
    typeof plan.code === 'string' &&
    typeof plan.name === 'string' &&
    typeof plan.amount === 'number' &&
    plan.currency === 'USD' &&
    plan.interval === '1m' &&
    plan.trialDays === 14 &&
    !!plan.limits &&
    typeof plan.limits === 'object' &&
    Array.isArray(plan.features) &&
    plan.features.every((feature) => typeof feature === 'string')
  )
}

function mapPlan(plan: PublicPlanDto): LandingPlan | null {
  if (!(plan.code in contracts)) return null
  const code = plan.code as PlanCode
  const fallback = FALLBACK_LANDING_PLANS.find(
    (candidate) => candidate.code === code,
  )
  const contract = contracts[code]
  const limitsMatch = Object.entries(contract.limits).every(
    ([key, value]) =>
      plan.limits[key as keyof PublicPlanDto['limits']] === value,
  )
  const expectedFeatures = [...contract.features].sort()
  const featuresMatch =
    plan.features.length === contract.features.length &&
    [...plan.features]
      .sort()
      .every((feature, index) => feature === expectedFeatures[index])

  if (fallback === undefined) return null
  if (
    plan.name !== fallback.name ||
    plan.amount !== contract.amount ||
    !limitsMatch ||
    !featuresMatch
  ) {
    return null
  }

  return { ...fallback, price: `$${plan.amount}` }
}

export function resolveLandingPlans(value: unknown): readonly LandingPlan[] {
  if (!Array.isArray(value)) return FALLBACK_LANDING_PLANS
  const mapped = value
    .filter(isPublicPlan)
    .map(mapPlan)
    .filter((plan): plan is LandingPlan => plan !== null)
  if (mapped.length !== order.length) return FALLBACK_LANDING_PLANS
  const byCode = new Map(mapped.map((plan) => [plan.code, plan]))
  if (byCode.size !== order.length) return FALLBACK_LANDING_PLANS
  return order.map((code) => byCode.get(code)!)
}
