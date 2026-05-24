import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from './AuthContext'

function FullScreenLoader() {
  return (
    <div className="bg-background grid min-h-screen place-items-center text-[14px] text-neutral-500">
      Завантаження…
    </div>
  )
}

/** Renders `children` only for authenticated users. Otherwise navigates to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullScreenLoader />
  if (status === 'guest') {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search }}
        replace
      />
    )
  }
  return <>{children}</>
}

/** Renders `children` only for guests. Authenticated users are sent to /account. */
export function RedirectIfAuth({
  children,
  to = '/account',
}: {
  children: ReactNode
  to?: string
}) {
  const { status } = useAuth()

  if (status === 'loading') return <FullScreenLoader />
  if (status === 'authenticated') return <Navigate to={to} replace />
  return <>{children}</>
}
