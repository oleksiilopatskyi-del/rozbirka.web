import {
  BadgeDollarSign,
  BarChart3,
  Building2,
  Car,
  ClipboardCheck,
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
  | 'inventory'
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

/** Sections of the cabinet sidebar, in the order the work actually happens. */
export type CabinetNavigationGroup =
  | 'overview'
  | 'stock'
  | 'sales'
  | 'money'
  | 'settings'

export interface CabinetNavigationItem {
  label: string
  icon: LucideIcon
  placement: 'primary' | 'account'
  group: CabinetNavigationGroup
  /**
   * Order in the mobile tab bar, lowest first; the first few fit, the rest move
   * under "Ще". Registry order is not usage order, so this is explicit.
   */
  mobilePriority?: number
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
  rollout?: 'cabinet-parity-v1'
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
      group: 'overview',
      mobilePriority: 1,
    },
  },
  cars: {
    key: 'cars',
    routeSegment: '/cars',
    released: true,
    viewPermission: 'cars.view',
    mutationPermission: 'cars.manage',
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    quotaResource: 'cars',
    navigation: {
      label: 'Автомобілі',
      icon: Car,
      placement: 'primary',
      group: 'stock',
      mobilePriority: 5,
    },
  },
  parts: {
    key: 'parts',
    routeSegment: '/parts',
    released: true,
    viewPermission: 'parts.view',
    mutationPermission: 'parts.manage',
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    quotaResource: 'parts',
    navigation: {
      label: 'Запчастини',
      icon: Package,
      placement: 'primary',
      group: 'stock',
      mobilePriority: 2,
    },
  },
  inventory: {
    key: 'inventory',
    routeSegment: '/inventory',
    released: true,
    viewPermission: 'inventory.view',
    mutationPermission: 'inventory.manage',
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    navigation: {
      label: 'Інвентаризація',
      icon: ClipboardCheck,
      placement: 'primary',
      group: 'stock',
      mobilePriority: 7,
    },
  },
  orders: {
    key: 'orders',
    routeSegment: '/orders',
    released: true,
    viewPermission: 'orders.view',
    mutationPermission: 'orders.manage',
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    navigation: {
      label: 'Замовлення',
      icon: ClipboardList,
      placement: 'primary',
      group: 'sales',
      mobilePriority: 3,
    },
  },
  customers: {
    key: 'customers',
    routeSegment: '/customers',
    released: true,
    viewPermission: 'customers.view',
    mutationPermission: 'customers.manage',
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    navigation: {
      label: 'Клієнти',
      icon: Users,
      placement: 'primary',
      group: 'sales',
      mobilePriority: 8,
    },
  },
  cash: {
    key: 'cash',
    routeSegment: '/cash',
    released: true,
    viewPermission: 'finance.view',
    mutationPermission: 'finance.manage',
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    quotaResource: 'cashRegisters',
    navigation: {
      label: 'Фінанси',
      icon: WalletCards,
      placement: 'primary',
      group: 'money',
      mobilePriority: 4,
    },
  },
  team: {
    key: 'team',
    routeSegment: '/team',
    released: true,
    rollout: 'cabinet-parity-v1',
    viewPermission: 'team.view',
    mutationPermission: 'team.manage',
    requiredFeature: FEATURES.TeamCollaboration,
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    quotaResource: 'users',
    navigation: {
      label: 'Команда',
      icon: UserRoundCog,
      placement: 'account',
      group: 'settings',
    },
  },
  intakes: {
    key: 'intakes',
    routeSegment: '/intakes',
    released: true,
    viewPermission: 'intakes.view',
    mutationPermission: 'intakes.manage',
    requiredFeature: FEATURES.IntakeManagement,
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    quotaResource: 'intakes',
    navigation: {
      label: 'Приймання',
      icon: ScanLine,
      placement: 'primary',
      group: 'stock',
      mobilePriority: 6,
    },
  },
  stickers: {
    key: 'stickers',
    routeSegment: '/stickers',
    released: true,
    viewPermission: 'parts.view',
    mutationPermission: 'stickers.manage',
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    navigation: {
      label: 'Стікери',
      icon: Sticker,
      placement: 'primary',
      group: 'stock',
      mobilePriority: 7,
    },
  },
  reports: {
    key: 'reports',
    routeSegment: '/reports',
    released: true,
    rollout: 'cabinet-parity-v1',
    viewPermission: 'reports.view',
    mutationPermission: 'reports.manage',
    requiredFeature: FEATURES.AdvancedReports,
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    navigation: {
      label: 'Звіти',
      icon: BarChart3,
      placement: 'primary',
      group: 'money',
      mobilePriority: 9,
    },
  },
  billing: {
    key: 'billing',
    routeSegment: '/settings/billing/overview',
    released: true,
    viewPermission: 'billing.view',
    mutationPermission: 'billing.manage',
    navigation: {
      label: 'Підписка',
      group: 'settings',
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
      group: 'settings',
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
      group: 'settings',
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
      group: 'settings',
      icon: UserRound,
      placement: 'account',
    },
  },
  business: {
    key: 'business',
    routeSegment: '/settings/business',
    released: true,
    rollout: 'cabinet-parity-v1',
    viewPermission: 'team.view',
    mutationPermission: 'team.manage',
    allowedSubscriptionStates: BUSINESS_SUBSCRIPTION_STATES,
    navigation: {
      label: 'Бізнес',
      group: 'settings',
      icon: Building2,
      placement: 'account',
    },
  },
}
