import {
  BadgeDollarSign,
  BarChart3,
  Building2,
  Car,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Package,
  ReceiptText,
  ScanLine,
  Sticker,
  UserRound,
  UserRoundCog,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'
import {
  FEATURES,
  type BillingState,
  type FeatureCode,
  type PlanUsageDto,
} from '../api/types'
import type { Permission } from './access-types'

export type CabinetModuleKey =
  | 'dashboard'
  | 'cars'
  | 'parts'
  | 'orders'
  | 'customers'
  | 'cash'
  | 'team'
  | 'intakes'
  | 'stickers'
  | 'reports'
  | 'billing'
  | 'plans'
  | 'payments'
  | 'profile'
  | 'business'

export type QuotaResource = keyof PlanUsageDto

export interface CabinetNavigationItem {
  label: string
  icon: LucideIcon
  placement: 'primary' | 'account'
}

export interface CabinetModuleDefinition {
  key: CabinetModuleKey
  routeSegment: string
  released: boolean
  viewPermission?: Permission
  mutationPermission?: Permission
  requiredFeature?: FeatureCode
  allowedSubscriptionStates?: readonly BillingState[]
  quotaResource?: QuotaResource
  navigation?: CabinetNavigationItem
}

const BUSINESS_SUBSCRIPTION_STATES = [
  'trial',
  'active',
  'pastDue',
  'cancelled',
] as const satisfies readonly BillingState[]

export const cabinetModules: Readonly<
  Record<CabinetModuleKey, CabinetModuleDefinition>
> = {
  dashboard: {
    key: 'dashboard',
    routeSegment: '/dashboard',
    released: true,
    navigation: {
      label: 'Головна',
      icon: LayoutDashboard,
      placement: 'primary',
    },
  },
  cars: {
    key: 'cars',
    routeSegment: '/cars',
    released: false,
    viewPermission: 'cars.view',
    mutationPermission: 'cars.manage',
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    quotaResource: 'cars',
    navigation: { label: 'Автомобілі', icon: Car, placement: 'primary' },
  },
  parts: {
    key: 'parts',
    routeSegment: '/parts',
    released: false,
    viewPermission: 'parts.view',
    mutationPermission: 'parts.manage',
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    quotaResource: 'parts',
    navigation: { label: 'Запчастини', icon: Package, placement: 'primary' },
  },
  orders: {
    key: 'orders',
    routeSegment: '/orders',
    released: false,
    viewPermission: 'orders.view',
    mutationPermission: 'orders.manage',
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    navigation: {
      label: 'Замовлення',
      icon: ClipboardList,
      placement: 'primary',
    },
  },
  customers: {
    key: 'customers',
    routeSegment: '/customers',
    released: false,
    viewPermission: 'customers.view',
    mutationPermission: 'customers.manage',
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    navigation: { label: 'Клієнти', icon: Users, placement: 'primary' },
  },
  cash: {
    key: 'cash',
    routeSegment: '/cash',
    released: false,
    viewPermission: 'finance.view',
    mutationPermission: 'finance.manage',
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    quotaResource: 'cashRegisters',
    navigation: { label: 'Фінанси', icon: WalletCards, placement: 'primary' },
  },
  team: {
    key: 'team',
    routeSegment: '/team',
    released: false,
    viewPermission: 'team.view',
    mutationPermission: 'team.manage',
    requiredFeature: FEATURES.TeamCollaboration,
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    quotaResource: 'users',
    navigation: { label: 'Команда', icon: UserRoundCog, placement: 'primary' },
  },
  intakes: {
    key: 'intakes',
    routeSegment: '/intakes',
    released: false,
    viewPermission: 'intakes.view',
    mutationPermission: 'intakes.manage',
    requiredFeature: FEATURES.IntakeManagement,
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    quotaResource: 'intakes',
    navigation: { label: 'Приймання', icon: ScanLine, placement: 'primary' },
  },
  stickers: {
    key: 'stickers',
    routeSegment: '/stickers',
    released: false,
    viewPermission: 'parts.view',
    mutationPermission: 'stickers.manage',
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    navigation: { label: 'Стікери', icon: Sticker, placement: 'primary' },
  },
  reports: {
    key: 'reports',
    routeSegment: '/reports',
    released: false,
    viewPermission: 'reports.view',
    mutationPermission: 'reports.manage',
    requiredFeature: FEATURES.AdvancedReports,
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    navigation: { label: 'Звіти', icon: BarChart3, placement: 'primary' },
  },
  billing: {
    key: 'billing',
    routeSegment: '/settings/billing/overview',
    released: true,
    viewPermission: 'billing.view',
    mutationPermission: 'billing.manage',
    navigation: {
      label: 'Підписка',
      icon: CreditCard,
      placement: 'account',
    },
  },
  plans: {
    key: 'plans',
    routeSegment: '/settings/billing/plans',
    released: true,
    viewPermission: 'billing.view',
    mutationPermission: 'billing.manage',
    navigation: {
      label: 'Тарифи',
      icon: BadgeDollarSign,
      placement: 'account',
    },
  },
  payments: {
    key: 'payments',
    routeSegment: '/settings/billing/payments',
    released: true,
    viewPermission: 'billing.view',
    mutationPermission: 'billing.manage',
    navigation: {
      label: 'Платежі',
      icon: ReceiptText,
      placement: 'account',
    },
  },
  profile: {
    key: 'profile',
    routeSegment: '/settings/profile',
    released: true,
    navigation: {
      label: 'Профіль',
      icon: UserRound,
      placement: 'account',
    },
  },
  business: {
    key: 'business',
    routeSegment: '/settings/business',
    released: true,
    viewPermission: 'team.view',
    mutationPermission: 'team.manage',
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    navigation: {
      label: 'Бізнес',
      icon: Building2,
      placement: 'account',
    },
  },
}
