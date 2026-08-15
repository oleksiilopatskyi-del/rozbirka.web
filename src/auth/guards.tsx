import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from './AuthContext'
import { resolvePostLoginDestination } from './post-login'

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
  const { status, user, tenant } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullScreenLoader />
  const mustCompleteName =
    status === 'authenticated' && Boolean(authenticatedUserWithoutName(user))
  if (status === 'authenticated' && !mustCompleteName) {
    const fallback = (location.state as { from?: string } | null)?.from ?? to
    return (
      <Navigate
        to={resolvePostLoginDestination(location.search, fallback, tenant)}
        replace
      />
    )
  }
  return <>{children}</>
}

function authenticatedUserWithoutName(
  user: ReturnType<typeof useAuth>['user'],
) {
  return user && user.displayName.trim().length < 2
}
