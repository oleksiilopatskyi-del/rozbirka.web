import type { SubscriptionDto } from '../api/types'

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

export interface MePermissionsDto {
  role: string
  permissions: string[]
  features: string[]
}

type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T

export type TenantSubscriptionSnapshot = DeepReadonly<SubscriptionDto>

/** Effective tenant-scoped access, preserving permissions unknown to this client. */
export interface TenantAccessSnapshot {
  readonly userId: string
  readonly tenantId: string
  readonly generation: number
  readonly role: string
  readonly permissions: ReadonlySet<string>
  readonly features: ReadonlySet<string>
  readonly subscription: TenantSubscriptionSnapshot | null
}

export type TenantAccessState =
  | { status: 'loading'; snapshot: null; error: null }
  | { status: 'ready'; snapshot: TenantAccessSnapshot; error: null }
  | { status: 'error'; snapshot: null; error: unknown }
