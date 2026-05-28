// === Auth (rozbirka.identity) ===

export interface SendOtpRequest {
  phone: string
}

export interface SendOtpResponse {
  retryAfterSeconds: number
  cooldownSeconds: number
}

export interface VerifyOtpRequest {
  phone: string
  code: string
}

export interface VerifyUser {
  id: string
  phone: string
  displayName: string
}

export interface OtpVerifyResponse {
  accessToken: string
  refreshToken: string
  user: VerifyUser
  isNewUser: boolean
}

export interface RefreshResponse {
  accessToken: string
  refreshToken: string
}

export type UserRole = 'owner' | 'manager' | 'master' | string

export interface User {
  id: string
  phone: string | null
  displayName: string
  role: UserRole
  isActive: boolean
  lastLoginAt: string | null
}

// === Tenants (rozbirka.core) ===

export type TenantPlan = 'trial' | 'active' | 'blocked' | string

export interface Tenant {
  id: string
  name: string
  slug: string
  plan: TenantPlan
  planTier: string
  city: string | null
  logoUrl: string | null
  isActive: boolean
  createdAt: string
  roleName: string | null
}

export interface CreateTenantRequest {
  tenantName: string
  city?: string
  logoUrl?: string
}

export interface CreateTenantResponse {
  tenantId: string
  name: string
  slug: string
  plan: TenantPlan
  planTier: string
  isActive: boolean
}

// === Billing (rozbirka.core, feature/subscriptions) ===
// Source of truth: rozbirka.core/docs/billing-integration.md

export type BillingState =
  | 'none'
  | 'trial'
  | 'active'
  | 'pastDue'
  | 'cancelled'
  | 'blocked'

export type PaymentType = 'checkout' | 'recurring' | 'verification'
export type PaymentStatus =
  | 'pending'
  | 'success'
  | 'failed'
  | 'reversed'
  | 'cancelled'

export interface LimitUsageDto {
  used: number
  max: number | null
}

export interface PlanUsageDto {
  cars: LimitUsageDto
  intakes: LimitUsageDto
  parts: LimitUsageDto
  users: LimitUsageDto
  cashRegisters: LimitUsageDto
}

export interface SubscriptionDto {
  state: BillingState
  planCode: string | null
  planName: string | null
  trialEndsAt: string | null
  trialDaysRemaining: number | null
  currentPeriodEnd: string | null
  nextChargeAt: string | null
  amount: number | null
  currency: string | null
  cardLast4: string | null
  cardBrand: string | null
  canSubscribe: boolean
  canCancel: boolean
  canReactivate: boolean
  /** Show "Activate free trial" CTA — true only if trial never used + no live sub. */
  canActivateTrial: boolean
  usage: PlanUsageDto
  features: string[]
}

export interface SubscribeRequest {
  /** Plan code from /billing/plans. Omit to use backend default (Pro). */
  planCode?: string
}

export interface CheckoutResponse {
  checkoutUrl: string
}

export interface PaymentDto {
  id: string
  amount: number
  currency: string
  type: PaymentType
  status: PaymentStatus
  createdAt: string
  providerInvoiceId: string | null
  /** Set only on Pending Checkout rows — resume an interrupted checkout. */
  checkoutUrl: string | null
  /** ISO date when the Mono pay page stops accepting payments. */
  checkoutExpiresAt: string | null
}

export interface PagedResult<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface CancelRequest {
  reason?: string
}

export interface PublicPlanLimits {
  cars: number | null
  intakes: number | null
  parts: number | null
  users: number | null
  cashRegisters: number | null
  photosPerPart: number | null
}

export interface PublicPlanDto {
  code: string
  name: string
  amount: number
  currency: string
  interval: string
  trialDays: number
  limits: PublicPlanLimits
  features: string[]
}

// Canonical feature codes
export const FEATURES = {
  IntakeManagement: 'intake_management',
  AdvancedReports: 'reports.advanced',
  BulkExport: 'bulk_export',
  TeamCollaboration: 'team_collaboration',
  AdvancedAnalytics: 'advanced_analytics',
  CompatSuggest: 'compat_suggest',
  MultiCashRegisters: 'multi_cash_registers',
  ExtendedPhotos: 'extended_photos',
  ApiAccess: 'api_access',
  MultiLocation: 'multi_location',
  PrioritySupport: 'priority_support',
  WhiteLabel: 'white_label',
} as const

export type FeatureCode = (typeof FEATURES)[keyof typeof FEATURES]

export interface ApiError {
  code?: string
  message?: string
}
