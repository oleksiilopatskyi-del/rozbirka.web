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
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { Compass, Loader2, PauseCircle, RotateCcw } from 'lucide-react'
import { Button, ErrorState, StateScreen } from '@/components/app'
import { billingApi } from '../api/billing'
import { tenantPreference } from '../api/tenant-preference'
import type { Tenant } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { accessApi } from './access-api'
import type { TenantAccessSnapshot } from './access-types'
import { cabinetPath } from './cabinet-paths'
import { cabinetModules } from './module-registry'
import { evaluateModuleAccess } from './policy'
import { tenantRequestScope } from './tenant-request-scope'
import {
  TenantDepartureError,
  tenantScopeLifecycle,
  type TenantScopeLease,
} from './tenant-scope-lifecycle'
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

interface SwitchRouteIntent {
  targetId: string
  pathname: string
  search: string
  hash: string
}

const cabinetSuffixFor = (pathname: string) =>
  /^\/app\/[^/]+(?<rest>\/.*)?$/.exec(pathname)?.groups?.['rest'] ?? ''

const cabinetPathFor = (
  pathname: string,
  slug: string,
  snapshot: TenantAccessSnapshot,
) => {
  const suffix = cabinetSuffixFor(pathname).replace(/\/$/, '')
  const definition = Object.values(cabinetModules).find(
    (candidate) => candidate.routeSegment === suffix,
  )
  const module =
    definition !== undefined &&
    evaluateModuleAccess(
      definition,
      { status: 'ready', snapshot, error: null },
      'view',
    ).kind === 'allowed'
      ? definition.key
      : 'dashboard'
  return cabinetPath(slug, module)
}

export function CabinetProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const params = useParams<{ tenant: string; tenantSlug: string }>()
  const tenantSlug = params.tenant ?? params.tenantSlug
  const location = useLocation()
  const navigate = useNavigate()
  const [state, setState] = useState<CabinetState>(initialState)
  const stateRef = useRef(state)
  const authRef = useRef(auth)
  const invalidatedBoundaryRef = useRef<string | null>(null)
  const switchRouteIntentRef = useRef<SwitchRouteIntent | null>(null)
  const committedLeaseRef = useRef<TenantScopeLease | null>(null)
  const transitionRef = useRef<ReturnType<
    typeof createTenantTransition
  > | null>(null)

  const publish = useCallback((next: CabinetState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const departCommittedScope = useCallback(() => {
    const lease = committedLeaseRef.current
    committedLeaseRef.current = null
    void tenantScopeLifecycle.depart(lease)
  }, [])

  const invalidateBoundary = useCallback(
    (boundary: string) => {
      if (invalidatedBoundaryRef.current === boundary) return
      invalidatedBoundaryRef.current = boundary
      departCommittedScope()
      switchRouteIntentRef.current = null
      transitionRef.current?.invalidate()
      tenantRequestScope.rotate()
      publish(initialState)
    },
    [departCommittedScope, publish],
  )

  useEffect(() => {
    authRef.current = auth
  }, [auth])

  useEffect(() => {
    const transition = createTenantTransition({
      currentScope: () => {
        const lease = tenantScopeLifecycle.currentLease()
        const userId = authRef.current.user?.id ?? ''
        return lease === null
          ? { userId, tenantId: null }
          : {
              userId,
              tenantId: lease.scope.tenantId,
              departure: () => tenantScopeLifecycle.depart(lease),
            }
      },
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
      clear: (scope) => scope.departure?.() ?? Promise.resolve(),
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
        committedLeaseRef.current = tenantScopeLifecycle.commit({
          userId: snapshot.userId,
          tenantId: snapshot.tenantId,
        })
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
      departCommittedScope()
      transition.invalidate()
      tenantRequestScope.rotate()
      if (transitionRef.current === transition) {
        transitionRef.current = null
      }
    }
  }, [departCommittedScope, publish])

  const transitionTo = useCallback(
    async (target: Tenant): Promise<TenantTransitionResult | undefined> =>
      transitionRef.current?.transition(target),
    [],
  )

  const settleSwitchRoute = useCallback(
    (result: TenantTransitionResult | undefined, intent: SwitchRouteIntent) => {
      if (switchRouteIntentRef.current !== intent) return
      if (result?.kind === 'committed') {
        switchRouteIntentRef.current = null
        void navigate(
          {
            pathname: cabinetPathFor(
              intent.pathname,
              result.target.slug,
              result.snapshot,
            ),
            search: intent.search,
            hash: intent.hash,
          },
          { replace: true },
        )
        return
      }
      if (result?.kind !== 'error') {
        switchRouteIntentRef.current = null
      }
    },
    [navigate],
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
    location.key,
    tenantSlug,
    transitionTo,
  ])

  const retry = useCallback(async () => {
    if (stateRef.current.targetTenant === null) return
    const target = stateRef.current.targetTenant
    const intent = switchRouteIntentRef.current
    const result = await transitionTo(target)
    if (intent?.targetId === target.id) {
      settleSwitchRoute(result, intent)
    }
  }, [settleSwitchRoute, transitionTo])

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

      if (!target.isActive) {
        return
      }

      const intent: SwitchRouteIntent = {
        targetId: target.id,
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      }
      switchRouteIntentRef.current = intent
      const result = await transitionTo(target)
      settleSwitchRoute(result, intent)
    },
    [
      location.hash,
      location.pathname,
      location.search,
      invalidateBoundary,
      publish,
      settleSwitchRoute,
      tenantSlug,
      transitionTo,
    ],
  )

  const routeTarget =
    auth.status === 'authenticated' && auth.user !== null
      ? (auth.tenants.find((candidate) => candidate.slug === tenantSlug) ??
        null)
      : null
  const recoveryTenant =
    auth.status === 'authenticated' && auth.user !== null
      ? (auth.tenants.find(
          (candidate) => candidate.id === auth.tenant?.id && candidate.isActive,
        ) ??
        auth.tenants.find((candidate) => candidate.isActive) ??
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
      state.status !== 'error' &&
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
        auth.user?.id === viewState.snapshot?.userId ? (
          children
        ) : (
          <ShellLoading />
        )
      break
    case 'switching':
      content = <ShellSwitching target={viewState.targetTenant} />
      break
    case 'error':
      content =
        state.error instanceof TenantDepartureError ? (
          <ShellCleanupFailure />
        ) : (
          <ShellLoadFailure onRetry={() => void retry()} />
        )
      break
    case 'not-found':
      content = (
        <ShellRecovery
          description={
            recoveryTenant === null
              ? 'Ця адреса не веде до жодної з ваших розбірок. Перевірте посилання або поверніться на головну сторінку.'
              : 'Ця адреса не веде до жодної з ваших розбірок. Перевірте посилання або відкрийте активну розбірку.'
          }
          icon={<Compass aria-hidden />}
          label="Невідома розбірка"
          recoveryTenant={recoveryTenant}
          title="Розбірку не знайдено"
        />
      )
      break
    case 'inactive':
      content = (
        <ShellRecovery
          description={
            recoveryTenant === null
              ? 'Доступ до цієї розбірки призупинено. Попросіть власника поновити її або поверніться на головну сторінку.'
              : 'Доступ до цієї розбірки призупинено. Відкрийте активну розбірку або попросіть власника поновити цю.'
          }
          icon={<PauseCircle aria-hidden />}
          label="Неактивна розбірка"
          recoveryTenant={recoveryTenant}
          title="Розбірка неактивна"
        />
      )
      break
    default:
      content = <ShellLoading />
  }

  return (
    <CabinetContext.Provider value={value}>{content}</CabinetContext.Provider>
  )
}

/**
 * The shell owns the whole viewport while it has nothing to show: every state
 * below is one centred card on the app canvas, and each one names its own live
 * region so a screen reader can never confuse loading with switching.
 */
function ShellFrame({ children }: { children: ReactNode }) {
  return (
    <div className="bg-app-canvas grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}

const spinner = <Loader2 aria-hidden className="motion-safe:animate-spin" />

function ShellLoading() {
  return (
    <ShellFrame>
      <StateScreen
        description="Готуємо доступи, тарифи й дані розбірки. Це триває кілька секунд."
        icon={spinner}
        label="Завантаження розбірки"
        title="Завантажуємо розбірку…"
        tone="brand"
      />
    </ShellFrame>
  )
}

function ShellSwitching({ target }: { target: Tenant | null }) {
  return (
    <ShellFrame>
      <StateScreen
        description="Закриваємо дані попередньої розбірки, щоб вони не змішалися з новою."
        icon={spinner}
        label="Перемикання розбірки"
        title={
          target === null
            ? 'Перемикаємо розбірку…'
            : `Відкриваємо «${target.name}»…`
        }
        tone="brand"
      />
    </ShellFrame>
  )
}

function ShellLoadFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <ShellFrame>
      <ErrorState
        description="Сервер не віддав доступи до розбірки. Перевірте зв’язок і спробуйте ще раз — дані залишилися на місці."
        label="Помилка завантаження розбірки"
        onRetry={onRetry}
        title="Не вдалося завантажити розбірку"
      />
    </ShellFrame>
  )
}

function ShellCleanupFailure() {
  return (
    <ShellFrame>
      <ErrorState
        actions={
          <Button onClick={() => window.location.reload()} variant="primary">
            <RotateCcw aria-hidden />
            Перезапустити застосунок
          </Button>
        }
        description="Дані попередньої розбірки лишилися в пам’яті застосунку. Перезапустіть його, щоб відкрити наступну розбірку з чистими даними."
        label="Помилка очищення даних розбірки"
        title="Не вдалося безпечно очистити дані попередньої розбірки."
      />
    </ShellFrame>
  )
}

function ShellRecovery({
  title,
  description,
  icon,
  label,
  recoveryTenant,
}: {
  title: string
  description: string
  icon: ReactNode
  label: string
  recoveryTenant: Tenant | null
}) {
  return (
    <ShellFrame>
      <StateScreen
        actions={
          <Button asChild variant="primary">
            <Link
              to={
                recoveryTenant === null
                  ? '/'
                  : cabinetPath(recoveryTenant.slug, 'dashboard')
              }
            >
              {recoveryTenant === null ? 'На головну' : 'До активної розбірки'}
            </Link>
          </Button>
        }
        description={description}
        icon={icon}
        label={label}
        role="alert"
        title={title}
        tone="warn"
      />
    </ShellFrame>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider.
export function useCabinet(): CabinetContextValue {
  const context = useContext(CabinetContext)
  if (!context) {
    throw new Error('useCabinet must be used within CabinetProvider')
  }
  return context
}
