import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock,
  RefreshCw,
  SearchX,
  ShieldAlert,
} from 'lucide-react'
import { invitationsApi, type InvitationInfo } from '@/api/invitations'
import { normalizeApiProblem } from '@/api/errors'
import { tenantPreference } from '@/api/tenant-preference'
import { useAuth, type AuthContextValue } from '@/auth/AuthContext'
import { cabinetPath } from '@/cabinet/cabinet-paths'
import { BrandLogo } from '@/components/site/brand-logo'
import {
  Button,
  DateValue,
  DeniedState,
  ErrorState,
  Fact,
  FactList,
  Notice,
  SkeletonRows,
  StateScreen,
  StatusPill,
  useOperation,
  type StateTone,
} from '@/components/app'

type InvitationState =
  | 'expired'
  | 'used'
  | 'revoked'
  | 'not-found'
  | 'invalid'
  | 'wrong-account'
  | 'unknown'

/** What resolves this dead end — one action, never a menu of guesses. */
type Resolution = 'login' | 'home' | 'retry'

interface InvitationLoad {
  code: string
  info: InvitationInfo | null
  error: InvitationState | null
}

interface AcceptAttempt {
  code: string
  controller: AbortController
}

/**
 * An accept that finishes for somebody else's invitation is not a success —
 * the same `stale` outcome the billing screens use, so the confirmation only
 * ever shows for the attempt the user is still looking at.
 */
type AcceptOutcome = 'accepted' | 'stale'

const stateContent: Record<
  InvitationState,
  {
    title: string
    description: string
    tone: StateTone
    icon: ReactNode
    resolution: Resolution
  }
> = {
  expired: {
    title: 'Посилання прострочене',
    description:
      'Термін дії запрошення минув. Попросіть власника розбірки надіслати нове посилання.',
    tone: 'warn',
    icon: <Clock aria-hidden />,
    resolution: 'home',
  },
  used: {
    title: 'Запрошення вже використано',
    description:
      'За цим посиланням уже приєдналися. Якщо це були ви — увійдіть за своїм номером телефону.',
    tone: 'neutral',
    icon: <CheckCircle2 aria-hidden />,
    resolution: 'login',
  },
  revoked: {
    title: 'Запрошення скасовано',
    description:
      'Власник розбірки скасував це запрошення. Попросіть надіслати нове.',
    tone: 'warn',
    icon: <Ban aria-hidden />,
    resolution: 'home',
  },
  'not-found': {
    title: 'Недійсне посилання',
    description:
      'Такого запрошення не існує. Перевірте, чи посилання скопійовано повністю.',
    tone: 'neutral',
    icon: <SearchX aria-hidden />,
    resolution: 'home',
  },
  invalid: {
    title: 'Запрошення недійсне',
    description:
      'Це запрошення більше не діє. Попросіть власника розбірки надіслати нове.',
    tone: 'warn',
    icon: <ShieldAlert aria-hidden />,
    resolution: 'home',
  },
  'wrong-account': {
    title: 'Запрошення для іншого номера',
    description:
      'Це запрошення надіслали на інший номер телефону. Увійдіть за номером, на який воно надійшло.',
    tone: 'neutral',
    icon: <ShieldAlert aria-hidden />,
    resolution: 'login',
  },
  unknown: {
    title: 'Не вдалося завантажити запрошення',
    description: 'Зв’язок із сервером перервався. Спробуйте ще раз.',
    tone: 'danger',
    icon: <RefreshCw aria-hidden />,
    resolution: 'retry',
  },
}

function invitationState(error: unknown): InvitationState {
  const problem = normalizeApiProblem(error)
  if (problem.code === 'INVITE_EXPIRED' || problem.code === 'EXPIRED') {
    return 'expired'
  }
  if (problem.code === 'INVITE_USED' || problem.code === 'ALREADY_USED') {
    return 'used'
  }
  if (problem.code === 'INVITE_REVOKED' || problem.code === 'REVOKED') {
    return 'revoked'
  }
  if (
    problem.code === 'INVITE_PHONE_MISMATCH' ||
    problem.code === 'PHONE_MISMATCH' ||
    problem.code === 'INVITE_WRONG_PHONE'
  ) {
    return 'wrong-account'
  }
  if (problem.kind === 'not-found') return 'not-found'
  return 'unknown'
}

const acceptFailureMessage = (error: unknown): string =>
  normalizeApiProblem(error).message

export function InviteScreen() {
  const { code = '' } = useParams<{ code: string }>()
  const auth = useAuth()
  const navigate = useNavigate()
  const activeAcceptRef = useRef<AcceptAttempt | null>(null)
  const [load, setLoad] = useState<InvitationLoad | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [acceptingCode, setAcceptingCode] = useState<string | null>(null)
  const [acceptedResume, setAcceptedResume] = useState<{
    code: string
    tenantId: string
  } | null>(null)

  useEffect(() => {
    if (acceptedResume?.code !== code) return
    const acceptedTenant = auth.tenants.find(
      (tenant) => tenant.id === acceptedResume.tenantId,
    )
    if (acceptedTenant) {
      void navigate(cabinetPath(acceptedTenant.slug, 'dashboard'), {
        replace: true,
      })
    }
  }, [acceptedResume, auth.tenants, code, navigate])

  useEffect(() => {
    const controller = new AbortController()
    void invitationsApi
      .info(code, { signal: controller.signal })
      .then((result) => {
        if (!result.isValid) {
          setLoad({
            code,
            info: null,
            error:
              Date.parse(result.expiresAt) <= Date.now()
                ? 'expired'
                : 'invalid',
          })
          return
        }
        setLoad({ code, info: result, error: null })
      })
      .catch((error: unknown) => {
        if (normalizeApiProblem(error).kind !== 'cancelled') {
          setLoad({ code, info: null, error: invitationState(error) })
        }
      })
    return () => controller.abort()
  }, [code, reloadToken])

  useEffect(() => {
    return () => {
      const attempt = activeAcceptRef.current
      if (attempt?.code === code) {
        attempt.controller.abort()
        activeAcceptRef.current = null
        setAcceptingCode((current) => (current === code ? null : current))
      }
    }
  }, [code])

  const loading = load?.code !== code
  const info = loading ? null : load.info
  const errorState = loading ? null : load.error
  const acceptingCurrentCode = acceptingCode === code

  const loginHref = `/login?invite=${encodeURIComponent(code)}`

  const reloadInvitation = () => {
    setLoad(null)
    setReloadToken((token) => token + 1)
  }

  const handleAccept = async (): Promise<AcceptOutcome> => {
    if (activeAcceptRef.current || auth.status !== 'authenticated') {
      return 'stale'
    }
    if ((auth.user?.displayName.trim().length ?? 0) < 2) {
      void navigate(loginHref, { replace: true })
      return 'stale'
    }

    const attempt: AcceptAttempt = { code, controller: new AbortController() }
    activeAcceptRef.current = attempt
    setAcceptingCode(code)
    const isCurrent = () =>
      activeAcceptRef.current === attempt && !attempt.controller.signal.aborted
    try {
      const result = await invitationsApi.accept(code, {
        signal: attempt.controller.signal,
      })
      if (!isCurrent()) return 'stale'
      tenantPreference.set(result.tenantId)
      if (!isCurrent()) return 'stale'
      await auth.hydrate()
      if (!isCurrent()) return 'stale'
      setAcceptedResume({ code, tenantId: result.tenantId })
      return 'accepted'
    } catch (error) {
      if (!isCurrent()) return 'stale'
      const problem = normalizeApiProblem(error)
      const nextState = invitationState(problem)
      if (nextState !== 'unknown') {
        setLoad({ code, info: null, error: nextState })
        return 'stale'
      }
      // Nothing the invitation itself can explain: hand the reason to the
      // operation so it stays next to the button that retries it.
      throw error
    } finally {
      if (activeAcceptRef.current === attempt) {
        activeAcceptRef.current = null
        setAcceptingCode(null)
      }
    }
  }

  return (
    <div className="bg-app-canvas text-app-ink flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-10">
        <BrandLogo />
        <Link
          className="text-app-muted hover:text-app-ink -mr-2 inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-[13px] transition-colors"
          to="/"
        >
          <ArrowLeft aria-hidden className="size-4" />
          На головну
        </Link>
      </header>

      <main className="flex flex-1 justify-center px-4 pt-4 pb-16 sm:px-6 sm:pt-10">
        <div className="w-full max-w-[480px] min-w-0">
          {loading && (
            <>
              <h1 className="sr-only">Запрошення до розбірки</h1>
              <SkeletonRows
                columns={2}
                label="Завантажуємо запрошення…"
                rows={4}
              />
            </>
          )}

          {!loading && errorState && (
            <>
              <h1 className="sr-only">Запрошення до розбірки</h1>
              <InvitationOutcome
                loginHref={loginHref}
                onRetry={reloadInvitation}
                state={errorState}
              />
            </>
          )}

          {!loading && info && !errorState && (
            <InvitationCard
              authStatus={auth.status}
              busy={acceptingCurrentCode}
              info={info}
              key={code}
              loginHref={loginHref}
              onAccept={handleAccept}
            />
          )}
        </div>
      </main>
    </div>
  )
}

/**
 * Everything the person is being asked to agree to, above the button that
 * agrees to it. Remounted per invitation code, so a cancelled attempt never
 * leaves its pending or failed state on the next invitation.
 */
function InvitationCard({
  authStatus,
  busy,
  info,
  loginHref,
  onAccept,
}: {
  authStatus: AuthContextValue['status']
  busy: boolean
  info: InvitationInfo
  loginHref: string
  onAccept: () => Promise<AcceptOutcome>
}) {
  const accepting = useOperation<AcceptOutcome>(onAccept, {
    // No toast: a success either navigates into the cabinet or is confirmed
    // in place by the notice below.
    errorMessage: acceptFailureMessage,
  })
  const accepted = accepting.succeeded && accepting.result === 'accepted'
  const failed = accepting.status === 'failed'

  return (
    <section className="border-app-line rounded-sheet bg-app-raised border p-5 sm:p-7">
      <p className="text-app-dim font-mono text-[10.5px] tracking-[0.12em] uppercase">
        Запрошення
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] break-words text-white">
        {info.tenantName}
      </h1>
      <p className="text-app-muted mt-2 text-[13.5px] leading-6">
        Вас запрошують приєднатися до кабінету цієї розбірки.
      </p>

      <div className="border-app-line rounded-panel bg-app-canvas/60 mt-5 border p-4">
        <FactList columns={2}>
          <Fact label="Роль у кабінеті">
            <StatusPill tone="info">{info.roleName}</StatusPill>
          </Fact>
          <Fact label="Запросив">{info.createdByName}</Fact>
          <Fact label="Запрошення діє до">
            <DateValue value={info.expiresAt} />
          </Fact>
        </FactList>
      </div>

      {authStatus === 'guest' ? (
        <>
          <Notice className="mt-5" tone="info">
            Щоб приєднатися, спершу увійдіть за номером телефону, на який
            надійшло запрошення.
          </Notice>
          <Button
            asChild
            className="mt-4 w-full"
            size="touch"
            variant="primary"
          >
            <Link to={loginHref}>
              Прийняти запрошення
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </>
      ) : accepted ? (
        <>
          <Notice className="mt-5" tone="ok">
            Запрошення прийнято. Відкриваємо кабінет розбірки.
          </Notice>
          <Button
            asChild
            className="mt-4 w-full"
            size="touch"
            variant="primary"
          >
            <Link to="/account">
              Перейти до кабінету
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </>
      ) : (
        <>
          {failed && accepting.error !== null && (
            <Notice block className="mt-5" tone="danger">
              <p>{accepting.error}</p>
              <p className="text-app-muted mt-1">
                Спробуйте ще раз. Якщо не вдається — попросіть власника розбірки
                надіслати нове запрошення.
              </p>
            </Notice>
          )}
          <Button
            className="mt-5 w-full"
            onClick={accepting.run}
            size="touch"
            variant="primary"
            {...accepting.triggerProps}
            disabled={accepting.pending || busy || authStatus === 'loading'}
          >
            {accepting.pending ? (
              'Приєднуємо…'
            ) : failed ? (
              <>
                <RefreshCw aria-hidden />
                Спробувати ще раз
              </>
            ) : (
              'Прийняти запрошення'
            )}
          </Button>
        </>
      )}
    </section>
  )
}

function InvitationOutcome({
  state,
  loginHref,
  onRetry,
}: {
  state: InvitationState
  loginHref: string
  onRetry: () => void
}) {
  const content = stateContent[state]

  if (content.resolution === 'retry') {
    return (
      <ErrorState
        description={content.description}
        label="Стан запрошення"
        onRetry={onRetry}
        title={content.title}
      />
    )
  }

  const action =
    content.resolution === 'login' ? (
      <Button asChild variant="primary">
        <Link to={loginHref}>
          {state === 'wrong-account'
            ? 'Увійти іншим номером'
            : 'Увійти за номером телефону'}
        </Link>
      </Button>
    ) : (
      <Button asChild>
        <Link to="/">Повернутися на головну</Link>
      </Button>
    )

  if (state === 'wrong-account') {
    return (
      <DeniedState
        actions={action}
        description={content.description}
        label="Стан запрошення"
        title={content.title}
      />
    )
  }

  return (
    <StateScreen
      actions={action}
      description={content.description}
      icon={content.icon}
      label="Стан запрошення"
      title={content.title}
      tone={content.tone}
    />
  )
}
