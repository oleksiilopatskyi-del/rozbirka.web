import type { components as CoreComponents } from '../api/generated/core'
import type { SubscriptionDto } from '../api/types'
import type { CabinetParityRolloutEnvelopeV1 } from '../config/cabinet-feature-flags'

export const ALL_PERMISSIONS = [
  'cars.view',
  'cars.manage',
  'parts.view',
  'parts.manage',
  'orders.view',
  'orders.manage',
  'customers.view',
  'customers.manage',
  'finance.view',
  'finance.manage',
  'team.view',
  'team.manage',
  'intakes.view',
  'intakes.manage',
  'stickers.manage',
  'reports.view',
  'reports.manage',
  'billing.view',
  'billing.manage',
] as const

/** Canonical permissions accepted when authoring the cabinet registry. */
export type Permission = (typeof ALL_PERMISSIONS)[number]

export type CoreMePermissionsDto = CoreComponents['schemas']['MePermissionsDto']

/**
 * The generated Core response, with the one temporary relaxation required while
 * older Core deployments can still omit the rollout envelope.
 */
export type MePermissionsDto = Omit<
  CoreMePermissionsDto,
  'cabinetParityRollout'
> & {
  cabinetParityRollout?: CoreMePermissionsDto['cabinetParityRollout'] | null
}

export type TenantEntitlementDto = NonNullable<MePermissionsDto['entitlement']>

type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T

export type TenantSubscriptionSnapshot = DeepReadonly<SubscriptionDto>
export type TenantEntitlementSnapshot = DeepReadonly<TenantEntitlementDto>

/** Effective tenant-scoped access, preserving permissions unknown to this client. */
export interface TenantAccessSnapshot {
  readonly userId: string
  readonly tenantId: string
  readonly generation: number
  readonly role: string
  readonly permissions: ReadonlySet<string>
  readonly features: ReadonlySet<string>
  readonly entitlement: TenantEntitlementSnapshot | null
  readonly subscription: TenantSubscriptionSnapshot | null
  readonly cabinetParityRollout?: DeepReadonly<CabinetParityRolloutEnvelopeV1> | null
}

export type TenantAccessState =
  | { status: 'loading'; snapshot: null; error: null }
  | { status: 'ready'; snapshot: TenantAccessSnapshot; error: null }
  | { status: 'error'; snapshot: null; error: unknown }
