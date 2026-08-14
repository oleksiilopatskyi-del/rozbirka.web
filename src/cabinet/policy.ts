import type { BillingState } from '../api/types'
import type { TenantAccessState } from './access-types'
import type { CabinetModuleDefinition, QuotaResource } from './module-registry'

export type ModuleAccessOperation = 'view' | 'control' | 'mutation'

export type ModuleAccessDecision =
  | { kind: 'allowed' }
  | { kind: 'unreleased' }
  | { kind: 'permission-denied' }
  | { kind: 'feature-unavailable'; feature: string }
  | { kind: 'subscription-blocked'; state: BillingState }
  | {
      kind: 'quota-exhausted'
      resource: QuotaResource
      used: number
      max: number
    }
  | { kind: 'access-loading' }
  | { kind: 'access-error' }

export class ModuleAccessDeniedError extends Error {
  readonly decision: Exclude<ModuleAccessDecision, { kind: 'allowed' }>

  constructor(decision: Exclude<ModuleAccessDecision, { kind: 'allowed' }>) {
    super(`Module mutation denied: ${decision.kind}`)
    this.name = 'ModuleAccessDeniedError'
    this.decision = decision
  }
}

export const evaluateModuleAccess = (
  definition: CabinetModuleDefinition,
  access: TenantAccessState,
  operation: ModuleAccessOperation,
): ModuleAccessDecision => {
  if (access.status === 'loading') {
    return { kind: 'access-loading' }
  }

  if (access.status === 'error') {
    return { kind: 'access-error' }
  }

  if (!definition.released) {
    return { kind: 'unreleased' }
  }

  const consumesResource = operation !== 'view'
  const requiredPermission = consumesResource
    ? definition.mutationPermission
    : definition.viewPermission

  if (
    (consumesResource && requiredPermission === undefined) ||
    (requiredPermission !== undefined &&
      !access.snapshot.permissions.has(requiredPermission))
  ) {
    return { kind: 'permission-denied' }
  }

  if (
    definition.requiredFeature !== undefined &&
    !access.snapshot.features.has(definition.requiredFeature)
  ) {
    return {
      kind: 'feature-unavailable',
      feature: definition.requiredFeature,
    }
  }

  if (definition.allowedSubscriptionStates !== undefined) {
    const { subscription } = access.snapshot
    if (subscription === null) {
      return { kind: 'access-error' }
    }

    if (!definition.allowedSubscriptionStates.includes(subscription.state)) {
      return { kind: 'subscription-blocked', state: subscription.state }
    }
  }

  if (consumesResource && definition.quotaResource !== undefined) {
    const subscription = access.snapshot.subscription
    if (subscription === null) {
      return { kind: 'access-error' }
    }

    const usage = subscription.usage[definition.quotaResource]
    if (usage.max !== null && usage.used >= usage.max) {
      return {
        kind: 'quota-exhausted',
        resource: definition.quotaResource,
        used: usage.used,
        max: usage.max,
      }
    }
  }

  return { kind: 'allowed' }
}

export const requireModuleMutation = (
  decision: ModuleAccessDecision,
): Extract<ModuleAccessDecision, { kind: 'allowed' }> => {
  if (decision.kind !== 'allowed') {
    throw new ModuleAccessDeniedError(decision)
  }

  return decision
}
