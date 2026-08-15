import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { BrandLogo } from '@/components/site/brand-logo'
import { authApi } from '@/api/auth'
import { normalizeApiProblem } from '@/api/errors'
import { useAuth } from '@/auth/AuthContext'
import { resolvePostLoginDestination } from '@/auth/post-login'
import type { SendOtpResponse } from '@/api/types'

type Step = 'phone' | 'otp' | 'name' | 'success'

const OTP_LENGTH = 6

const errorMessages: Record<string, string> = {
  OTP_COOLDOWN: 'Зачекайте перед повторним надсиланням',
  OTP_RATE_LIMITED: 'Забагато спроб. Спробуйте пізніше',
  PHONE_NOT_FOUND: 'Номер не знайдено',
  OTP_INVALID: 'Невірний код',
  OTP_EXPIRED: 'Код вже не дійсний — запитайте новий',
  OTP_MAX_ATTEMPTS: 'Забагато невірних спроб. Запитайте новий код',
}

function extractError(err: unknown, fallback: string): string {
  const problem = normalizeApiProblem(err)
  const mappedMessage = problem.code ? errorMessages[problem.code] : undefined
  if (mappedMessage) return mappedMessage
  if (problem.kind === 'network') return 'Немає з’єднання з мережею.'
  if (problem.kind === 'timeout') return 'Час очікування запиту минув.'
  if (problem.kind === 'unknown' || problem.kind === 'cancelled')
    return fallback
  return problem.message || fallback
}

const cooldownFrom = (response: SendOtpResponse): number =>
  Math.max(response.cooldownSeconds ?? 60, response.retryAfterSeconds ?? 0)

function formatUkrainianPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('380')) digits = digits.slice(3)
  else if (digits.startsWith('80')) digits = digits.slice(2)
  else if (digits.startsWith('0')) digits = digits.slice(1)
  digits = digits.slice(0, 9)

  let formatted = '+380'
  if (digits.length > 0) formatted += ' ' + digits.slice(0, 2)
  if (digits.length > 2) formatted += ' ' + digits.slice(2, 5)
  if (digits.length > 5) formatted += ' ' + digits.slice(5, 7)
  if (digits.length > 7) formatted += ' ' + digits.slice(7, 9)
  return formatted
}

export function LoginScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const auth = useAuth()
  const fallbackReturnTo = (location.state as { from?: string } | null)?.from
  const returnTo = resolvePostLoginDestination(
    location.search,
    fallbackReturnTo ?? '/account',
    auth.tenant,
  )
  const [step, setStep] = useState<Step>(() =>
    auth.status === 'authenticated' &&
    (auth.user?.displayName.trim().length ?? 0) < 2
      ? 'name'
      : 'phone',
  )
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [name, setName] = useState('')
  const [sendingOtp, setSendingOtp] = useState(false)
  const [verifyingOtp, setVerifyingOtp] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [resendingOtp, setResendingOtp] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const mountedRef = useRef(false)
  const navigationGenerationRef = useRef(0)
  const navigationTimerRef = useRef<number | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      navigationGenerationRef.current += 1
      if (navigationTimerRef.current !== null) {
        window.clearTimeout(navigationTimerRef.current)
        navigationTimerRef.current = null
      }
    }
  }, [])

  const beginNavigationOperation = () => {
    navigationGenerationRef.current += 1
    if (navigationTimerRef.current !== null) {
      window.clearTimeout(navigationTimerRef.current)
      navigationTimerRef.current = null
    }
    return navigationGenerationRef.current
  }

  const isCurrentNavigationOperation = (generation: number) =>
    mountedRef.current && navigationGenerationRef.current === generation

  const scheduleNavigation = (generation: number) => {
    if (!isCurrentNavigationOperation(generation)) return
    navigationTimerRef.current = window.setTimeout(() => {
      if (isCurrentNavigationOperation(generation)) {
        void navigate(returnTo, { replace: true })
      }
      if (navigationGenerationRef.current === generation) {
        navigationTimerRef.current = null
      }
    }, 800)
  }

  useEffect(() => {
    if (resendIn <= 0) return
    const id = window.setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [resendIn])

  const toE164 = (formatted: string) => '+' + formatted.replace(/\D/g, '')
  const actionInProgress =
    sendingOtp || verifyingOtp || savingName || resendingOtp

  const handlePhoneSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (actionInProgress) return
    setError(null)
    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 12) {
      setError('Введіть повний номер телефону')
      return
    }
    setSendingOtp(true)
    try {
      const resp = await authApi.otpSend({ phone: toE164(phone) })
      setStep('otp')
      setResendIn(cooldownFrom(resp))
    } catch (err) {
      setError(extractError(err, 'Не вдалося надіслати код'))
    } finally {
      setSendingOtp(false)
    }
  }

  const handleOtpSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (actionInProgress) return
    setError(null)
    if (otp.length < OTP_LENGTH) {
      setError(`Введіть всі ${OTP_LENGTH} цифр`)
      return
    }
    setVerifyingOtp(true)
    const generation = beginNavigationOperation()
    try {
      const resp = await authApi.otpVerify({ phone: toE164(phone), code: otp })
      if (!isCurrentNavigationOperation(generation)) return
      // Existing user — straight to success. Brand-new user — ask their name first.
      if (resp.isNewUser) {
        setStep('name')
      } else {
        await auth.hydrate(resp.accessToken)
        if (!isCurrentNavigationOperation(generation)) return
        setStep('success')
        scheduleNavigation(generation)
      }
    } catch (err) {
      if (!isCurrentNavigationOperation(generation)) return
      setError(extractError(err, 'Невірний код'))
    } finally {
      if (isCurrentNavigationOperation(generation)) setVerifyingOtp(false)
    }
  }

  const handleNameSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (actionInProgress) return
    setError(null)
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setError('Введіть ім’я')
      return
    }
    setSavingName(true)
    const generation = beginNavigationOperation()
    try {
      await authApi.updateName(trimmed)
      if (!isCurrentNavigationOperation(generation)) return
      await auth.hydrate()
      if (!isCurrentNavigationOperation(generation)) return
      setStep('success')
      scheduleNavigation(generation)
    } catch (err) {
      if (!isCurrentNavigationOperation(generation)) return
      setError(extractError(err, 'Не вдалося зберегти ім’я'))
    } finally {
      if (isCurrentNavigationOperation(generation)) setSavingName(false)
    }
  }

  const handleResend = async () => {
    if (resendIn > 0 || actionInProgress) return
    setResendingOtp(true)
    try {
      const resp = await authApi.otpSend({ phone: toE164(phone) })
      setOtp('')
      setError(null)
      setResendIn(cooldownFrom(resp))
    } catch (err) {
      const problem = normalizeApiProblem(err)
      setError(extractError(problem, 'Не вдалося надіслати код'))
      if (problem.retryAfterSeconds !== undefined) {
        setResendIn((current) =>
          Math.max(current, problem.retryAfterSeconds ?? 0),
        )
      }
    } finally {
      setResendingOtp(false)
    }
  }

  return (
    <div className="bg-background relative flex min-h-screen flex-col text-white">
      <header className="flex items-center justify-between px-6 py-6 lg:px-10">
        <BrandLogo />
        <Link
          to="/"
          className="group inline-flex items-center gap-2 text-[13px] text-neutral-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
          <span>На головну</span>
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="w-full max-w-[440px]">
          {step === 'phone' && (
            <PhoneStep
              phone={phone}
              onChange={setPhone}
              onSubmit={(e) => void handlePhoneSubmit(e)}
              loading={sendingOtp}
              error={error}
            />
          )}
          {step === 'otp' && (
            <OtpStep
              phone={phone}
              otp={otp}
              onChange={setOtp}
              onSubmit={(e) => void handleOtpSubmit(e)}
              onBack={() => {
                setStep('phone')
                setOtp('')
                setError(null)
              }}
              onResend={() => void handleResend()}
              resendIn={resendIn}
              verifying={verifyingOtp}
              resending={resendingOtp}
              blocked={actionInProgress}
              error={error}
            />
          )}
          {step === 'name' && (
            <NameStep
              name={name}
              onChange={setName}
              onSubmit={(e) => void handleNameSubmit(e)}
              loading={savingName}
              blocked={actionInProgress}
              error={error}
            />
          )}
          {step === 'success' && <SuccessStep returnTo={returnTo} />}
        </div>
      </main>

      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 [background:radial-gradient(80%_60%_at_50%_0%,rgba(247,116,37,0.12),transparent_60%)]"
      />
    </div>
  )
}

function PhoneStep({
  phone,
  onChange,
  onSubmit,
  loading,
  error,
}: {
  phone: string
  onChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  loading: boolean
  error: string | null
}) {
  return (
    <div className="anim-fade-up flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <span className="text-brand text-[11px] font-medium tracking-[0.28em] uppercase">
          Вхід
        </span>
        <h1 className="text-[44px] leading-[0.95] font-light tracking-[-0.025em] lg:text-[52px]">
          Введіть
          <br />
          <span className="text-brand">номер телефону</span>
        </h1>
        <p className="max-w-[340px] text-[14px] leading-[1.5] text-neutral-500">
          Надішлемо одноразовий код підтвердження
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="sr-only" htmlFor="phone">
          Номер телефону
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          autoFocus
          value={phone}
          onChange={(e) => onChange(formatUkrainianPhone(e.target.value))}
          onFocus={() => {
            if (!phone) onChange('+380 ')
          }}
          placeholder="+380 50 000 00 00"
          maxLength={19}
          className="bg-surface-1 placeholder:text-neutral-600 focus:ring-brand h-16 rounded-2xl px-5 text-[18px] tracking-[0.02em] text-white tabular-nums ring-1 ring-white/10 transition-all outline-none focus:ring-2"
        />

        {error && (
          <p role="alert" className="text-[13px] text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="bg-brand hover:bg-brand-hover text-brand-foreground group mt-2 inline-flex h-16 items-center justify-center gap-3 rounded-full text-[16px] font-normal transition-all duration-300 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>{loading ? 'Надсилаємо…' : 'Отримати код'}</span>
          {!loading && (
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          )}
        </button>

        <p className="mt-2 text-center text-[12px] text-neutral-600">
          Продовжуючи, ви погоджуєтесь з{' '}
          <a href="#offer" className="text-neutral-400 hover:text-white">
            умовами використання
          </a>
        </p>
      </form>
    </div>
  )
}

function OtpStep({
  phone,
  otp,
  onChange,
  onSubmit,
  onBack,
  onResend,
  resendIn,
  verifying,
  resending,
  blocked,
  error,
}: {
  phone: string
  otp: string
  onChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  onBack: () => void
  onResend: () => void
  resendIn: number
  verifying: boolean
  resending: boolean
  blocked: boolean
  error: string | null
}) {
  return (
    <div className="anim-fade-up flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <span className="text-brand text-[11px] font-medium tracking-[0.28em] uppercase">
          Код підтвердження
        </span>
        <h1 className="text-[44px] leading-[0.95] font-light tracking-[-0.025em] lg:text-[52px]">
          Введіть код
          <br />
          <span className="text-brand">з SMS</span>
        </h1>
        <p className="text-[14px] leading-[1.5] text-neutral-500">
          Надіслали на <span className="text-white">{phone}</span>{' '}
          <button
            type="button"
            onClick={onBack}
            className="text-brand hover:underline"
          >
            змінити
          </button>
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <OtpInput
          value={otp}
          onChange={onChange}
          length={OTP_LENGTH}
          autoFocus
        />

        {error && (
          <p role="alert" className="text-center text-[13px] text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={blocked || otp.length < OTP_LENGTH}
          className="bg-brand hover:bg-brand-hover text-brand-foreground group mt-2 inline-flex h-16 items-center justify-center gap-3 rounded-full text-[16px] font-normal transition-all duration-300 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>{verifying ? 'Перевіряємо…' : 'Підтвердити'}</span>
          {!verifying && (
            <Check className="size-4 transition-transform group-hover:scale-110" />
          )}
        </button>

        <button
          type="button"
          onClick={onResend}
          disabled={resendIn > 0 || blocked}
          className="mt-2 text-center text-[13px] text-neutral-500 transition-colors hover:text-white disabled:cursor-not-allowed disabled:hover:text-neutral-500"
        >
          {resending
            ? 'Надсилаємо…'
            : resendIn > 0
              ? `Надіслати код ще раз — через ${resendIn}\u00A0с`
              : 'Надіслати код ще раз'}
        </button>
      </form>
    </div>
  )
}

function NameStep({
  name,
  onChange,
  onSubmit,
  loading,
  blocked,
  error,
}: {
  name: string
  onChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  loading: boolean
  blocked: boolean
  error: string | null
}) {
  return (
    <div className="anim-fade-up flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <span className="text-brand text-[11px] font-medium tracking-[0.28em] uppercase">
          Майже все
        </span>
        <h1 className="text-[44px] leading-[0.95] font-light tracking-[-0.025em] lg:text-[52px]">
          Як вас
          <br />
          <span className="text-brand">називати?</span>
        </h1>
        <p className="text-[14px] leading-[1.5] text-neutral-500">
          Це ім’я побачать ваші колеги в команді
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="sr-only" htmlFor="name">
          Ім’я
        </label>
        <input
          id="name"
          type="text"
          inputMode="text"
          autoComplete="name"
          autoFocus
          value={name}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Іван Петренко"
          maxLength={64}
          className="bg-surface-1 placeholder:text-neutral-600 focus:ring-brand h-16 rounded-2xl px-5 text-[18px] tracking-[0.02em] text-white ring-1 ring-white/10 transition-all outline-none focus:ring-2"
        />

        {error && (
          <p role="alert" className="text-[13px] text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={blocked || name.trim().length < 2}
          className="bg-brand hover:bg-brand-hover text-brand-foreground group mt-2 inline-flex h-16 items-center justify-center gap-3 rounded-full text-[16px] font-normal transition-all duration-300 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>{loading ? 'Зберігаємо…' : 'Продовжити'}</span>
          {!loading && (
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          )}
        </button>
      </form>
    </div>
  )
}

function SuccessStep({ returnTo }: { returnTo: string }) {
  return (
    <div className="anim-fade-up flex flex-col items-center gap-8 text-center">
      <div className="bg-brand grid size-20 place-items-center rounded-full">
        <Check className="text-brand-foreground size-9" />
      </div>
      <div className="flex flex-col gap-3">
        <h1 className="text-[40px] leading-[0.95] font-light tracking-[-0.025em] lg:text-[48px]">
          Ви увійшли
        </h1>
        <p className="text-[14px] text-neutral-500">
          Зараз перенаправимо у застосунок
        </p>
      </div>
      <Link
        to={returnTo}
        className="bg-brand hover:bg-brand-hover text-brand-foreground inline-flex h-14 items-center rounded-full px-8 text-[15px] transition-colors"
      >
        Продовжити
      </Link>
    </div>
  )
}

function OtpInput({
  value,
  onChange,
  length,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  length: number
  autoFocus?: boolean
}) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (autoFocus) inputsRef.current[0]?.focus()
  }, [autoFocus])

  const handleInput = (i: number, e: ChangeEvent<HTMLInputElement>) => {
    const digit = e.target.value.replace(/\D/g, '').slice(-1)
    const chars = value.split('')
    while (chars.length < length) chars.push('')
    chars[i] = digit
    const next = chars.join('').slice(0, length)
    onChange(next)
    if (digit && i < length - 1) {
      inputsRef.current[i + 1]?.focus()
    }
  }

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) {
      e.preventDefault()
      inputsRef.current[i - 1]?.focus()
      const chars = value.split('')
      chars[i - 1] = ''
      onChange(chars.join(''))
    }
    if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault()
      inputsRef.current[i - 1]?.focus()
    }
    if (e.key === 'ArrowRight' && i < length - 1) {
      e.preventDefault()
      inputsRef.current[i + 1]?.focus()
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, length)
    if (!pasted) return
    onChange(pasted)
    const focusIdx = Math.min(pasted.length, length - 1)
    inputsRef.current[focusIdx]?.focus()
  }

  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputsRef.current[i] = el
          }}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          autoComplete="one-time-code"
          value={value[i] ?? ''}
          onChange={(e) => handleInput(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          aria-label={`Цифра ${i + 1}`}
          className="bg-surface-1 focus:ring-brand h-16 w-12 rounded-2xl text-center text-[24px] font-medium text-white tabular-nums ring-1 ring-white/10 transition-all outline-none focus:ring-2 lg:h-[68px] lg:w-14"
        />
      ))}
    </div>
  )
}
