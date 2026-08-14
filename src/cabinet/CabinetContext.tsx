import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { billingApi } from '../api/billing'
import { tenantPreference } from '../api/tenant-preference'
import type { Tenant } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { accessApi } from './access-api'
import type { TenantAccessSnapshot } from './access-types'
import { tenantRequestScope } from './tenant-request-scope'
import { tenantResetRegistry } from './tenant-reset-registry'
import {
  createTenantTransition,
  type TenantTransitionResult,
} from './tenant-transition'

export interface CabinetContextValue {
  status: 'loading' | 'ready' | 'switching' | 'error' | 'not-found' | 'inactive'
  targetTenant: Tenant | null
  snapshot: TenantAccessSnapshot | null
  error: unknown
  retry(): Promise<void>
  switchTenant(tenantId: string): Promise<void>
}

type CabinetState = Pick<
  CabinetContextValue,
  'status' | 'targetTenant' | 'snapshot' | 'error'
>

const initialState: CabinetState = {
  status: 'loading',
  targetTenant: null,
  snapshot: null,
  error: null,
}

const CabinetContext = createContext<CabinetContextValue | null>(null)

const cabinetPathFor = (pathname: string, slug: string) => {
  const match = /^\/app\/[^/]+(?<rest>\/.*)?$/.exec(pathname)
  return `/app/${encodeURIComponent(slug)}${match?.groups?.['rest'] ?? ''}`
}

export function CabinetProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const [state, setState] = useState<CabinetState>(initialState)
  const stateRef = useRef(state)
  const authRef = useRef(auth)
  const invalidatedBoundaryRef = useRef<string | null>(null)
  const transitionRef = useRef<ReturnType<
    typeof createTenantTransition
  > | null>(null)

  const publish = useCallback((next: CabinetState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const invalidateBoundary = useCallback(
    (boundary: string) => {
      if (invalidatedBoundaryRef.current === boundary) return
      invalidatedBoundaryRef.current = boundary
      transitionRef.current?.invalidate()
      tenantRequestScope.rotate()
      publish(initialState)
    },
    [publish],
  )

  useEffect(() => {
    authRef.current = auth
  }, [auth])

  useEffect(() => {
    const transition = createTenantTransition({
      currentScope: () => ({
        userId: authRef.current.user?.id ?? '',
        tenantId: authRef.current.tenant?.id ?? null,
      }),
      begin: (target) => {
        invalidatedBoundaryRef.current = null
        publish({
          status:
            stateRef.current.snapshot === null &&
            stateRef.current.status !== 'switching'
              ? 'loading'
              : 'switching',
          targetTenant: target,
          snapshot: null,
          error: null,
        })
      },
      rotateRequests: () => tenantRequestScope.rotate(),
      clear: (scope) => tenantResetRegistry.clear(scope),
      persistTenant: (tenantId) => tenantPreference.set(tenantId),
      loadAccess: (signal) => accessApi.get({ signal }),
      loadSubscription: (signal) => billingApi.getSubscription({ signal }),
      commit: (target, snapshot) => {
        if (
          authRef.current.status !== 'authenticated' ||
          authRef.current.user?.id !== snapshot.userId
        ) {
          return
        }
        authRef.current.commitTenant(target.id)
        publish({
          status: 'ready',
          targetTenant: target,
          snapshot,
          error: null,
        })
      },
      fail: (target, error) => {
        publish({
          status: 'error',
          targetTenant: target,
          snapshot: null,
          error,
        })
      },
    })
    transitionRef.current = transition

    return () => {
      transition.invalidate()
      tenantRequestScope.rotate()
      if (transitionRef.current === transition) {
        transitionRef.current = null
      }
    }
  }, [publish])

  const transitionTo = useCallback(
    async (target: Tenant): Promise<TenantTransitionResult | undefined> =>
      transitionRef.current?.transition(target),
    [],
  )

  useEffect(() => {
    if (auth.status === 'loading') {
      if (
        stateRef.current.targetTenant !== null ||
        stateRef.current.snapshot !== null
      ) {
        invalidateBoundary('auth:loading')
      }
      return
    }
    if (auth.status !== 'authenticated' || auth.user === null) {
      invalidateBoundary(`auth:${auth.status}`)
      return
    }

    const target = auth.tenants.find(
      (candidate) => candidate.slug === tenantSlug,
    )
    if (!target) {
      invalidateBoundary(`route:${tenantSlug ?? ''}:not-found`)
      return
    }
    if (!target.isActive) {
      invalidateBoundary(`route:${target.slug}:inactive`)
      return
    }

    if (
      stateRef.current.status === 'ready' &&
      stateRef.current.snapshot?.tenantId === target.id &&
      stateRef.current.snapshot.userId === auth.user.id &&
      auth.tenant?.id === target.id
    ) {
      return
    }

    void transitionTo(target)
  }, [
    auth.status,
    auth.user,
    auth.tenant,
    auth.tenants,
    invalidateBoundary,
    tenantSlug,
    transitionTo,
  ])

  const retry = useCallback(async () => {
    if (stateRef.current.targetTenant === null) return
    await transitionTo(stateRef.current.targetTenant)
  }, [transitionTo])

  const switchTenant = useCallback(
    async (tenantId: string) => {
      const target = authRef.current.tenants.find(
        (candidate) => candidate.id === tenantId,
      )
      if (!target) {
        invalidateBoundary(`selection:${tenantId}:not-found`)
        publish({
          status: 'not-found',
          targetTenant: null,
          snapshot: null,
          error: null,
        })
        return
      }

      if (
        stateRef.current.status === 'ready' &&
        stateRef.current.snapshot?.tenantId === target.id &&
        stateRef.current.snapshot.userId === authRef.current.user?.id &&
        authRef.current.tenant?.id === target.id &&
        target.slug === tenantSlug
      ) {
        return
      }

      void navigate(
        {
          pathname: cabinetPathFor(location.pathname, target.slug),
          search: location.search,
          hash: location.hash,
        },
        { replace: true },
      )

      if (!target.isActive) {
        invalidateBoundary(`route:${target.slug}:inactive`)
        return
      }

      await transitionTo(target)
    },
    [
      location.hash,
      location.pathname,
      location.search,
      invalidateBoundary,
      navigate,
      publish,
      tenantSlug,
      transitionTo,
    ],
  )

  const routeTarget =
    auth.status === 'authenticated' && auth.user !== null
      ? (auth.tenants.find((candidate) => candidate.slug === tenantSlug) ??
        null)
      : null

  const viewState = useMemo<CabinetState>(() => {
    if (auth.status !== 'authenticated' || auth.user === null) {
      return initialState
    }
    if (routeTarget === null) {
      return {
        status: 'not-found',
        targetTenant: null,
        snapshot: null,
        error: null,
      }
    }
    if (!routeTarget.isActive) {
      return {
        status: 'inactive',
        targetTenant: routeTarget,
        snapshot: null,
        error: null,
      }
    }
    if (state.snapshot !== null && state.snapshot.userId !== auth.user.id) {
      return {
        status: 'loading',
        targetTenant: routeTarget,
        snapshot: null,
        error: null,
      }
    }
    if (
      state.status !== 'switching' &&
      state.targetTenant?.id !== routeTarget.id
    ) {
      return {
        status: state.snapshot === null ? 'loading' : 'switching',
        targetTenant: routeTarget,
        snapshot: null,
        error: null,
      }
    }
    return state
  }, [auth.status, auth.user, routeTarget, state])

  const value = useMemo<CabinetContextValue>(
    () => ({ ...viewState, retry, switchTenant }),
    [retry, switchTenant, viewState],
  )

  let content: ReactNode
  switch (viewState.status) {
    case 'ready':
      content =
        auth.tenant?.id === viewState.snapshot?.tenantId &&
        auth.user?.id === viewState.snapshot?.userId
          ? children
          : loadingState
      break
    case 'switching':
      content = stateMessage('Перемикаємо розбірку…')
      break
    case 'error':
      content = (
        <div
          className="bg-background grid min-h-dvh place-items-center px-4 text-center text-white"
          role="alert"
        >
          <div className="grid max-w-md justify-items-center gap-4">
            <p>Не вдалося завантажити розбірку.</p>
            <button
              type="button"
              className="bg-brand text-brand-foreground min-h-11 rounded-full px-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              onClick={() => void retry()}
            >
              Спробувати ще раз
            </button>
          </div>
        </div>
      )
      break
    case 'not-found':
      content = stateMessage('Розбірку не знайдено', 'alert')
      break
    case 'inactive':
      content = stateMessage('Розбірка неактивна', 'alert')
      break
    default:
      content = loadingState
  }

  return (
    <CabinetContext.Provider value={value}>{content}</CabinetContext.Provider>
  )
}

const stateMessage = (message: string, role: 'status' | 'alert' = 'status') => (
  <div
    className="bg-background grid min-h-dvh place-items-center px-4 text-center text-neutral-400"
    role={role}
  >
    <p>{message}</p>
  </div>
)

const loadingState = stateMessage('Завантажуємо розбірку…')

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider.
export function useCabinet(): CabinetContextValue {
  const context = useContext(CabinetContext)
  if (!context) {
    throw new Error('useCabinet must be used within CabinetProvider')
  }
  return context
}
