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

// === Billing (rozbirka.core, feature/subscriptions) ===

export type BillingState =
  | 'none'
  | 'trial'
  | 'active'
  | 'pastDue'
  | 'cancelled'
  | 'blocked'

export type PaymentType = 'checkout' | 'recurring' | 'verification'
export type PaymentStatus = 'pending' | 'success' | 'failed' | 'reversed'

export interface SubscriptionDto {
  state: BillingState
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

export interface ApiError {
  code?: string
  message?: string
}
