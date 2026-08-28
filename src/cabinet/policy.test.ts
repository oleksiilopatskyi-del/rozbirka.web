import { FEATURES, type SubscriptionDto } from '../api/types'
import { cabinetModules, type CabinetModuleDefinition } from './module-registry'
import type {
  TenantAccessSnapshot,
  TenantAccessState,
  TenantEntitlementDto,
} from './access-types'
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
  entitlement: tenantEntitlement,
  role = 'owner',
}: {
  permissions?: string[]
  features?: string[]
  subscription?: SubscriptionDto | null
  entitlement?: TenantEntitlementDto | null
  role?: string
} = {}): TenantAccessState => {
  const entitlement =
    tenantEntitlement === undefined
      ? tenantSubscription === null
        ? null
        : {
            state: tenantSubscription.state,
            usage: tenantSubscription.usage,
          }
      : tenantEntitlement
  const snapshot: TenantAccessSnapshot = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    generation: 1,
    role,
    permissions: new Set(permissions),
    features: new Set(features),
    entitlement,
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

const intakesModule: CabinetModuleDefinition = {
  key: 'intakes',
  routeSegment: '/intakes',
  released: true,
  viewPermission: 'intakes.view',
  mutationPermission: 'intakes.manage',
  allowedSubscriptionStates: ['trial', 'active', 'pastDue', 'cancelled'],
  quotaResource: 'intakes',
}

const MANAGER_PERMISSIONS = [
  'cars.view',
  'cars.manage',
  'parts.view',
  'parts.manage',
  'orders.view',
  'orders.manage',
  'customers.view',
  'customers.manage',
  'finance.view',
  'team.view',
  'intakes.view',
  'intakes.manage',
  'stickers.manage',
  'reports.view',
  'reports.manage',
]

const MASTER_PERMISSIONS = [
  'parts.view',
  'orders.view',
  'orders.manage',
  'intakes.view',
  'intakes.manage',
  'stickers.manage',
]

const readyWithEntitlement = ({
  role,
  permissions,
  state = 'active',
  usage = subscription().usage,
}: {
  role: string
  permissions: string[]
  state?: SubscriptionDto['state']
  usage?: SubscriptionDto['usage']
}): TenantAccessState => {
  return ready({
    role,
    permissions,
    subscription: null,
    entitlement: { state, usage },
  })
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

const rolloutAccess = (
  configuration: string | undefined,
  {
    grants = ['cabinet-parity'],
    audiences = [],
    subjectId = 'tenant-42',
  }: {
    grants?: string[]
    audiences?: string[]
    subjectId?: string
  } = {},
): TenantAccessState => {
  const access = ready({
    permissions: ['team.view', 'billing.view', 'reports.view'],
    features: [FEATURES.TeamCollaboration, FEATURES.AdvancedReports],
  })
  if (configuration === undefined) return access
  if (access.status !== 'ready') throw new Error('expected ready access')

  return {
    status: 'ready',
    snapshot: {
      ...access.snapshot,
      cabinetParityRollout: {
        configuration,
        claim: { version: 1, subjectId, grants, audiences },
      },
    },
    error: null,
  }
}

const rolloutConfiguration = (
  mode: 'off' | 'internal' | 'canary' | 'on',
  canaryPercent = 0,
  emergencyOff = false,
) => JSON.stringify({ version: 1, mode, canaryPercent, emergencyOff })

describe('evaluateModuleAccess', () => {
  it('allows a missing envelope only when explicit v1 compatibility is enabled', () => {
    expect(
      evaluateModuleAccess(
        cabinetModules.team,
        rolloutAccess(undefined),
        'view',
        { version: 1, allowMissingEnvelope: true },
      ),
    ).toEqual({ kind: 'allowed' })

    expect(
      evaluateModuleAccess(
        cabinetModules.team,
        rolloutAccess(undefined),
        'view',
        { version: 1, allowMissingEnvelope: false },
      ),
    ).toEqual({ kind: 'unreleased' })
  })

  it.each([
    ['off', rolloutConfiguration('off'), [], { kind: 'unreleased' }],
    [
      'internal without server audience',
      rolloutConfiguration('internal'),
      [],
      { kind: 'unreleased' },
    ],
    [
      'internal with server audience',
      rolloutConfiguration('internal'),
      ['internal'],
      { kind: 'allowed' },
    ],
    [
      'canary outside fixed cohort',
      rolloutConfiguration('canary', 82),
      [],
      { kind: 'unreleased' },
    ],
    [
      'canary inside fixed cohort',
      rolloutConfiguration('canary', 83),
      [],
      { kind: 'allowed' },
    ],
    ['on', rolloutConfiguration('on'), [], { kind: 'allowed' }],
    [
      'emergency off',
      rolloutConfiguration('on', 100, true),
      [],
      { kind: 'unreleased' },
    ],
  ] as const)(
    '%s gates a parity route at shared policy boundary',
    (_name, configuration, audiences, expected) => {
      expect(
        evaluateModuleAccess(
          cabinetModules.team,
          rolloutAccess(configuration, { audiences: [...audiences] }),
          'view',
        ),
      ).toEqual(expected)
    },
  )

  it('fails closed when the configured server envelope omits its grant', () => {
    expect(
      evaluateModuleAccess(
        cabinetModules.team,
        rolloutAccess(rolloutConfiguration('on'), { grants: [] }),
        'view',
      ),
    ).toEqual({ kind: 'unreleased' })
  })

  it.each([
    ['off', rolloutConfiguration('off')],
    ['emergency off', rolloutConfiguration('on', 100, true)],
  ] as const)(
    '%s preserves pre-initiative account routes while gating new parity routes',
    (_name, configuration) => {
      const access = rolloutAccess(configuration)

      for (const key of ['billing', 'plans', 'payments', 'profile'] as const) {
        expect(
          evaluateModuleAccess(cabinetModules[key], access, 'view'),
        ).toEqual({ kind: 'allowed' })
      }

      for (const key of ['team', 'reports', 'business'] as const) {
        expect(
          evaluateModuleAccess(cabinetModules[key], access, 'view'),
        ).toEqual({ kind: 'unreleased' })
      }
    },
  )

  it('gates every newly released parity surface with the same configured policy', () => {
    const disabled = rolloutAccess(rolloutConfiguration('off'))
    const enabled = rolloutAccess(rolloutConfiguration('on'))

    for (const key of ['team', 'reports', 'business'] as const) {
      expect(
        evaluateModuleAccess(cabinetModules[key], disabled, 'view'),
      ).toEqual({ kind: 'unreleased' })
      expect(
        evaluateModuleAccess(cabinetModules[key], enabled, 'view'),
      ).toEqual({ kind: 'allowed' })
    }
  })

  it('allows an active built-in Manager to view cars without billing.view', () => {
    expect(MANAGER_PERMISSIONS).not.toContain('billing.view')

    expect(
      evaluateModuleAccess(
        carsModule,
        readyWithEntitlement({
          role: 'manager',
          permissions: MANAGER_PERMISSIONS,
        }),
        'view',
      ),
    ).toEqual({ kind: 'allowed' })
  })

  it('reports a blocked Manager entitlement without billing.view', () => {
    expect(
      evaluateModuleAccess(
        carsModule,
        readyWithEntitlement({
          role: 'manager',
          permissions: MANAGER_PERMISSIONS,
          state: 'blocked',
        }),
        'view',
      ),
    ).toEqual({ kind: 'subscription-blocked', state: 'blocked' })
  })

  it('lets a quota-full built-in Master read but denies a consuming mutation', () => {
    expect(MASTER_PERMISSIONS).not.toContain('billing.view')
    const access = readyWithEntitlement({
      role: 'master',
      permissions: MASTER_PERMISSIONS,
      usage: {
        ...subscription().usage,
        intakes: { used: 25, max: 25 },
      },
    })

    expect(evaluateModuleAccess(intakesModule, access, 'view')).toEqual({
      kind: 'allowed',
    })
    expect(evaluateModuleAccess(intakesModule, access, 'mutation')).toEqual({
      kind: 'quota-exhausted',
      resource: 'intakes',
      used: 25,
      max: 25,
    })
  })

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

  it('fails closed when entitlement data required by a module is absent', () => {
    expect(
      evaluateModuleAccess(carsModule, ready({ entitlement: null }), 'view'),
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

  it('publishes only the implemented business modules', () => {
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
      reports: true,
      team: true,
      business: true,
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
