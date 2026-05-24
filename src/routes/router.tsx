import { createBrowserRouter } from 'react-router'
import App from '@/App'
import { RedirectIfAuth, RequireAuth } from '@/auth/guards'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
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
