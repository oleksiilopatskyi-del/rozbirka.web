import { expect, it, vi } from 'vitest'
import type { SubscriptionDto, Tenant } from '../api/types'
import type { MePermissionsDto, TenantAccessSnapshot } from './access-types'
import {
  createTenantTransition,
  type TenantTransitionDependencies,
} from './tenant-transition'
import { tenantResetRegistry } from './tenant-reset-registry'

const tenant = (id: string): Tenant => ({
  id,
  name: `Tenant ${id.toUpperCase()}`,
  slug: id,
  plan: 'active',
  planTier: 'pro',
  city: null,
  logoUrl: null,
  isActive: true,
  createdAt: '2026-08-14T00:00:00.000Z',
  roleName: 'owner',
})

const access = (
  permissions: string[] = ['cars.view', 'billing.view'],
): MePermissionsDto => ({
  role: 'owner',
  permissions,
  features: ['inventory'],
  entitlement: {
    state: subscription.state,
    usage: structuredClone(subscription.usage),
  },
})

const subscription: SubscriptionDto = {
  state: 'active',
  planCode: 'pro',
  planName: 'Pro',
  trialEndsAt: null,
  trialDaysRemaining: null,
  currentPeriodEnd: '2026-09-14T00:00:00.000Z',
  nextChargeAt: '2026-09-14T00:00:00.000Z',
  amount: 4900,
  currency: 'UAH',
  cardLast4: '4242',
  cardBrand: 'visa',
  canSubscribe: false,
  canCancel: true,
  canReactivate: false,
  canActivateTrial: false,
  usage: {
    cars: { used: 1, max: 100 },
    intakes: { used: 2, max: 100 },
    parts: { used: 3, max: 1000 },
    users: { used: 4, max: 10 },
    cashRegisters: { used: 1, max: 2 },
  },
  features: ['inventory'],
}

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const tenantA = tenant('a')
const tenantB = tenant('b')
const tenantC = tenant('c')

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

const managerAccess: MePermissionsDto = {
  role: 'manager',
  permissions: MANAGER_PERMISSIONS,
  features: ['inventory'],
  entitlement: {
    state: 'active',
    usage: structuredClone(subscription.usage),
  },
}

it('clears A before persisting or loading B', async () => {
  const events: string[] = []
  const dependencies: TenantTransitionDependencies = {
    currentScope: () => ({ userId: 'u1', tenantId: tenantA.id }),
    begin: (target) => events.push(`begin:${target.id}`),
    rotateRequests: () => events.push(`rotate:${tenantA.id}`),
    clear: (scope) => {
      events.push(`clear:${scope.tenantId}`)
      return Promise.resolve()
    },
    persistTenant: (tenantId) => events.push(`persist:${tenantId}`),
    loadAccess: () => {
      events.push(`access:${tenantB.id}`)
      return Promise.resolve(access())
    },
    loadSubscription: () => {
      events.push(`subscription:${tenantB.id}`)
      return Promise.resolve(subscription)
    },
    commit: (target) => events.push(`commit:${target.id}`),
    fail: () => events.push('fail'),
  }
  const transition = createTenantTransition(dependencies)

  const result = await transition.transition(tenantB).then((settled) => {
    events.push(`complete:${settled.target.id}`)
    return settled
  })

  expect(events).toEqual([
    'begin:b',
    'rotate:a',
    'clear:a',
    'persist:b',
    'access:b',
    'subscription:b',
    'commit:b',
    'complete:b',
  ])
  expect(result).toMatchObject({
    kind: 'committed',
    target: tenantB,
    snapshot: {
      userId: 'u1',
      tenantId: 'b',
      generation: 1,
      role: 'owner',
      subscription,
    },
  })
  if (result.kind === 'committed') {
    expect([...result.snapshot.permissions]).toEqual([
      'cars.view',
      'billing.view',
    ])
    expect([...result.snapshot.features]).toEqual(['inventory'])
  }
})

it('commits the tenant-scoped server rollout envelope into the immutable access snapshot', async () => {
  const cabinetParityRollout = {
    configuration:
      '{"version":1,"mode":"internal","canaryPercent":0,"emergencyOff":false}',
    claim: {
      version: 1 as const,
      subjectId: 'tenant-42',
      grants: ['cabinet-parity'],
      audiences: ['internal'],
    },
  }
  const transition = createTenantTransition({
    currentScope: () => ({ userId: 'u1', tenantId: tenantA.id }),
    begin: vi.fn(),
    rotateRequests: vi.fn(),
    clear: vi.fn().mockResolvedValue(undefined),
    persistTenant: vi.fn(),
    loadAccess: vi
      .fn()
      .mockResolvedValue({ ...access(['cars.view']), cabinetParityRollout }),
    loadSubscription: vi.fn(),
    commit: vi.fn(),
    fail: vi.fn(),
  })

  const result = await transition.transition(tenantB)

  expect(result).toMatchObject({
    kind: 'committed',
    snapshot: { cabinetParityRollout },
  })
  if (result.kind === 'committed') {
    const envelope = (
      result.snapshot as TenantAccessSnapshot & {
        cabinetParityRollout: typeof cabinetParityRollout
      }
    ).cabinetParityRollout
    expect(Object.isFrozen(envelope)).toBe(true)
    expect(Object.isFrozen(envelope.claim)).toBe(true)
    expect(Object.isFrozen(envelope.claim.grants)).toBe(true)
  }
})

it('never commits B when a newer C transition wins', async () => {
  const accessB = deferred<MePermissionsDto>()
  const accessC = deferred<MePermissionsDto>()
  const accessTargets: string[] = []
  const commits: string[] = []
  let requestedTarget = ''
  const transition = createTenantTransition({
    currentScope: () => ({ userId: 'u1', tenantId: tenantA.id }),
    begin: (target) => {
      requestedTarget = target.id
    },
    rotateRequests: vi.fn(),
    clear: vi.fn().mockResolvedValue(undefined),
    persistTenant: vi.fn(),
    loadAccess: (signal) => {
      const target = requestedTarget
      accessTargets.push(target)
      expect(signal.aborted).toBe(false)
      return target === tenantB.id ? accessB.promise : accessC.promise
    },
    loadSubscription: vi.fn(),
    commit: (target) => commits.push(target.id),
    fail: vi.fn(),
  })

  const b = transition.transition(tenantB)
  await vi.waitFor(() => expect(accessTargets).toEqual(['b']))
  const c = transition.transition(tenantC)
  await vi.waitFor(() => expect(accessTargets).toEqual(['b', 'c']))
  accessC.resolve(access(['cars.view']))
  await expect(c).resolves.toMatchObject({ kind: 'committed', target: tenantC })
  accessB.resolve(access(['cars.view']))

  await expect(b).resolves.toEqual({ kind: 'superseded', target: tenantB })
  expect(commits).toEqual(['c'])
})

it('settles a superseded reset before a newer target can persist or commit', async () => {
  const lateReset = deferred<void>()
  const persisted: string[] = []
  const accessLoads: string[] = []
  const commits: string[] = []
  let resetCalls = 0
  let ownedState = tenantA.id
  const transition = createTenantTransition({
    currentScope: () => ({ userId: 'u1', tenantId: tenantA.id }),
    begin: vi.fn(),
    rotateRequests: vi.fn(),
    clear: async () => {
      resetCalls += 1
      const resetCall = resetCalls
      if (resetCall === 1) await lateReset.promise
      ownedState = `reset:${resetCall}`
    },
    persistTenant: (tenantId) => persisted.push(tenantId),
    loadAccess: () => {
      accessLoads.push(persisted.at(-1) ?? 'none')
      return Promise.resolve(access(['cars.view']))
    },
    loadSubscription: vi.fn(),
    commit: (target) => {
      commits.push(target.id)
      ownedState = target.id
    },
    fail: vi.fn(),
  })

  const b = transition.transition(tenantB)
  await vi.waitFor(() => expect(resetCalls).toBe(1))
  const c = transition.transition(tenantC)
  await Promise.resolve()

  expect(persisted).toEqual([])
  expect(accessLoads).toEqual([])
  expect(commits).toEqual([])
  expect(ownedState).toBe(tenantA.id)

  lateReset.resolve()

  await expect(b).resolves.toEqual({ kind: 'superseded', target: tenantB })
  await expect(c).resolves.toMatchObject({ kind: 'committed', target: tenantC })
  expect(resetCalls).toBe(2)
  expect(persisted).toEqual([tenantC.id])
  expect(accessLoads).toEqual([tenantC.id])
  expect(commits).toEqual([tenantC.id])
  expect(ownedState).toBe(tenantC.id)
})

it('settles an old coordinator reset before a replacement coordinator commits', async () => {
  const lateReset = deferred<void>()
  const events: string[] = []
  let resetCalls = 0
  let ownedState = tenantA.id
  const removeReset = tenantResetRegistry.register(async () => {
    resetCalls += 1
    const resetCall = resetCalls
    events.push(`clear:${resetCall}:start`)
    if (resetCall === 1) await lateReset.promise
    ownedState = `reset:${resetCall}`
    events.push(`clear:${resetCall}:end`)
  })
  const dependencies = (): TenantTransitionDependencies => ({
    currentScope: () => ({ userId: 'u1', tenantId: tenantA.id }),
    begin: vi.fn(),
    rotateRequests: vi.fn(),
    clear: (scope) => tenantResetRegistry.clear(scope),
    persistTenant: (tenantId) => events.push(`persist:${tenantId}`),
    loadAccess: () => Promise.resolve(access(['cars.view'])),
    loadSubscription: vi.fn(),
    commit: (target) => {
      ownedState = target.id
      events.push(`commit:${target.id}`)
    },
    fail: vi.fn(),
  })
  const oldCoordinator = createTenantTransition(dependencies())
  const replacementCoordinator = createTenantTransition(dependencies())
  let oldResult: Promise<unknown> | undefined
  let replacementResult: Promise<unknown> | undefined

  try {
    oldResult = oldCoordinator.transition(tenantB)
    await vi.waitFor(() => expect(events).toContain('clear:1:start'))
    oldCoordinator.invalidate()
    replacementResult = replacementCoordinator.transition(tenantC)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const eventsBeforeRelease = [...events]
    const ownerBeforeRelease = ownedState

    lateReset.resolve()
    const [settledOld, settledReplacement] = await Promise.all([
      oldResult,
      replacementResult,
    ])

    expect(eventsBeforeRelease).toEqual(['clear:1:start'])
    expect(ownerBeforeRelease).toBe(tenantA.id)
    expect(settledOld).toEqual({ kind: 'superseded', target: tenantB })
    expect(settledReplacement).toMatchObject({
      kind: 'committed',
      target: tenantC,
    })
    expect(events).toEqual([
      'clear:1:start',
      'clear:1:end',
      'clear:2:start',
      'clear:2:end',
      'persist:c',
      'commit:c',
    ])
    expect(ownedState).toBe(tenantC.id)
  } finally {
    lateReset.resolve()
    removeReset()
    await Promise.allSettled(
      [oldResult, replacementResult].filter(
        (result): result is Promise<unknown> => result !== undefined,
      ),
    )
  }
})

it('does not restore A content when B bootstrap fails', async () => {
  const offline = new Error('offline')
  const commits: string[] = []
  const failures: { target: Tenant; error: unknown }[] = []
  const transition = createTenantTransition({
    currentScope: () => ({ userId: 'u1', tenantId: tenantA.id }),
    begin: vi.fn(),
    rotateRequests: vi.fn(),
    clear: vi.fn().mockResolvedValue(undefined),
    persistTenant: vi.fn(),
    loadAccess: vi.fn().mockRejectedValue(offline),
    loadSubscription: vi.fn(),
    commit: (target) => commits.push(target.id),
    fail: (target, error) => failures.push({ target, error }),
  })

  const result = await transition.transition(tenantB)

  expect(result).toEqual({ kind: 'error', target: tenantB, error: offline })
  expect(commits).toEqual([])
  expect(failures).toEqual([{ target: tenantB, error: offline }])
})

it('commits Manager entitlement without loading the detailed subscription', async () => {
  let subscriptionLoads = 0
  const transition = createTenantTransition({
    currentScope: () => ({ userId: 'u1', tenantId: tenantA.id }),
    begin: vi.fn(),
    rotateRequests: vi.fn(),
    clear: vi.fn().mockResolvedValue(undefined),
    persistTenant: vi.fn(),
    loadAccess: vi.fn().mockResolvedValue(managerAccess),
    loadSubscription: () => {
      subscriptionLoads += 1
      return Promise.resolve(subscription)
    },
    commit: vi.fn(),
    fail: vi.fn(),
  })

  const result = await transition.transition(tenantB)

  expect(result).toMatchObject({
    kind: 'committed',
    snapshot: {
      role: 'manager',
      entitlement: managerAccess.entitlement,
      subscription: null,
    },
  })
  expect(subscriptionLoads).toBe(0)
})

it('ignores a late B subscription after C commits', async () => {
  const subscriptionB = deferred<SubscriptionDto>()
  const subscriptionTargets: string[] = []
  const commits: string[] = []
  let requestedTarget = ''
  const transition = createTenantTransition({
    currentScope: () => ({ userId: 'u1', tenantId: tenantA.id }),
    begin: (target) => {
      requestedTarget = target.id
    },
    rotateRequests: vi.fn(),
    clear: vi.fn().mockResolvedValue(undefined),
    persistTenant: vi.fn(),
    loadAccess: () =>
      Promise.resolve(
        requestedTarget === tenantB.id ? access() : access(['cars.view']),
      ),
    loadSubscription: (signal) => {
      subscriptionTargets.push(requestedTarget)
      expect(signal.aborted).toBe(false)
      return subscriptionB.promise
    },
    commit: (target) => commits.push(target.id),
    fail: vi.fn(),
  })

  const b = transition.transition(tenantB)
  await vi.waitFor(() => expect(subscriptionTargets).toEqual(['b']))
  const c = transition.transition(tenantC)
  await expect(c).resolves.toMatchObject({ kind: 'committed', target: tenantC })
  subscriptionB.resolve(subscription)

  await expect(b).resolves.toEqual({ kind: 'superseded', target: tenantB })
  expect(commits).toEqual(['c'])
})

it('invalidates pending work on unmount', async () => {
  const accessB = deferred<MePermissionsDto>()
  const commits: string[] = []
  const failures: unknown[] = []
  let transitionSignal: AbortSignal | undefined
  const transition = createTenantTransition({
    currentScope: () => ({ userId: 'u1', tenantId: tenantA.id }),
    begin: vi.fn(),
    rotateRequests: vi.fn(),
    clear: vi.fn().mockResolvedValue(undefined),
    persistTenant: vi.fn(),
    loadAccess: (signal) => {
      transitionSignal = signal
      return accessB.promise
    },
    loadSubscription: vi.fn(),
    commit: (target) => commits.push(target.id),
    fail: (_target, error) => failures.push(error),
  })

  const pending = transition.transition(tenantB)
  await vi.waitFor(() => expect(transitionSignal).toBeDefined())
  transition.invalidate()
  accessB.resolve(access(['cars.view']))

  await expect(pending).resolves.toEqual({
    kind: 'superseded',
    target: tenantB,
  })
  expect(transitionSignal?.aborted).toBe(true)
  expect(commits).toEqual([])
  expect(failures).toEqual([])
})

it('deduplicates concurrent transitions to the same tenant', async () => {
  const accessB = deferred<MePermissionsDto>()
  let begins = 0
  let accessLoads = 0
  const transition = createTenantTransition({
    currentScope: () => ({ userId: 'u1', tenantId: tenantA.id }),
    begin: () => {
      begins += 1
    },
    rotateRequests: vi.fn(),
    clear: vi.fn().mockResolvedValue(undefined),
    persistTenant: vi.fn(),
    loadAccess: () => {
      accessLoads += 1
      return accessB.promise
    },
    loadSubscription: vi.fn(),
    commit: vi.fn(),
    fail: vi.fn(),
  })

  const first = transition.transition(tenantB)
  const duplicate = transition.transition(tenantB)

  expect(duplicate).toBe(first)
  accessB.resolve(access(['cars.view']))
  await expect(first).resolves.toMatchObject({ kind: 'committed' })
  expect(begins).toBe(1)
  expect(accessLoads).toBe(1)
})

it('prevents runtime mutation of committed permission and feature sets', async () => {
  const loadedAccess = access(['cars.view'])
  const transition = createTenantTransition({
    currentScope: () => ({ userId: 'u1', tenantId: tenantA.id }),
    begin: vi.fn(),
    rotateRequests: vi.fn(),
    clear: vi.fn().mockResolvedValue(undefined),
    persistTenant: vi.fn(),
    loadAccess: vi.fn().mockResolvedValue(loadedAccess),
    loadSubscription: vi.fn(),
    commit: vi.fn(),
    fail: vi.fn(),
  })

  const result = await transition.transition(tenantB)
  if (result.kind !== 'committed') {
    throw new Error(`Expected a committed transition, received ${result.kind}`)
  }

  expect(() =>
    (result.snapshot.permissions as Set<string>).add('team.manage'),
  ).toThrow(TypeError)
  expect(() =>
    (result.snapshot.features as Set<string>).add('mutated-feature'),
  ).toThrow(TypeError)

  loadedAccess.permissions.push('orders.manage')
  loadedAccess.features.push('source-mutation')

  expect([...result.snapshot.permissions]).toEqual(['cars.view'])
  expect([...result.snapshot.features]).toEqual(['inventory'])
})

it('defensively clones and deeply freezes the entitlement snapshot', async () => {
  const loadedAccess = access(['cars.view'])
  const transition = createTenantTransition({
    currentScope: () => ({ userId: 'u1', tenantId: tenantA.id }),
    begin: vi.fn(),
    rotateRequests: vi.fn(),
    clear: vi.fn().mockResolvedValue(undefined),
    persistTenant: vi.fn(),
    loadAccess: vi.fn().mockResolvedValue(loadedAccess),
    loadSubscription: vi.fn(),
    commit: vi.fn(),
    fail: vi.fn(),
  })

  const result = await transition.transition(tenantB)
  if (result.kind !== 'committed' || result.snapshot.entitlement === null) {
    throw new Error('Expected a committed transition with entitlement')
  }
  const entitlement = result.snapshot.entitlement

  expect(() => {
    ;(entitlement as { state: string }).state = 'blocked'
  }).toThrow(TypeError)
  expect(() => {
    ;(entitlement.usage.cars as { used: number }).used = 999
  }).toThrow(TypeError)

  if (
    loadedAccess.entitlement === null ||
    loadedAccess.entitlement === undefined
  ) {
    throw new Error('Expected source entitlement')
  }
  loadedAccess.entitlement.state = 'blocked'
  loadedAccess.entitlement.usage.cars.used = 500

  expect(entitlement).toMatchObject({
    state: 'active',
    usage: { cars: { used: 1, max: 100 } },
  })
})

it('defensively clones and deeply freezes the subscription snapshot', async () => {
  const loadedSubscription = structuredClone(subscription)
  const transition = createTenantTransition({
    currentScope: () => ({ userId: 'u1', tenantId: tenantA.id }),
    begin: vi.fn(),
    rotateRequests: vi.fn(),
    clear: vi.fn().mockResolvedValue(undefined),
    persistTenant: vi.fn(),
    loadAccess: vi.fn().mockResolvedValue(access()),
    loadSubscription: vi.fn().mockResolvedValue(loadedSubscription),
    commit: vi.fn(),
    fail: vi.fn(),
  })

  const result = await transition.transition(tenantB)
  if (result.kind !== 'committed' || result.snapshot.subscription === null) {
    throw new Error('Expected a committed transition with subscription')
  }
  const snapshotSubscription = result.snapshot.subscription as SubscriptionDto

  expect(() => {
    snapshotSubscription.planName = 'Mutated plan'
  }).toThrow(TypeError)
  expect(() => {
    snapshotSubscription.usage.cars.used = 999
  }).toThrow(TypeError)
  expect(() => snapshotSubscription.features.push('mutated-feature')).toThrow(
    TypeError,
  )

  loadedSubscription.planName = 'Changed at source'
  loadedSubscription.usage.cars.used = 500
  loadedSubscription.features.push('source-mutation')

  expect(result.snapshot.subscription).toMatchObject({
    planName: 'Pro',
    usage: { cars: { used: 1, max: 100 } },
    features: ['inventory'],
  })
})

it('reports cleanup failure before target persistence or access loading', async () => {
  const cleanupFailure = new Error('cleanup failed')
  const persisted: string[] = []
  const accessLoads: string[] = []
  const failures: unknown[] = []
  const transition = createTenantTransition({
    currentScope: () => ({ userId: 'u1', tenantId: tenantA.id }),
    begin: vi.fn(),
    rotateRequests: vi.fn(),
    clear: vi.fn().mockRejectedValue(cleanupFailure),
    persistTenant: (tenantId) => persisted.push(tenantId),
    loadAccess: () => {
      accessLoads.push('access')
      return Promise.resolve(access(['cars.view']))
    },
    loadSubscription: vi.fn(),
    commit: vi.fn(),
    fail: (_target, error) => failures.push(error),
  })

  const result = await transition.transition(tenantB)

  expect(result).toEqual({
    kind: 'error',
    target: tenantB,
    error: cleanupFailure,
  })
  expect(persisted).toEqual([])
  expect(accessLoads).toEqual([])
  expect(failures).toEqual([cleanupFailure])
})

it('reports persistence failure without loading or committing target access', async () => {
  const persistenceFailure = new Error('preference write failed')
  const accessLoads: string[] = []
  const commits: string[] = []
  const failures: unknown[] = []
  const transition = createTenantTransition({
    currentScope: () => ({ userId: 'u1', tenantId: tenantA.id }),
    begin: vi.fn(),
    rotateRequests: vi.fn(),
    clear: vi.fn().mockResolvedValue(undefined),
    persistTenant: () => {
      throw persistenceFailure
    },
    loadAccess: () => {
      accessLoads.push('access')
      return Promise.resolve(access(['cars.view']))
    },
    loadSubscription: vi.fn(),
    commit: (target) => commits.push(target.id),
    fail: (_target, error) => failures.push(error),
  })

  const result = await transition.transition(tenantB)

  expect(result).toEqual({
    kind: 'error',
    target: tenantB,
    error: persistenceFailure,
  })
  expect(accessLoads).toEqual([])
  expect(commits).toEqual([])
  expect(failures).toEqual([persistenceFailure])
})

it('suppresses a stale cleanup failure after a newer transition commits', async () => {
  const staleCleanup = deferred<void>()
  const staleFailure = new Error('late cleanup failure')
  const persisted: string[] = []
  const commits: string[] = []
  const failures: unknown[] = []
  let cleanupCalls = 0
  const transition = createTenantTransition({
    currentScope: () => ({ userId: 'u1', tenantId: tenantA.id }),
    begin: vi.fn(),
    rotateRequests: vi.fn(),
    clear: () => {
      cleanupCalls += 1
      return cleanupCalls === 1 ? staleCleanup.promise : Promise.resolve()
    },
    persistTenant: (tenantId) => persisted.push(tenantId),
    loadAccess: vi.fn().mockResolvedValue(access(['cars.view'])),
    loadSubscription: vi.fn(),
    commit: (target) => commits.push(target.id),
    fail: (_target, error) => failures.push(error),
  })

  const b = transition.transition(tenantB)
  await vi.waitFor(() => expect(cleanupCalls).toBe(1))
  const c = transition.transition(tenantC)
  staleCleanup.reject(staleFailure)

  await expect(b).resolves.toEqual({ kind: 'superseded', target: tenantB })
  await expect(c).resolves.toMatchObject({ kind: 'committed', target: tenantC })
  expect(persisted).toEqual(['c'])
  expect(commits).toEqual(['c'])
  expect(failures).toEqual([])
})
