import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import {
  Button,
  Field,
  Notice,
  TextInput,
  useOperation,
} from '@/components/app'
import { BrandLogo } from '@/components/site/brand-logo'
import { authApi } from '@/api/auth'
import { normalizeApiProblem } from '@/api/errors'
import { useAuth } from '@/auth/AuthContext'
import { resolvePostLoginDestination } from '@/auth/post-login'
import type { SendOtpResponse } from '@/api/types'

type Step = 'phone' | 'otp' | 'name' | 'success'

const OTP_LENGTH = 6
const PHONE_DIGITS = 12
const PHONE_HINT = 'Формат: +380 XX XXX XX XX'

const errorMessages: Record<string, string> = {
  OTP_COOLDOWN: 'Код уже надіслано. Дочекайтеся відліку й спробуйте ще раз',
  OTP_RATE_LIMITED: 'Забагато спроб. Спробуйте пізніше',
  PHONE_NOT_FOUND: 'Номер не знайдено. Перевірте його або введіть інший',
  // Пінується e2e-перевіркою помилки коду — текст має лишатися рівно таким.
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

const toE164 = (formatted: string) => '+' + formatted.replace(/\D/g, '')

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

interface VerifyOutcome {
  generation: number
  next: 'name' | 'success'
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
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
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

  const beginNavigationOperation = useCallback(() => {
    navigationGenerationRef.current += 1
    if (navigationTimerRef.current !== null) {
      window.clearTimeout(navigationTimerRef.current)
      navigationTimerRef.current = null
    }
    return navigationGenerationRef.current
  }, [])

  const isCurrentNavigationOperation = useCallback(
    (generation: number) =>
      mountedRef.current && navigationGenerationRef.current === generation,
    [],
  )

  const scheduleNavigation = useCallback(
    (generation: number) => {
      if (!isCurrentNavigationOperation(generation)) return
      navigationTimerRef.current = window.setTimeout(() => {
        if (isCurrentNavigationOperation(generation)) {
          void navigate(returnTo, { replace: true })
        }
        if (navigationGenerationRef.current === generation) {
          navigationTimerRef.current = null
        }
      }, 800)
    },
    [isCurrentNavigationOperation, navigate, returnTo],
  )

  useEffect(() => {
    if (resendIn <= 0) return
    const id = window.setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [resendIn])

  const requestOtp = useCallback(
    () => authApi.otpSend({ phone: toE164(phone) }),
    [phone],
  )

  const sendOtp = useOperation<SendOtpResponse>(requestOtp, {
    errorMessage: (error) =>
      extractError(error, 'Не вдалося надіслати код. Спробуйте ще раз'),
    onSuccess: (response) => {
      setOtp('')
      setCodeError(null)
      setStep('otp')
      setResendIn(cooldownFrom(response))
    },
  })

  const verifyOtp = useOperation<VerifyOutcome | null>(
    useCallback(async () => {
      const generation = beginNavigationOperation()
      const response = await authApi.otpVerify({
        phone: toE164(phone),
        code: otp,
      })
      if (!isCurrentNavigationOperation(generation)) return null
      // Existing user — straight to success. Brand-new user — ask their name first.
      if (response.isNewUser) return { generation, next: 'name' }
      await auth.hydrate(response.accessToken)
      if (!isCurrentNavigationOperation(generation)) return null
      return { generation, next: 'success' }
    }, [
      auth,
      beginNavigationOperation,
      isCurrentNavigationOperation,
      otp,
      phone,
    ]),
    {
      errorMessage: (error) => extractError(error, 'Невірний код'),
      onSuccess: (outcome) => {
        if (outcome === null) return
        if (outcome.next === 'name') {
          setStep('name')
          return
        }
        setStep('success')
        scheduleNavigation(outcome.generation)
      },
    },
  )

  const resendOtp = useOperation<SendOtpResponse>(requestOtp, {
    errorMessage: (error) =>
      extractError(error, 'Не вдалося надіслати код. Спробуйте ще раз'),
    onSuccess: (response) => {
      setOtp('')
      setResendIn(cooldownFrom(response))
    },
    onError: (error) => {
      const problem = normalizeApiProblem(error)
      if (problem.retryAfterSeconds !== undefined) {
        setResendIn((current) =>
          Math.max(current, problem.retryAfterSeconds ?? 0),
        )
      }
    },
  })

  const saveName = useOperation<number | null>(
    useCallback(async () => {
      const generation = beginNavigationOperation()
      await authApi.updateName(name.trim())
      if (!isCurrentNavigationOperation(generation)) return null
      await auth.hydrate()
      if (!isCurrentNavigationOperation(generation)) return null
      return generation
    }, [auth, beginNavigationOperation, isCurrentNavigationOperation, name]),
    {
      errorMessage: (error) =>
        extractError(error, 'Не вдалося зберегти ім’я. Спробуйте ще раз'),
      onSuccess: (generation) => {
        if (generation === null) return
        setStep('success')
        scheduleNavigation(generation)
      },
    },
  )

  const busy =
    sendOtp.pending ||
    verifyOtp.pending ||
    resendOtp.pending ||
    saveName.pending

  const handlePhoneSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (phone.replace(/\D/g, '').length !== PHONE_DIGITS) {
      setPhoneError(`Введіть номер повністю. ${PHONE_HINT}`)
      return
    }
    setPhoneError(null)
    sendOtp.run()
  }

  const handleOtpSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (otp.length < OTP_LENGTH) {
      setCodeError(`Введіть усі ${OTP_LENGTH} цифр коду з SMS`)
      return
    }
    setCodeError(null)
    resendOtp.reset()
    verifyOtp.run()
  }

  const handleResend = () => {
    if (resendIn > 0 || busy) return
    setCodeError(null)
    verifyOtp.reset()
    resendOtp.run()
  }

  const handleNameSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (name.trim().length < 2) {
      setNameError('Введіть ім’я — щонайменше дві літери')
      return
    }
    setNameError(null)
    saveName.run()
  }

  const backToPhone = () => {
    if (busy) return
    setStep('phone')
    setOtp('')
    setCodeError(null)
    setResendIn(0)
    verifyOtp.reset()
    resendOtp.reset()
  }

  return (
    <div className="bg-app-canvas relative flex min-h-screen flex-col text-white">
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-6 lg:px-10">
        <BrandLogo />
        <Link
          className="text-app-muted group -mr-2 inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-[13px] transition-colors hover:text-white"
          to="/"
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
          <span>На головну</span>
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="w-full max-w-[420px]">
          {step === 'phone' && (
            <PhoneStep
              error={sendOtp.error}
              fieldError={phoneError}
              onChange={(value) => {
                setPhone(value)
                if (phoneError) setPhoneError(null)
              }}
              onSubmit={handlePhoneSubmit}
              pending={sendOtp.pending}
              phone={phone}
            />
          )}
          {step === 'otp' && (
            <OtpStep
              busy={busy}
              error={codeError ?? verifyOtp.error ?? resendOtp.error}
              onBack={backToPhone}
              onChange={(value) => {
                setOtp(value)
                if (codeError) setCodeError(null)
              }}
              onResend={handleResend}
              onSubmit={handleOtpSubmit}
              otp={otp}
              pending={verifyOtp.pending}
              phone={phone}
              resendIn={resendIn}
              resending={resendOtp.pending}
            />
          )}
          {step === 'name' && (
            <NameStep
              busy={busy}
              error={saveName.error}
              fieldError={nameError}
              name={name}
              onChange={(value) => {
                setName(value)
                if (nameError) setNameError(null)
              }}
              onSubmit={handleNameSubmit}
              pending={saveName.pending}
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

function StepHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-brand text-[11px] font-medium tracking-[0.28em] uppercase">
        {eyebrow}
      </span>
      <h1 className="text-[30px] leading-[1.05] font-light tracking-[-0.02em] text-balance sm:text-[38px]">
        {title}
      </h1>
      {children}
    </div>
  )
}

function PhoneStep({
  phone,
  onChange,
  onSubmit,
  pending,
  error,
  fieldError,
}: {
  phone: string
  onChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  pending: boolean
  error: string | null
  fieldError: string | null
}) {
  return (
    <div className="anim-fade-up flex flex-col gap-6">
      <StepHeader eyebrow="Вхід" title="Вхід за номером телефону">
        <p className="text-app-muted text-[13.5px] leading-[1.5]">
          Надішлемо одноразовий код у SMS — вводити пароль не треба.
        </p>
      </StepHeader>

      <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit}>
        {error !== null && <Notice tone="danger">{error}</Notice>}

        <Field
          error={fieldError ?? undefined}
          hint={PHONE_HINT}
          label="Номер телефону"
        >
          <TextInput
            autoComplete="tel"
            autoFocus
            className="min-h-12 px-4 text-[16px] tracking-[0.02em] tabular-nums"
            inputMode="numeric"
            maxLength={19}
            onChange={(e) => onChange(formatUkrainianPhone(e.target.value))}
            onFocus={() => {
              if (!phone) onChange('+380 ')
            }}
            placeholder="+380 50 000 00 00"
            type="tel"
            value={phone}
          />
        </Field>

        <Button
          aria-busy={pending}
          className="min-h-12 text-[15px]"
          disabled={pending}
          size="wide"
          type="submit"
          variant="primary"
        >
          {pending ? 'Надсилаємо код…' : 'Отримати код'}
          {!pending && <ArrowRight />}
        </Button>

        <p className="text-app-dim text-center text-[12px] leading-[1.5]">
          Продовжуючи, ви погоджуєтесь з{' '}
          <a className="text-app-muted hover:text-white" href="#offer">
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
  pending,
  resending,
  busy,
  error,
}: {
  phone: string
  otp: string
  onChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  onBack: () => void
  onResend: () => void
  resendIn: number
  pending: boolean
  resending: boolean
  busy: boolean
  error: string | null
}) {
  const groupId = useId()
  const labelId = `${groupId}-label`
  const hintId = `${groupId}-hint`
  const waitId = `${groupId}-wait`
  const waiting = resendIn > 0

  return (
    <div className="anim-fade-up flex flex-col gap-6">
      <StepHeader eyebrow="Підтвердження" title="Введіть код з SMS">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-app-muted text-[13.5px] leading-[1.5]">
            Надіслали на{' '}
            <span className="text-app-ink tabular-nums">{phone}</span>
          </p>
          <Button
            className="-ml-2 px-2 text-[13px]"
            disabled={busy}
            onClick={onBack}
            variant="quiet"
          >
            <ArrowLeft />
            Змінити номер
          </Button>
        </div>
      </StepHeader>

      <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit}>
        {error !== null && <Notice tone="danger">{error}</Notice>}

        <div
          aria-describedby={hintId}
          aria-labelledby={labelId}
          className="flex flex-col gap-1.5"
          role="group"
        >
          <span className="text-app-muted text-[12.5px]" id={labelId}>
            Код з SMS
          </span>
          <OtpInput
            autoFocus
            describedBy={hintId}
            invalid={error !== null}
            length={OTP_LENGTH}
            onChange={onChange}
            value={otp}
          />
          <p className="text-app-dim text-[11.5px]" id={hintId}>
            Шість цифр з повідомлення. Не прийшло — надішліть код ще раз.
          </p>
        </div>

        <Button
          aria-busy={pending}
          className="min-h-12 text-[15px]"
          disabled={pending}
          size="wide"
          type="submit"
          variant="primary"
        >
          {pending ? 'Перевіряємо код…' : 'Підтвердити'}
          {!pending && <Check />}
        </Button>

        <div className="flex flex-col items-center gap-1.5">
          <Button
            aria-busy={resending}
            aria-describedby={waiting ? waitId : undefined}
            disabled={waiting || busy}
            onClick={onResend}
            size="wide"
            variant="quiet"
          >
            {resending ? 'Надсилаємо код…' : 'Надіслати код ще раз'}
          </Button>
          {waiting && (
            <p className="text-app-dim text-center text-[12px]" id={waitId}>
              {`Надіслати код ще раз можна через ${String(resendIn)}\u00A0с`}
            </p>
          )}
        </div>
      </form>
    </div>
  )
}

function NameStep({
  name,
  onChange,
  onSubmit,
  pending,
  busy,
  error,
  fieldError,
}: {
  name: string
  onChange: (v: string) => void
  onSubmit: (e: FormEvent) => void
  pending: boolean
  busy: boolean
  error: string | null
  fieldError: string | null
}) {
  return (
    <div className="anim-fade-up flex flex-col gap-6">
      <StepHeader eyebrow="Майже все" title="Як вас називати?">
        <p className="text-app-muted text-[13.5px] leading-[1.5]">
          Це ім’я побачать ваші колеги в команді.
        </p>
      </StepHeader>

      <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit}>
        {error !== null && <Notice tone="danger">{error}</Notice>}

        <Field
          error={fieldError ?? undefined}
          hint="Імені та прізвища достатньо."
          label="Ім’я"
        >
          <TextInput
            autoComplete="name"
            autoFocus
            className="min-h-12 px-4 text-[16px]"
            inputMode="text"
            maxLength={64}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Іван Петренко"
            type="text"
            value={name}
          />
        </Field>

        <Button
          aria-busy={pending}
          className="min-h-12 text-[15px]"
          disabled={busy}
          size="wide"
          type="submit"
          variant="primary"
        >
          {pending ? 'Зберігаємо ім’я…' : 'Продовжити'}
          {!pending && <ArrowRight />}
        </Button>
      </form>
    </div>
  )
}

function SuccessStep({ returnTo }: { returnTo: string }) {
  return (
    <div className="anim-fade-up flex flex-col items-center gap-6 text-center">
      <div className="bg-state-ok-soft border-state-ok/30 grid size-16 place-items-center rounded-full border">
        <Check className="text-state-ok size-8" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-[30px] leading-[1.05] font-light tracking-[-0.02em] sm:text-[36px]">
          Ви увійшли
        </h1>
        <p className="text-app-muted text-[13.5px]" role="status">
          Зараз перенаправимо у застосунок
        </p>
      </div>
      <Button
        asChild
        className="min-h-12 text-[15px]"
        size="wide"
        variant="primary"
      >
        <Link to={returnTo}>Продовжити</Link>
      </Button>
    </div>
  )
}

function OtpInput({
  value,
  onChange,
  length,
  autoFocus,
  invalid,
  describedBy,
}: {
  value: string
  onChange: (v: string) => void
  length: number
  autoFocus?: boolean
  invalid: boolean
  describedBy: string
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
    // The row breaks out of the page gutter below 640px so six 44px targets
    // still fit on a 320px screen without the document overflowing.
    <div className="-mx-2 grid grid-cols-6 gap-1 sm:mx-0 sm:gap-2">
      {Array.from({ length }).map((_, i) => (
        <input
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          autoComplete="one-time-code"
          className="bg-app-input border-app-line-2 rounded-control text-app-ink aria-[invalid=true]:border-state-danger focus-visible:border-brand min-h-12 w-full min-w-0 border text-center text-[20px] font-medium tabular-nums transition-colors outline-none hover:border-white/20"
          inputMode="numeric"
          key={i}
          aria-label={`Цифра ${i + 1}`}
          maxLength={1}
          onChange={(e) => handleInput(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          pattern="[0-9]*"
          ref={(el) => {
            inputsRef.current[i] = el
          }}
          value={value[i] ?? ''}
        />
      ))}
    </div>
  )
}
