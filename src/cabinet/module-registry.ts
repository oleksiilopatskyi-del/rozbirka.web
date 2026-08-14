import {
  BadgeDollarSign,
  BarChart3,
  Building2,
  Car,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LogOut,
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
import { FEATURES, type FeatureCode, type PlanUsageDto } from '../api/types'
import type { Permission } from './access-types'

export type CabinetModuleKey =
  | 'dashboard'
  | 'cars'
  | 'parts'
  | 'orders'
  | 'customers'
  | 'finance'
  | 'team'
  | 'intakes'
  | 'stickers'
  | 'reports'
  | 'billing'
  | 'plans'
  | 'payments'
  | 'profile'
  | 'logout'
  | 'onboarding'
  | 'tenant-switching'

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
  subscriptionRequired?: boolean
  quotaResource?: QuotaResource
  navigation?: CabinetNavigationItem
}

export const cabinetModules: Readonly<
  Record<CabinetModuleKey, CabinetModuleDefinition>
> = {
  dashboard: {
    key: 'dashboard',
    routeSegment: 'dashboard',
    released: true,
    navigation: {
      label: 'Головна',
      icon: LayoutDashboard,
      placement: 'primary',
    },
  },
  cars: {
    key: 'cars',
    routeSegment: 'cars',
    released: false,
    viewPermission: 'cars.view',
    mutationPermission: 'cars.manage',
    subscriptionRequired: true,
    quotaResource: 'cars',
    navigation: { label: 'Автомобілі', icon: Car, placement: 'primary' },
  },
  parts: {
    key: 'parts',
    routeSegment: 'parts',
    released: false,
    viewPermission: 'parts.view',
    mutationPermission: 'parts.manage',
    subscriptionRequired: true,
    quotaResource: 'parts',
    navigation: { label: 'Запчастини', icon: Package, placement: 'primary' },
  },
  orders: {
    key: 'orders',
    routeSegment: 'orders',
    released: false,
    viewPermission: 'orders.view',
    mutationPermission: 'orders.manage',
    subscriptionRequired: true,
    navigation: {
      label: 'Замовлення',
      icon: ClipboardList,
      placement: 'primary',
    },
  },
  customers: {
    key: 'customers',
    routeSegment: 'customers',
    released: false,
    viewPermission: 'customers.view',
    mutationPermission: 'customers.manage',
    subscriptionRequired: true,
    navigation: { label: 'Клієнти', icon: Users, placement: 'primary' },
  },
  finance: {
    key: 'finance',
    routeSegment: 'finance',
    released: false,
    viewPermission: 'finance.view',
    mutationPermission: 'finance.manage',
    subscriptionRequired: true,
    quotaResource: 'cashRegisters',
    navigation: { label: 'Фінанси', icon: WalletCards, placement: 'primary' },
  },
  team: {
    key: 'team',
    routeSegment: 'team',
    released: false,
    viewPermission: 'team.view',
    mutationPermission: 'team.manage',
    requiredFeature: FEATURES.TeamCollaboration,
    subscriptionRequired: true,
    quotaResource: 'users',
    navigation: { label: 'Команда', icon: UserRoundCog, placement: 'primary' },
  },
  intakes: {
    key: 'intakes',
    routeSegment: 'intakes',
    released: false,
    viewPermission: 'intakes.view',
    mutationPermission: 'intakes.manage',
    requiredFeature: FEATURES.IntakeManagement,
    subscriptionRequired: true,
    quotaResource: 'intakes',
    navigation: { label: 'Приймання', icon: ScanLine, placement: 'primary' },
  },
  stickers: {
    key: 'stickers',
    routeSegment: 'stickers',
    released: false,
    viewPermission: 'parts.view',
    mutationPermission: 'stickers.manage',
    subscriptionRequired: true,
    navigation: { label: 'Стікери', icon: Sticker, placement: 'primary' },
  },
  reports: {
    key: 'reports',
    routeSegment: 'reports',
    released: false,
    viewPermission: 'reports.view',
    mutationPermission: 'reports.manage',
    requiredFeature: FEATURES.AdvancedReports,
    subscriptionRequired: true,
    navigation: { label: 'Звіти', icon: BarChart3, placement: 'primary' },
  },
  billing: {
    key: 'billing',
    routeSegment: 'billing',
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
    routeSegment: 'plans',
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
    routeSegment: 'payments',
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
    routeSegment: 'profile',
    released: true,
    navigation: {
      label: 'Профіль',
      icon: UserRound,
      placement: 'account',
    },
  },
  logout: {
    key: 'logout',
    routeSegment: 'logout',
    released: true,
    navigation: {
      label: 'Вийти',
      icon: LogOut,
      placement: 'account',
    },
  },
  onboarding: {
    key: 'onboarding',
    routeSegment: 'onboarding',
    released: true,
  },
  'tenant-switching': {
    key: 'tenant-switching',
    routeSegment: 'tenants',
    released: true,
    navigation: {
      label: 'Організація',
      icon: Building2,
      placement: 'account',
    },
  },
}
