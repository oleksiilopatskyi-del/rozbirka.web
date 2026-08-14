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
import { credentials } from '@/api/credentials'
import { normalizeApiProblem } from '@/api/errors'
import { sessionApi } from '@/api/session'
import { tenantPreference } from '@/api/tenant-preference'
import { tenantsApi } from '@/api/tenants'
import type { Tenant, User } from '@/api/types'

export type AuthStatus = 'loading' | 'authenticated' | 'guest'

export interface AuthContextValue {
  status: AuthStatus
  user: User | null
  tenant: Tenant | null
  /** All tenants (розбірки) the user belongs to — drives the tenant switcher. */
  tenants: Tenant[]
  /** Called after a successful OTP verify; bootstraps user + tenants from the server. */
  hydrate: (accessToken?: string) => Promise<void>
  /** Switch the active розбірка. Updates X-Tenant-Id used by the core API client. */
  switchTenant: (tenantId: string) => void
  /** POST /session/logout and reset state. Pass `silent` to skip the network call. */
  signOut: (opts?: { silent?: boolean }) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [tenant, setTenantState] = useState<Tenant | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const bootstrappedRef = useRef(false)

  const reset = useCallback(() => {
    setUser((current) => (current === null ? current : null))
    setTenantState((current) => (current === null ? current : null))
    setTenants((current) => (current.length === 0 ? current : []))
    setStatus((current) => (current === 'guest' ? current : 'guest'))
  }, [])

  const bootstrap = useCallback(async () => {
    try {
      if (!credentials.getAccess()) {
        await sessionApi.refresh()
      }

      const storedId = tenantPreference.get()
      tenantPreference.clear()

      let me: User
      let list: Tenant[]
      try {
        ;[me, list] = await Promise.all([authApi.me(), tenantsApi.list()])
      } catch (error) {
        if (storedId) tenantPreference.set(storedId)
        throw error
      }

      const storedTenant = list.find((candidate) => candidate.id === storedId)
      const current = storedTenant ?? list[0] ?? null
      if (current) tenantPreference.set(current.id)
      setUser(me)
      setTenants(list)
      setTenantState(current)
      setStatus('authenticated')
    } catch (error) {
      const problem = normalizeApiProblem(error)
      credentials.clear()
      reset()

      if (problem.kind === 'session-expired') return
      // Non-session bootstrap failures deliberately settle as guest too. Keeping
      // the normalized problem here makes this branch ready for observability.
    }
  }, [reset])

  useEffect(() => {
    if (bootstrappedRef.current) return
    bootstrappedRef.current = true
    void bootstrap()
  }, [bootstrap])

  // Sync React state when the API client wipes tokens (e.g. refresh fails mid-session).
  useEffect(() => {
    return credentials.onCleared(reset)
  }, [reset])

  const hydrate = useCallback(
    async (accessToken?: string) => {
      if (accessToken) credentials.setAccess(accessToken)
      setStatus('loading')
      await bootstrap()
    },
    [bootstrap],
  )

  const switchTenant = useCallback((tenantId: string) => {
    setTenants((list) => {
      const next = list.find((t) => t.id === tenantId)
      if (next) {
        tenantPreference.set(next.id)
        setTenantState(next)
      }
      return list
    })
  }, [])

  const signOut = useCallback<AuthContextValue['signOut']>(
    async ({ silent } = {}) => {
      if (!silent) {
        try {
          await authApi.logout()
        } catch {
          // ignore — server may be offline; we still want to drop local state
        }
      }
      credentials.clear()
      reset()
    },
    [reset],
  )

  const value: AuthContextValue = {
    status,
    user,
    tenant,
    tenants,
    hydrate,
    switchTenant,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with provider; HMR boundary not critical here
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
