import type { SubscriptionDto, Tenant } from '../api/types'
import type { MePermissionsDto, TenantAccessSnapshot } from './access-types'

export type TenantTransitionResult =
  | {
      kind: 'committed'
      target: Tenant
      snapshot: TenantAccessSnapshot
    }
  | { kind: 'superseded'; target: Tenant }
  | { kind: 'error'; target: Tenant; error: unknown }

export interface TenantTransitionDependencies {
  currentScope(): { userId: string; tenantId: string | null }
  begin(target: Tenant, generation: number): void
  rotateRequests(): void
  clear(scope: { userId: string; tenantId: string }): Promise<void>
  persistTenant(tenantId: string): void
  loadAccess(signal: AbortSignal): Promise<MePermissionsDto>
  loadSubscription(signal: AbortSignal): Promise<SubscriptionDto>
  commit(target: Tenant, snapshot: TenantAccessSnapshot): void
  fail(target: Tenant, error: unknown): void
}

interface ActiveTransition {
  targetId: string
  generation: number
  controller: AbortController
  promise: Promise<TenantTransitionResult>
}

export const createTenantTransition = (
  dependencies: TenantTransitionDependencies,
) => {
  let generation = 0
  let active: ActiveTransition | null = null

  const transition = (target: Tenant): Promise<TenantTransitionResult> => {
    if (active?.targetId === target.id) {
      return active.promise
    }

    generation += 1
    const transitionGeneration = generation
    active?.controller.abort('tenant-transition-superseded')
    const controller = new AbortController()

    const isCurrent = () =>
      generation === transitionGeneration && !controller.signal.aborted

    const run = async (): Promise<TenantTransitionResult> => {
      try {
        const scope = dependencies.currentScope()
        dependencies.begin(target, transitionGeneration)
        dependencies.rotateRequests()

        if (scope.tenantId !== null) {
          await dependencies.clear({
            userId: scope.userId,
            tenantId: scope.tenantId,
          })
          if (!isCurrent()) {
            return { kind: 'superseded', target }
          }
        }

        dependencies.persistTenant(target.id)
        const loadedAccess = await dependencies.loadAccess(controller.signal)
        if (!isCurrent()) {
          return { kind: 'superseded', target }
        }

        let loadedSubscription: SubscriptionDto | null = null
        if (loadedAccess.permissions.includes('billing.view')) {
          loadedSubscription = await dependencies.loadSubscription(
            controller.signal,
          )
          if (!isCurrent()) {
            return { kind: 'superseded', target }
          }
        }

        const snapshot: TenantAccessSnapshot = Object.freeze({
          userId: scope.userId,
          tenantId: target.id,
          generation: transitionGeneration,
          role: loadedAccess.role,
          permissions: new Set(loadedAccess.permissions),
          features: new Set(loadedAccess.features),
          subscription: loadedSubscription,
        })

        dependencies.commit(target, snapshot)
        return { kind: 'committed', target, snapshot }
      } catch (error: unknown) {
        if (!isCurrent()) {
          return { kind: 'superseded', target }
        }
        dependencies.fail(target, error)
        return { kind: 'error', target, error }
      }
    }

    const promise = run().then((result) => {
      if (active?.generation === transitionGeneration) {
        active = null
      }
      return result
    })
    active = {
      targetId: target.id,
      generation: transitionGeneration,
      controller,
      promise,
    }
    return promise
  }

  const invalidate = () => {
    generation += 1
    active?.controller.abort('tenant-transition-invalidated')
    active = null
  }

  return { transition, invalidate }
}
