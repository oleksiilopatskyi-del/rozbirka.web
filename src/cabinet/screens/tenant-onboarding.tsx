import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ArrowRight, LogOut } from 'lucide-react'
import { tenantsApi } from '@/api/tenants'
import { tenantPreference } from '@/api/tenant-preference'
import { useAuth } from '@/auth/AuthContext'
import { BrandLogo } from '@/components/site/brand-logo'
import { cabinetPath } from '../cabinet-paths'

export function TenantOnboardingScreen() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resume, setResume] = useState<{
    generation: number
    tenantId: string
  } | null>(null)
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (activeCreateRef.current !== null) return
    setError(null)
    if (name.trim().length < 2) {
      setError('Введіть назву розбірки')
      return
    }

    setBusy(true)
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
    } catch {
      if (!isCurrent()) return
      setError('Не вдалося створити розбірку. Спробуйте ще раз.')
    } finally {
      if (activeCreateRef.current === operation) {
        activeCreateRef.current = null
        setBusy(false)
      }
    }
  }

  return (
    <div className="bg-background relative flex min-h-screen flex-col text-white">
      <header className="flex items-center justify-between px-6 py-6 lg:px-10">
        <BrandLogo />
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="inline-flex items-center gap-2 text-[13px] text-neutral-400 transition-colors hover:text-white"
        >
          <LogOut className="size-4" aria-hidden />
          Вийти
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="anim-fade-up w-full max-w-[460px]">
          <div className="flex flex-col gap-3">
            <span className="text-brand text-[11px] font-medium tracking-[0.28em] uppercase">
              Перший крок
            </span>
            <h1 className="text-[40px] leading-[0.95] font-light tracking-[-0.025em] lg:text-[52px]">
              Створіть
              <br />
              <span className="text-brand">свою розбірку</span>
            </h1>
            <p className="max-w-[360px] text-[14px] leading-[1.5] text-neutral-500">
              Це ваш робочий простір — авто, склад, продажі й команда. Після
              створення автоматично активуються 14 днів безкоштовно.
            </p>
          </div>

          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="mt-8 flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <label
                htmlFor="tenant-name"
                className="text-[12px] text-neutral-500"
              >
                Назва розбірки
              </label>
              <input
                id="tenant-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
                placeholder="Напр. CarDubliany"
                className="bg-surface-1 placeholder:text-neutral-600 focus:ring-brand h-14 rounded-2xl px-5 text-[16px] text-white ring-1 ring-white/10 transition-all outline-none focus:ring-2"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="tenant-city"
                className="text-[12px] text-neutral-500"
              >
                Місто <span className="text-neutral-600">(необовʼязково)</span>
              </label>
              <input
                id="tenant-city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Львів"
                className="bg-surface-1 placeholder:text-neutral-600 focus:ring-brand h-14 rounded-2xl px-5 text-[16px] text-white ring-1 ring-white/10 transition-all outline-none focus:ring-2"
              />
            </div>

            {error && (
              <p role="alert" className="text-[13px] text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="bg-brand hover:bg-brand-hover text-brand-foreground group mt-2 inline-flex h-14 items-center justify-center gap-3 rounded-full text-[15px] transition-all duration-300 hover:scale-[1.01] disabled:opacity-60"
            >
              <span>{busy ? 'Створюємо…' : 'Створити розбірку'}</span>
              {!busy && (
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              )}
            </button>
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
