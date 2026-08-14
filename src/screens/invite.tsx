import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { invitationsApi, type InvitationInfo } from '@/api/invitations'
import { normalizeApiProblem } from '@/api/errors'
import { tenantPreference } from '@/api/tenant-preference'
import { useAuth } from '@/auth/AuthContext'
import { BrandLogo } from '@/components/site/brand-logo'

type InvitationState = 'expired' | 'used' | 'revoked' | 'not-found' | 'unknown'

interface InvitationLoad {
  code: string
  info: InvitationInfo | null
  error: InvitationState | null
}

const stateContent: Record<
  InvitationState,
  { title: string; description: string }
> = {
  expired: {
    title: 'Посилання прострочене',
    description: 'Попросіть власника розбірки надіслати нове запрошення.',
  },
  used: {
    title: 'Запрошення вже використано',
    description: 'Якщо ви вже приєдналися, увійдіть за номером телефону.',
  },
  revoked: {
    title: 'Запрошення скасовано',
    description: 'Це запрошення було скасовано власником розбірки.',
  },
  'not-found': {
    title: 'Недійсне посилання',
    description: 'Перевірте адресу запрошення та спробуйте ще раз.',
  },
  unknown: {
    title: 'Щось пішло не так',
    description: 'Не вдалося завантажити запрошення. Спробуйте ще раз.',
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
  if (problem.kind === 'not-found') return 'not-found'
  return 'unknown'
}

export function InviteScreen() {
  const { code = '' } = useParams<{ code: string }>()
  const auth = useAuth()
  const navigate = useNavigate()
  const acceptingRef = useRef(false)
  const [load, setLoad] = useState<InvitationLoad | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

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
                : 'unknown',
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
  }, [code])

  const loading = load?.code !== code
  const info = loading ? null : load.info
  const errorState = loading ? null : load.error

  const loginHref = `/login?invite=${encodeURIComponent(code)}`

  const handleAccept = async () => {
    if (acceptingRef.current || auth.status !== 'authenticated') return
    if ((auth.user?.displayName.trim().length ?? 0) < 2) {
      void navigate(loginHref, { replace: true })
      return
    }

    acceptingRef.current = true
    setAccepting(true)
    setAcceptError(null)
    try {
      const result = await invitationsApi.accept(code)
      tenantPreference.set(result.tenantId)
      await auth.hydrate()
      void navigate('/account', { replace: true })
    } catch (error) {
      const problem = normalizeApiProblem(error)
      const nextState = invitationState(problem)
      if (nextState !== 'unknown') {
        setLoad({ code, info: null, error: nextState })
      } else setAcceptError(problem.message)
    } finally {
      acceptingRef.current = false
      setAccepting(false)
    }
  }

  return (
    <div className="bg-background flex min-h-screen flex-col text-white">
      <header className="flex items-center justify-between px-6 py-6 lg:px-10">
        <BrandLogo />
        <Link
          to="/"
          className="group inline-flex items-center gap-2 text-[13px] text-neutral-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="size-4" aria-hidden />
          На головну
        </Link>
      </header>

      <main className="grid flex-1 place-items-center px-6 pb-24">
        <div className="bg-surface-1 w-full max-w-[480px] rounded-3xl border border-white/10 p-8 text-center lg:p-10">
          {loading && <p className="text-neutral-400">Завантаження…</p>}

          {!loading && errorState && (
            <InvitationError state={errorState} loginHref={loginHref} />
          )}

          {!loading && info && !errorState && (
            <div className="flex flex-col items-center gap-6">
              <div className="flex flex-col gap-3">
                <p className="text-[13px] text-neutral-400">
                  Вас запрошують приєднатися до
                </p>
                <h1 className="text-3xl font-light tracking-tight">
                  {info.tenantName}
                </h1>
                <p className="text-[14px] text-neutral-400">
                  як <span className="text-brand">{info.roleName}</span> · від{' '}
                  {info.createdByName}
                </p>
              </div>

              {acceptError && (
                <p role="alert" className="text-[13px] text-red-400">
                  {acceptError}
                </p>
              )}

              {auth.status === 'guest' ? (
                <Link
                  to={loginHref}
                  className="bg-brand text-brand-foreground inline-flex h-14 w-full items-center justify-center gap-2 rounded-full"
                >
                  Прийняти запрошення
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={accepting || auth.status === 'loading'}
                  onClick={() => void handleAccept()}
                  className="bg-brand text-brand-foreground h-14 w-full rounded-full disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {accepting ? 'Приєднуємо…' : 'Прийняти запрошення'}
                </button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function InvitationError({
  state,
  loginHref,
}: {
  state: InvitationState
  loginHref: string
}) {
  const content = stateContent[state]
  return (
    <div className="flex flex-col items-center gap-4">
      <h1 className="text-3xl font-light tracking-tight">{content.title}</h1>
      <p className="text-[14px] leading-relaxed text-neutral-400">
        {content.description}
      </p>
      {state === 'used' && (
        <Link to={loginHref} className="text-brand text-[14px]">
          Перейти до входу
        </Link>
      )}
    </div>
  )
}
