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
): RouteObject => ({
  path: cabinetModules[module].routeSegment.slice(1),
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
}

const cabinetChildren = (): RouteObject[] => [
  { index: true, element: <Navigate to="dashboard" replace /> },
  ...Object.keys(cabinetModules).map((module) => {
    const key = module as CabinetModuleKey
    return releasedCabinetRoutes[key] ?? cabinetModuleRoute(key)
  }),
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
