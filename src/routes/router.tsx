import { createBrowserRouter } from 'react-router'
import App from '@/App'
import { RedirectIfAuth, RequireAuth } from '@/auth/guards'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
  },
  {
    path: '/privacy',
    lazy: async () => {
      const { PrivacyScreen } = await import('@/screens/privacy')
      return { element: <PrivacyScreen /> }
    },
  },
  {
    path: '/login',
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
    lazy: async () => {
      const { MarketplaceApp } = await import('@/apps/marketplace/marketplace-app')
      return { element: <MarketplaceApp /> }
    },
  },
  {
    path: '/marketplace/listings/:slugOrId',
    lazy: async () => {
      const { MarketplaceLayout } = await import(
        '@/apps/marketplace/marketplace-layout'
      )
      const { ListingDetailScreen } = await import(
        '@/features/marketplace/listing-detail-screen'
      )
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
    lazy: async () => {
      const { MarketplaceLayout } = await import(
        '@/apps/marketplace/marketplace-layout'
      )
      const { ShopProfileScreen } = await import(
        '@/features/marketplace/shop-profile-screen'
      )
      return {
        element: (
          <MarketplaceLayout>
            <ShopProfileScreen />
          </MarketplaceLayout>
        ),
      }
    },
  },
  {
    path: '/screens',
    lazy: async () => {
      const { ScreensIndex } = await import('@/screens')
      return { element: <ScreensIndex /> }
    },
  },
  {
    path: '/screens/header',
    lazy: async () => {
      const { HeaderScreen } = await import('@/screens/header')
      return { element: <HeaderScreen /> }
    },
  },
])
