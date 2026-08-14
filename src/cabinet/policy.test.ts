import { FEATURES, type SubscriptionDto } from '../api/types'
import { cabinetModules, type CabinetModuleDefinition } from './module-registry'
import type { TenantAccessSnapshot, TenantAccessState } from './access-types'
import { evaluateModuleAccess } from './policy'

const subscription = (
  overrides: Partial<SubscriptionDto> = {},
): SubscriptionDto => ({
  state: 'active',
  planCode: 'pro',
  planName: 'Pro',
  trialEndsAt: null,
  trialDaysRemaining: null,
  currentPeriodEnd: null,
  nextChargeAt: null,
  amount: 4900,
  currency: 'UAH',
  cardLast4: '4242',
  cardBrand: 'visa',
  canSubscribe: false,
  canCancel: true,
  canReactivate: false,
  canActivateTrial: false,
  usage: {
    cars: { used: 1, max: 10 },
    intakes: { used: 1, max: 10 },
    parts: { used: 1, max: 10 },
    users: { used: 1, max: 10 },
    cashRegisters: { used: 1, max: 10 },
  },
  features: [],
  ...overrides,
})

const ready = ({
  permissions = ['cars.view', 'cars.manage', 'reports.view'],
  features = [FEATURES.AdvancedReports],
  subscription: tenantSubscription = subscription(),
  role = 'owner',
}: {
  permissions?: string[]
  features?: string[]
  subscription?: SubscriptionDto | null
  role?: string
} = {}): TenantAccessState => {
  const snapshot: TenantAccessSnapshot = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    generation: 1,
    role,
    permissions: new Set(permissions),
    features: new Set(features),
    subscription: tenantSubscription,
  }

  return { status: 'ready', snapshot, error: null }
}

const carsModule: CabinetModuleDefinition = {
  key: 'cars',
  routeSegment: '/cars',
  released: true,
  viewPermission: 'cars.view',
  mutationPermission: 'cars.manage',
  allowedSubscriptionStates: ['trial', 'active', 'pastDue', 'cancelled'],
  quotaResource: 'cars',
}

const reportsModule: CabinetModuleDefinition = {
  key: 'reports',
  routeSegment: '/reports',
  released: true,
  viewPermission: 'reports.view',
  requiredFeature: FEATURES.AdvancedReports,
  allowedSubscriptionStates: ['trial', 'active', 'pastDue', 'cancelled'],
}

const unreleasedModule: CabinetModuleDefinition = {
  ...carsModule,
  key: 'parts',
  routeSegment: '/parts',
  released: false,
}

const loadingAccess: TenantAccessState = {
  status: 'loading',
  snapshot: null,
  error: null,
}

const failedAccess: TenantAccessState = {
  status: 'error',
  snapshot: null,
  error: new Error('offline'),
}

describe('evaluateModuleAccess', () => {
  it.each([
    [
      'loading access before checking release',
      unreleasedModule,
      loadingAccess,
      'view' as const,
      { kind: 'access-loading' },
    ],
    [
      'access errors before checking release',
      unreleasedModule,
      failedAccess,
      'view' as const,
      { kind: 'access-error' },
    ],
    [
      'unreleased',
      unreleasedModule,
      ready({
        permissions: [],
        features: [],
        subscription: subscription({ state: 'blocked' }),
      }),
      'view' as const,
      { kind: 'unreleased' },
    ],
    [
      'missing permission',
      carsModule,
      ready({ permissions: [], features: [] }),
      'view' as const,
      { kind: 'permission-denied' },
    ],
    [
      'missing feature',
      reportsModule,
      ready({ features: [] }),
      'view' as const,
      {
        kind: 'feature-unavailable',
        feature: FEATURES.AdvancedReports,
      },
    ],
    [
      'blocked plan',
      carsModule,
      ready({ subscription: subscription({ state: 'blocked' }) }),
      'view' as const,
      { kind: 'subscription-blocked', state: 'blocked' },
    ],
    [
      'full quota read',
      carsModule,
      ready({
        subscription: subscription({
          usage: {
            ...subscription().usage,
            cars: { used: 10, max: 10 },
          },
        }),
      }),
      'view' as const,
      { kind: 'allowed' },
    ],
    [
      'full quota create',
      carsModule,
      ready({
        subscription: subscription({
          usage: {
            ...subscription().usage,
            cars: { used: 10, max: 10 },
          },
        }),
      }),
      'mutation' as const,
      { kind: 'quota-exhausted', resource: 'cars', used: 10, max: 10 },
    ],
  ])('%s', (_name, definition, access, operation, expected) => {
    expect(evaluateModuleAccess(definition, access, operation)).toMatchObject(
      expected,
    )
  })

  it('requires explicit mutation permission even when an owner can view', () => {
    expect(
      evaluateModuleAccess(
        carsModule,
        ready({ permissions: ['cars.view'], role: 'owner' }),
        'mutation',
      ),
    ).toEqual({ kind: 'permission-denied' })
  })

  it.each([
    ['trial', { kind: 'allowed' }],
    ['active', { kind: 'allowed' }],
    ['pastDue', { kind: 'allowed' }],
    ['cancelled', { kind: 'allowed' }],
    ['none', { kind: 'subscription-blocked', state: 'none' }],
    ['blocked', { kind: 'subscription-blocked', state: 'blocked' }],
  ] as const)('%s subscription', (state, expected) => {
    expect(
      evaluateModuleAccess(
        carsModule,
        ready({ subscription: subscription({ state }) }),
        'view',
      ),
    ).toEqual(expected)
  })

  it('requires mutation authority and enforces quota for controls', () => {
    expect(
      evaluateModuleAccess(
        carsModule,
        ready({ permissions: ['cars.view'] }),
        'control',
      ),
    ).toEqual({ kind: 'permission-denied' })

    expect(
      evaluateModuleAccess(
        carsModule,
        ready({
          subscription: subscription({
            usage: {
              ...subscription().usage,
              cars: { used: 10, max: 10 },
            },
          }),
        }),
        'control',
      ),
    ).toEqual({
      kind: 'quota-exhausted',
      resource: 'cars',
      used: 10,
      max: 10,
    })
  })

  it.each([
    [
      'permission before feature',
      reportsModule,
      ready({
        permissions: [],
        features: [],
        subscription: subscription({ state: 'blocked' }),
      }),
      'view' as const,
      { kind: 'permission-denied' },
    ],
    [
      'feature before subscription',
      reportsModule,
      ready({
        permissions: ['reports.view'],
        features: [],
        subscription: subscription({ state: 'blocked' }),
      }),
      'view' as const,
      {
        kind: 'feature-unavailable',
        feature: FEATURES.AdvancedReports,
      },
    ],
    [
      'subscription before quota',
      carsModule,
      ready({
        subscription: subscription({
          state: 'blocked',
          usage: {
            ...subscription().usage,
            cars: { used: 10, max: 10 },
          },
        }),
      }),
      'control' as const,
      { kind: 'subscription-blocked', state: 'blocked' },
    ],
  ])('%s', (_name, definition, access, operation, expected) => {
    expect(evaluateModuleAccess(definition, access, operation)).toEqual(
      expected,
    )
  })

  it('fails closed when subscription data required by a module is absent', () => {
    expect(
      evaluateModuleAccess(carsModule, ready({ subscription: null }), 'view'),
    ).toEqual({ kind: 'access-error' })
  })

  it.each([
    ['none', subscription({ state: 'none' })],
    ['blocked', subscription({ state: 'blocked' })],
    ['missing', null],
  ] as const)(
    'keeps billing recovery available when subscription data is %s',
    (_name, billingSubscription) => {
      expect(
        evaluateModuleAccess(
          cabinetModules.billing,
          ready({
            permissions: ['billing.view'],
            subscription: billingSubscription,
          }),
          'view',
        ),
      ).toEqual({ kind: 'allowed' })
    },
  )
})

describe('cabinetModules', () => {
  it('publishes the exact cabinet child route contract without duplicates', () => {
    const routeSegments = Object.values(cabinetModules)
      .map((definition) => definition.routeSegment)
      .sort()

    expect(routeSegments).toEqual([
      '/cars',
      '/cash',
      '/customers',
      '/dashboard',
      '/intakes',
      '/orders',
      '/parts',
      '/reports',
      '/settings/billing/overview',
      '/settings/billing/payments',
      '/settings/billing/plans',
      '/settings/business',
      '/settings/profile',
      '/stickers',
      '/team',
    ])
    expect(new Set(routeSegments).size).toBe(routeSegments.length)
  })

  it('gives every released navigation item presentation metadata', () => {
    const releasedNavigationItems = Object.values(cabinetModules).filter(
      (definition) =>
        definition.released && definition.navigation !== undefined,
    )

    expect(releasedNavigationItems.length).toBeGreaterThan(0)
    expect(
      releasedNavigationItems.every(
        (definition) =>
          definition.navigation?.label.trim() !== '' &&
          definition.navigation?.icon !== undefined &&
          (definition.navigation?.placement === 'primary' ||
            definition.navigation?.placement === 'account'),
      ),
    ).toBe(true)
  })

  it('keeps business modules unavailable until they are released', () => {
    expect(
      Object.fromEntries(
        Object.entries(cabinetModules).map(([key, definition]) => [
          key,
          definition.released,
        ]),
      ),
    ).toMatchObject({
      cars: false,
      intakes: false,
      parts: false,
      stickers: false,
      orders: false,
      customers: false,
      cash: false,
      reports: false,
      team: false,
      business: false,
    })
  })

  it.each([
    'cars',
    'intakes',
    'parts',
    'stickers',
    'orders',
    'customers',
    'cash',
    'reports',
    'team',
    'business',
  ] as const)('%s owns the exact entitled subscription states', (key) => {
    expect(cabinetModules[key].allowedSubscriptionStates).toEqual([
      'trial',
      'active',
      'pastDue',
      'cancelled',
    ])
  })
})
