import type { RouteObject } from 'react-router'
import App from '@/App'
import { RedirectIfAuth, RequireAuth } from '@/auth/guards'

const hydrateFallbackElement = (
  <div className="min-h-screen bg-background" aria-busy="true" />
)

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
