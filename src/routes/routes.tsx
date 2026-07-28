import type { RouteObject } from 'react-router'
import App from '@/App'
import { RedirectIfAuth, RequireAuth } from '@/auth/guards'
import { PartsInventoryScreen } from '@/screens/parts-inventory'
import { PartsSalesScreen } from '@/screens/parts-sales'

const hydrateFallbackElement = (
  <div className="min-h-screen bg-background" aria-busy="true" />
)

export function createAppRoutes(
  includePrototypeRoutes: boolean,
): RouteObject[] {
  const routes: RouteObject[] = [
    { path: '/', element: <App /> },
    {
      path: '/oblik-avtozapchastyn',
      element: <PartsInventoryScreen />,
    },
    {
      path: '/oblik-prodazhiv-avtozapchastyn',
      element: <PartsSalesScreen />,
    },
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
      path: '/marketplace',
      hydrateFallbackElement,
      lazy: async () => {
        const { MarketplaceApp } =
          await import('@/apps/marketplace/marketplace-app')
        return { element: <MarketplaceApp /> }
      },
    },
    {
      path: '/marketplace/listings/:slugOrId',
      hydrateFallbackElement,
      lazy: async () => {
        const { MarketplaceLayout } =
          await import('@/apps/marketplace/marketplace-layout')
        const { ListingDetailScreen } =
          await import('@/features/marketplace/listing-detail-screen')
        return {
          element: (
            <MarketplaceLayout>
              <ListingDetailScreen />
            </MarketplaceLayout>
          ),
        }
      },
    },
    {
      path: '/marketplace/shops/:slug',
      hydrateFallbackElement,
      lazy: async () => {
        const { MarketplaceLayout } =
          await import('@/apps/marketplace/marketplace-layout')
        const { ShopProfileScreen } =
          await import('@/features/marketplace/shop-profile-screen')
        return {
          element: (
            <MarketplaceLayout>
              <ShopProfileScreen />
            </MarketplaceLayout>
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
