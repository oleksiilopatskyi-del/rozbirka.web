import { expect, it, vi } from 'vitest'
import type { SubscriptionDto, Tenant } from '../api/types'
import type { MePermissionsDto } from './access-types'
import {
  createTenantTransition,
  type TenantTransitionDependencies,
} from './tenant-transition'

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

it('skips subscription loading without billing.view', async () => {
  let subscriptionLoads = 0
  const transition = createTenantTransition({
    currentScope: () => ({ userId: 'u1', tenantId: tenantA.id }),
    begin: vi.fn(),
    rotateRequests: vi.fn(),
    clear: vi.fn().mockResolvedValue(undefined),
    persistTenant: vi.fn(),
    loadAccess: vi.fn().mockResolvedValue(access(['cars.view'])),
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
    snapshot: { subscription: null },
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
