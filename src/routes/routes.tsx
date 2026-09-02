import { Navigate, type RouteObject } from 'react-router'
import type { ComponentType } from 'react'
import App from '@/App'
import { RedirectIfAuth, RequireAuth } from '@/auth/guards'
import type { CabinetModuleScreenProps } from '@/cabinet/ModuleBoundary'
import {
  cabinetModules,
  type CabinetModuleKey,
} from '@/cabinet/module-registry'

const hydrateFallbackElement = (
  <div className="min-h-screen bg-background" aria-busy="true" />
)

const cabinetModuleRoute = (module: CabinetModuleKey): RouteObject => ({
  path: cabinetModules[module].routeSegment.slice(1),
  hydrateFallbackElement,
  lazy: async () => {
    const { CabinetModuleRoute } = await import('@/cabinet/ModuleBoundary')
    return {
      element: <CabinetModuleRoute module={module} />,
    }
  },
})

const cabinetScreenRoute = (
  module: CabinetModuleKey,
  loadScreen: () => Promise<ComponentType<CabinetModuleScreenProps>>,
  path = cabinetModules[module].routeSegment.slice(1),
): RouteObject => ({
  path,
  hydrateFallbackElement,
  lazy: async () => {
    const [{ ModuleBoundary }, Screen] = await Promise.all([
      import('@/cabinet/ModuleBoundary'),
      loadScreen(),
    ])
    return { element: <ModuleBoundary module={module} screen={Screen} /> }
  },
})

const releasedCabinetRoutes: Partial<Record<CabinetModuleKey, RouteObject>> = {
  dashboard: cabinetScreenRoute('dashboard', async () => {
    const { DashboardScreen } =
      await import('@/cabinet/dashboard/DashboardScreen')
    return DashboardScreen
  }),
  reports: cabinetScreenRoute('reports', async () => {
    const { ReportsScreen } = await import('@/cabinet/reports/ReportsScreen')
    return ReportsScreen
  }),
  team: cabinetScreenRoute('team', async () => {
    const { TeamScreen } = await import('@/cabinet/team/TeamScreen')
    return TeamScreen
  }),
  billing: cabinetScreenRoute('billing', async () => {
    const { SubscriptionScreen } =
      await import('@/cabinet/billing/subscription-screen')
    return SubscriptionScreen
  }),
  plans: cabinetScreenRoute('plans', async () => {
    const { PlansScreen } = await import('@/cabinet/billing/plans-screen')
    return PlansScreen
  }),
  payments: cabinetScreenRoute('payments', async () => {
    const { PaymentsScreen } = await import('@/cabinet/billing/payments-screen')
    return PaymentsScreen
  }),
  profile: cabinetScreenRoute('profile', async () => {
    const { ProfileScreen } = await import('@/cabinet/profile/profile-screen')
    return ProfileScreen
  }),
  cars: cabinetScreenRoute('cars', async () => {
    const { CarsScreen } = await import('@/cabinet/cars/CarsScreen')
    return CarsScreen
  }),
  intakes: cabinetScreenRoute('intakes', async () => {
    const { IntakesScreen } = await import('@/cabinet/intakes/IntakesScreen')
    return IntakesScreen
  }),
  parts: cabinetScreenRoute('parts', async () => {
    const { PartsScreen } = await import('@/cabinet/parts/PartsScreen')
    return PartsScreen
  }),
  inventory: cabinetScreenRoute('inventory', async () => {
    const { InventoryScreen } =
      await import('@/cabinet/inventory/InventoryScreen')
    return InventoryScreen
  }),
  stickers: cabinetScreenRoute('stickers', async () => {
    const { StickersScreen } = await import('@/cabinet/stickers/StickersScreen')
    return StickersScreen
  }),
  customers: cabinetScreenRoute('customers', async () => {
    const { CustomersScreen } =
      await import('@/cabinet/customers/CustomersScreen')
    return CustomersScreen
  }),
  orders: cabinetScreenRoute('orders', async () => {
    const { OrdersScreen } = await import('@/cabinet/orders/OrdersScreen')
    return OrdersScreen
  }),
  cash: cabinetScreenRoute('cash', async () => {
    const { CashScreen } = await import('@/cabinet/cash/CashScreen')
    return CashScreen
  }),
  business: cabinetScreenRoute('business', async () => {
    const { BusinessSettingsScreen } =
      await import('@/cabinet/business/business-settings-screen')
    return BusinessSettingsScreen
  }),
}

const commerceDetailRoutes: RouteObject[] = [
  ...[
    'inventory/warehouses/:warehouseId',
    'inventory/sessions/new',
    'inventory/sessions/:sessionId',
    'inventory/sessions/:sessionId/results',
    'inventory/sessions/:sessionId/audit',
    'inventory/sessions/:sessionId/journal/:zoneId',
  ].map((path) =>
    cabinetScreenRoute(
      'inventory',
      async () => {
        const { InventoryScreen } =
          await import('@/cabinet/inventory/InventoryScreen')
        return InventoryScreen
      },
      path,
    ),
  ),
  ...[
    'cars/new',
    'cars/:carId',
    'cars/:carId/edit',
    'cars/:carId/warehouse',
  ].map((path) =>
    cabinetScreenRoute(
      'cars',
      async () => {
        const { CarsScreen } = await import('@/cabinet/cars/CarsScreen')
        return CarsScreen
      },
      path,
    ),
  ),
  ...[
    'intakes/new',
    'intakes/batch',
    'intakes/:intakeId',
    'intakes/:intakeId/edit',
    'intakes/:intakeId/parts/new',
  ].map((path) =>
    cabinetScreenRoute(
      'intakes',
      async () => {
        const { IntakesScreen } =
          await import('@/cabinet/intakes/IntakesScreen')
        return IntakesScreen
      },
      path,
    ),
  ),
  ...['parts/new', 'parts/:partId', 'parts/:partId/edit'].map((path) =>
    cabinetScreenRoute(
      'parts',
      async () => {
        const { PartsScreen } = await import('@/cabinet/parts/PartsScreen')
        return PartsScreen
      },
      path,
    ),
  ),
  cabinetScreenRoute(
    'inventory',
    async () => {
      const { InventoryScreen } =
        await import('@/cabinet/inventory/InventoryScreen')
      return InventoryScreen
    },
    'parts/:partId/inventory',
  ),
  cabinetScreenRoute(
    'parts',
    async () => {
      const { ScannerScreen } = await import('@/cabinet/scanners/ScannerScreen')
      return ScannerScreen
    },
    'scan',
  ),
  ...[
    'customers/new',
    'customers/:customerId',
    'customers/:customerId/edit',
  ].map((path) =>
    cabinetScreenRoute(
      'customers',
      async () => {
        const { CustomersScreen } =
          await import('@/cabinet/customers/CustomersScreen')
        return CustomersScreen
      },
      path,
    ),
  ),
  ...['orders/new', 'orders/:orderId', 'orders/:orderId/items/new'].map(
    (path) =>
      cabinetScreenRoute(
        'orders',
        async () => {
          const { OrdersScreen } = await import('@/cabinet/orders/OrdersScreen')
          return OrdersScreen
        },
        path,
      ),
  ),
  ...['cash/new', 'cash/:registerId', 'cash/:registerId/edit'].map((path) =>
    cabinetScreenRoute(
      'cash',
      async () => {
        const { CashScreen } = await import('@/cabinet/cash/CashScreen')
        return CashScreen
      },
      path,
    ),
  ),
]

const cabinetChildren = (): RouteObject[] => [
  { index: true, element: <Navigate to="dashboard" replace /> },
  ...Object.keys(cabinetModules).map((module) => {
    const key = module as CabinetModuleKey
    return releasedCabinetRoutes[key] ?? cabinetModuleRoute(key)
  }),
  ...commerceDetailRoutes,
  {
    path: '*',
    hydrateFallbackElement,
    lazy: async () => {
      const { CabinetNotFoundScreen } =
        await import('@/cabinet/screens/not-found')
      return { element: <CabinetNotFoundScreen /> }
    },
  },
]

export function createAppRoutes(
  includePrototypeRoutes: boolean,
): RouteObject[] {
  const routes: RouteObject[] = [
    { path: '/', element: <App /> },
    {
      path: '/privacy',
      hydrateFallbackElement,
      lazy: async () => {
        const { PrivacyScreen } = await import('@/screens/privacy')
        return { element: <PrivacyScreen /> }
      },
    },
    {
      path: '/login',
      hydrateFallbackElement,
      lazy: async () => {
        const { LoginScreen } = await import('@/screens/login')
        return {
          element: (
            <RedirectIfAuth>
              <LoginScreen />
            </RedirectIfAuth>
          ),
        }
      },
    },
    {
      path: '/account',
      hydrateFallbackElement,
      lazy: async () => {
        const { AccountScreen } = await import('@/screens/account')
        return {
          element: (
            <RequireAuth>
              <AccountScreen />
            </RequireAuth>
          ),
        }
      },
    },
    {
      path: '/app/:tenant',
      hydrateFallbackElement,
      children: cabinetChildren(),
      lazy: async () => {
        const [{ CabinetProvider }, { CabinetShell }] = await Promise.all([
          import('@/cabinet/CabinetContext'),
          import('@/cabinet/CabinetShell'),
        ])
        return {
          element: (
            <RequireAuth>
              <CabinetProvider>
                <CabinetShell />
              </CabinetProvider>
            </RequireAuth>
          ),
        }
      },
    },
    {
      path: '/invite/:code',
      hydrateFallbackElement,
      lazy: async () => {
        const { InviteScreen } = await import('@/screens/invite')
        return { element: <InviteScreen /> }
      },
    },
    {
      path: '/scan/:qrCode',
      hydrateFallbackElement,
      lazy: async () => {
        const { ScanResumeScreen } = await import('@/screens/scan-resume')
        return {
          element: (
            <RequireAuth>
              <ScanResumeScreen />
            </RequireAuth>
          ),
        }
      },
    },
  ]

  if (includePrototypeRoutes) {
    routes.push(
      {
        path: '/screens',
        hydrateFallbackElement,
        lazy: async () => {
          const { ScreensIndex } = await import('@/screens')
          return { element: <ScreensIndex /> }
        },
      },
      {
        path: '/screens/header',
        hydrateFallbackElement,
        lazy: async () => {
          const { HeaderScreen } = await import('@/screens/header')
          return { element: <HeaderScreen /> }
        },
      },
    )
  }

  return routes
}
