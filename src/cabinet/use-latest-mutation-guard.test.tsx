import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURES } from '../api/types'
import { cabinetModules } from './module-registry'
import { ModuleAccessDeniedError } from './policy'
import { tenantRequestScope } from './tenant-request-scope'
import { useLatestMutationGuard } from './use-latest-mutation-guard'

const cabinetContext = vi.hoisted(() => ({ useCabinet: vi.fn() }))

vi.mock('./CabinetContext', () => ({ useCabinet: cabinetContext.useCabinet }))

const usage = {
  cars: { used: 1, max: 10 },
  intakes: { used: 1, max: 10 },
  parts: { used: 1, max: 10 },
  users: { used: 1, max: 10 },
  cashRegisters: { used: 1, max: 10 },
}

const readyCabinet = () => ({
  status: 'ready',
  targetTenant: { id: 'tenant-1', slug: 'yard' },
  snapshot: {
    userId: 'user-1',
    tenantId: 'tenant-1',
    generation: 7,
    role: 'owner',
    permissions: new Set(['parts.view', 'parts.manage']),
    features: new Set<string>(),
    entitlement: { state: 'active', usage: structuredClone(usage) },
    subscription: null,
    cabinetParityRollout: null,
  },
  error: null,
  retry: vi.fn(),
  switchTenant: vi.fn(),
})

describe('useLatestMutationGuard', () => {
  let cabinet: ReturnType<typeof readyCabinet>

  beforeEach(() => {
    cabinet = readyCabinet()
    cabinetContext.useCabinet.mockReturnValue(cabinet)
  })

  afterEach(() => {
    tenantRequestScope.rotate()
    vi.clearAllMocks()
  })

  it('returns the current tenant dispatch scope when access is still allowed', () => {
    const { result } = renderHook(() =>
      useLatestMutationGuard(cabinetModules.parts),
    )

    expect(result.current.requireLatestMutation()).toEqual({
      signal: tenantRequestScope.signal,
      tenantId: 'tenant-1',
      generation: 7,
    })
  })

  it('blocks dispatch when the latest permission is revoked without a rerender', () => {
    const { result } = renderHook(() =>
      useLatestMutationGuard(cabinetModules.parts),
    )
    cabinet.snapshot.permissions.delete('parts.manage')

    expect(() => result.current.requireLatestMutation()).toThrow(
      expect.objectContaining<Partial<ModuleAccessDeniedError>>({
        decision: { kind: 'permission-denied' },
      }),
    )
  })

  it('blocks dispatch when the rendered tenant generation is stale', () => {
    const { result } = renderHook(() =>
      useLatestMutationGuard(cabinetModules.parts),
    )
    cabinet.snapshot.generation = 8

    expect(() => result.current.requireLatestMutation()).toThrow(
      ModuleAccessDeniedError,
    )
  })

  it('fails closed when the target tenant no longer matches the snapshot', () => {
    const { result } = renderHook(() =>
      useLatestMutationGuard(cabinetModules.parts),
    )
    cabinet.targetTenant.id = 'tenant-2'

    expect(() => result.current.requireLatestMutation()).toThrow(
      expect.objectContaining<Partial<ModuleAccessDeniedError>>({
        decision: { kind: 'access-loading' },
      }),
    )
  })

  it('fails closed when the active user changes without a rerender', () => {
    const { result } = renderHook(() =>
      useLatestMutationGuard(cabinetModules.parts),
    )
    cabinet.snapshot.userId = 'user-2'

    expect(() => result.current.requireLatestMutation()).toThrow(
      expect.objectContaining<Partial<ModuleAccessDeniedError>>({
        decision: { kind: 'access-loading' },
      }),
    )
  })

  it('fails closed when cabinet access is no longer ready', () => {
    const { result } = renderHook(() =>
      useLatestMutationGuard(cabinetModules.parts),
    )
    ;(cabinet as { status: string }).status = 'loading'

    expect(() => result.current.requireLatestMutation()).toThrow(
      expect.objectContaining<Partial<ModuleAccessDeniedError>>({
        decision: { kind: 'access-loading' },
      }),
    )
  })

  it('blocks dispatch after the rendered tenant request scope rotates', () => {
    const { result } = renderHook(() =>
      useLatestMutationGuard(cabinetModules.parts),
    )
    tenantRequestScope.rotate()

    expect(() => result.current.requireLatestMutation()).toThrow(
      ModuleAccessDeniedError,
    )
  })

  it('rechecks quota for creates but permits unmetered updates', () => {
    const { result } = renderHook(() =>
      useLatestMutationGuard(cabinetModules.parts),
    )
    cabinet.snapshot.entitlement.usage.parts.used = 10

    expect(() => result.current.requireLatestMutation()).toThrow(
      expect.objectContaining<Partial<ModuleAccessDeniedError>>({
        decision: {
          kind: 'quota-exhausted',
          resource: 'parts',
          used: 10,
          max: 10,
        },
      }),
    )
    expect(
      result.current.requireLatestMutation({ quota: false }),
    ).toMatchObject({ tenantId: 'tenant-1', generation: 7 })
  })

  it('supports a stricter operation-specific permission override', () => {
    const { result } = renderHook(() =>
      useLatestMutationGuard(cabinetModules.parts),
    )

    expect(() =>
      result.current.requireLatestMutation({ permission: 'finance.manage' }),
    ).toThrow(
      expect.objectContaining<Partial<ModuleAccessDeniedError>>({
        decision: { kind: 'permission-denied' },
      }),
    )
  })

  it('rechecks required feature access immediately before dispatch', () => {
    const definition = {
      ...cabinetModules.parts,
      requiredFeature: FEATURES.ExtendedPhotos,
    }
    const { result } = renderHook(() => useLatestMutationGuard(definition))

    expect(() => result.current.requireLatestMutation()).toThrow(
      expect.objectContaining<Partial<ModuleAccessDeniedError>>({
        decision: {
          kind: 'feature-unavailable',
          feature: FEATURES.ExtendedPhotos,
        },
      }),
    )
  })

  it('rechecks rollout access immediately before dispatch', () => {
    const definition = {
      ...cabinetModules.parts,
      rollout: 'cabinet-parity-v1' as const,
    }
    const { result } = renderHook(() => useLatestMutationGuard(definition))

    expect(() => result.current.requireLatestMutation()).toThrow(
      expect.objectContaining<Partial<ModuleAccessDeniedError>>({
        decision: { kind: 'unreleased' },
      }),
    )
  })

  it('rechecks blocked subscription access immediately before dispatch', () => {
    const { result } = renderHook(() =>
      useLatestMutationGuard(cabinetModules.parts),
    )
    cabinet.snapshot.entitlement.state = 'blocked'

    expect(() => result.current.requireLatestMutation()).toThrow(
      expect.objectContaining<Partial<ModuleAccessDeniedError>>({
        decision: { kind: 'subscription-blocked', state: 'blocked' },
      }),
    )
  })
})
