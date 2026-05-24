import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { authApi } from '@/api/auth'
import { tenantsApi } from '@/api/tenants'
import { tokens } from '@/api/tokens'
import type { Tenant, User } from '@/api/types'

export type AuthStatus = 'loading' | 'authenticated' | 'guest'

export interface AuthContextValue {
  status: AuthStatus
  user: User | null
  tenant: Tenant | null
  /** Called after a successful OTP verify; bootstraps user + tenant from the server. */
  hydrate: () => Promise<void>
  /** Manually override tenant (e.g. tenant switcher in the future). */
  setTenant: (tenant: Tenant | null) => void
  /** POST /auth/logout and reset state. Pass `silent` to skip the network call. */
  signOut: (opts?: { silent?: boolean }) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [tenant, setTenantState] = useState<Tenant | null>(null)
  const bootstrappedRef = useRef(false)

  const bootstrap = useCallback(async () => {
    if (!tokens.getAccess()) {
      setStatus('guest')
      setUser(null)
      setTenantState(null)
      return
    }
    try {
      const me = await authApi.me()
      const selected = await tenantsApi.ensureSelected().catch(() => null)
      setUser(me)
      setTenantState(selected)
      setStatus('authenticated')
    } catch {
      tokens.clear()
      setUser(null)
      setTenantState(null)
      setStatus('guest')
    }
  }, [])

  useEffect(() => {
    if (bootstrappedRef.current) return
    bootstrappedRef.current = true
    void bootstrap()
  }, [bootstrap])

  // Sync React state when the API client wipes tokens (e.g. refresh fails mid-session).
  useEffect(() => {
    return tokens.onCleared(() => {
      setUser(null)
      setTenantState(null)
      setStatus('guest')
    })
  }, [])

  const hydrate = useCallback(async () => {
    setStatus('loading')
    await bootstrap()
  }, [bootstrap])

  const signOut = useCallback<AuthContextValue['signOut']>(
    async ({ silent } = {}) => {
      if (!silent) {
        try {
          await authApi.logout()
        } catch {
          // ignore — server may be offline; we still want to drop local state
        }
      }
      tokens.clear()
      setUser(null)
      setTenantState(null)
      setStatus('guest')
    },
    [],
  )

  const value: AuthContextValue = {
    status,
    user,
    tenant,
    hydrate,
    setTenant: setTenantState,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
