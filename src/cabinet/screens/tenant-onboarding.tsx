import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, Check, Loader2, LogOut } from 'lucide-react'
import { normalizeApiProblem } from '@/api/errors'
import { tenantsApi } from '@/api/tenants'
import { tenantPreference } from '@/api/tenant-preference'
import { useAuth } from '@/auth/AuthContext'
import {
  Button,
  Field,
  Notice,
  PanelFooter,
  SectionPanel,
  TextInput,
  useOperation,
} from '@/components/app'
import { BrandLogo } from '@/components/site/brand-logo'
import { cabinetPath } from '../cabinet-paths'

/** What the first yard actually unlocks — the reason this form is worth filling. */
const included = [
  'Авто на розборі та склад запчастин в одному місці',
  'Продажі, каса й звіти без окремих таблиць',
  'Команда з ролями та правами доступу',
]

const nameTooShort = 'Вкажіть назву розбірки — щонайменше 2 символи'

export function TenantOnboardingScreen() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [touched, setTouched] = useState(false)
  const [resume, setResume] = useState<{
    generation: number
    tenantId: string
  } | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const generationRef = useRef(0)
  const activeCreateRef = useRef<{
    generation: number
    controller: AbortController
  } | null>(null)

  useEffect(() => {
    return () => {
      generationRef.current += 1
      activeCreateRef.current?.controller.abort('onboarding-unmounted')
      activeCreateRef.current = null
    }
  }, [])

  useEffect(() => {
    if (resume?.generation !== generationRef.current) return
    const createdTenant = auth.tenants.find(
      (tenant) => tenant.id === resume.tenantId,
    )
    if (createdTenant) {
      void navigate(cabinetPath(createdTenant.slug, 'dashboard'), {
        replace: true,
      })
    }
  }, [auth.tenants, navigate, resume])

  const invalidateCreate = (reason: string) => {
    generationRef.current += 1
    activeCreateRef.current?.controller.abort(reason)
    activeCreateRef.current = null
  }

  const handleLogout = async () => {
    invalidateCreate('onboarding-logout')
    tenantPreference.clear()
    void navigate('/', { replace: true, flushSync: true })
    await auth.signOut()
  }

  const create = useOperation(
    useCallback(async () => {
      const operation = {
        generation: generationRef.current + 1,
        controller: new AbortController(),
      }
      generationRef.current = operation.generation
      activeCreateRef.current = operation
      const isCurrent = () =>
        activeCreateRef.current === operation &&
        generationRef.current === operation.generation &&
        !operation.controller.signal.aborted
      try {
        const created = await tenantsApi.create(
          {
            tenantName: name.trim(),
            ...(city.trim() ? { city: city.trim() } : {}),
          },
          { signal: operation.controller.signal },
        )
        if (!isCurrent()) return
        tenantPreference.set(created.tenantId)
        await auth.hydrate()
        if (!isCurrent()) return
        setResume({
          generation: operation.generation,
          tenantId: created.tenantId,
        })
      } catch (failure) {
        // A superseded attempt (logout, unmount) is not a failure to report.
        if (!isCurrent()) return
        throw failure
      } finally {
        if (activeCreateRef.current === operation) {
          activeCreateRef.current = null
        }
      }
    }, [auth, city, name]),
    {
      errorMessage: (failure) =>
        `Не вдалося створити розбірку. ${normalizeApiProblem(failure).message}`,
    },
  )

  const nameIssue = name.trim().length < 2 ? nameTooShort : null

  const attemptCreate = () => {
    setTouched(true)
    if (nameIssue !== null) {
      nameRef.current?.focus()
      return
    }
    if (create.pending) return
    create.run()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    attemptCreate()
  }

  return (
    <div className="bg-app-canvas text-app-ink relative flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-10">
        <BrandLogo />
        <Button onClick={() => void handleLogout()} variant="quiet">
          <LogOut aria-hidden />
          Вийти
        </Button>
      </header>

      <main className="flex flex-1 justify-center px-4 pb-16 sm:px-6">
        <div className="anim-fade-up grid w-full max-w-[520px] content-start gap-6 sm:gap-8">
          <div className="grid gap-3">
            <span className="text-brand text-[11px] font-medium tracking-[0.28em] uppercase">
              Перший крок
            </span>
            <h1 className="text-[34px] leading-[1.02] font-light tracking-[-0.025em] sm:text-[44px] lg:text-[52px]">
              Створіть
              <br />
              <span className="text-brand">свою розбірку</span>
            </h1>
            <p className="text-app-muted max-w-[42ch] text-sm leading-6">
              Розбірка — це ваш робочий простір. Створіть її раз, і 14 днів
              роботи відкриються одразу, без картки.
            </p>
            <ul className="text-app-muted mt-1 grid gap-2 text-[13.5px]">
              {included.map((item) => (
                <li className="flex items-start gap-2.5" key={item}>
                  <Check aria-hidden className="text-brand mt-0.5 size-4" />
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <form
            aria-busy={create.pending}
            className="grid gap-4"
            noValidate
            onSubmit={submit}
          >
            <SectionPanel
              description="Назву бачить ваша команда й клієнти в документах. Змінити її можна будь-коли в налаштуваннях."
              title="Дані розбірки"
            >
              <Field
                error={touched ? nameIssue : null}
                hint="Наприклад: CarDubliany"
                label="Назва розбірки"
                required
              >
                <TextInput
                  autoComplete="organization"
                  autoFocus
                  onBlur={() => setTouched(true)}
                  onChange={(event) => setName(event.target.value)}
                  ref={nameRef}
                  value={name}
                />
              </Field>
              <Field
                hint="Показуємо в картках запчастин, щоб покупці бачили, звідки доставка."
                label="Місто (необовʼязково)"
              >
                <TextInput
                  autoComplete="address-level2"
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="Львів"
                  value={city}
                />
              </Field>
            </SectionPanel>

            {create.error === null ? null : (
              <Notice
                action={
                  <Button onClick={attemptCreate} {...create.triggerProps}>
                    Спробувати ще раз
                  </Button>
                }
                tone="danger"
              >
                {create.error}
              </Notice>
            )}

            <PanelFooter
              leading="14 днів безкоштовно, картка не потрібна"
              standalone
            >
              <Button
                {...create.triggerProps}
                type="submit"
                variant="primary"
                size="touch"
              >
                {create.pending ? (
                  <>
                    <Loader2 aria-hidden className="motion-safe:animate-spin" />
                    Створюємо…
                  </>
                ) : (
                  <>
                    Створити розбірку
                    <ArrowRight aria-hidden />
                  </>
                )}
              </Button>
            </PanelFooter>
          </form>
        </div>
      </main>

      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 [background:radial-gradient(80%_60%_at_50%_0%,rgba(247,116,37,0.12),transparent_60%)]"
      />
    </div>
  )
}
