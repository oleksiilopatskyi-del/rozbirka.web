import { Navigate, Outlet, type RouteObject } from 'react-router'
import App from '@/App'
import { RedirectIfAuth, RequireAuth } from '@/auth/guards'
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

const cabinetChildren = (): RouteObject[] => [
  { index: true, element: <Navigate to="dashboard" replace /> },
  ...Object.keys(cabinetModules).map((module) =>
    cabinetModuleRoute(module as CabinetModuleKey),
  ),
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
        const { CabinetProvider } = await import('@/cabinet/CabinetContext')
        return {
          element: (
            <RequireAuth>
              <CabinetProvider>
                <Outlet />
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
