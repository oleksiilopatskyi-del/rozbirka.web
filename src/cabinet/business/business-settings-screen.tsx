import { useEffect, useRef, useState, type FormEvent } from 'react'
import { businessApi } from '@/api/business'
import { useCabinet } from '../CabinetContext'
import { cabinetModules } from '../module-registry'
import { useLatestMutationGuard } from '../use-latest-mutation-guard'

type SaveState = 'idle' | 'pending' | 'success' | 'error' | 'denied'

export function BusinessSettingsScreen() {
  const cabinet = useCabinet()
  const tenant = cabinet.targetTenant
  const generation = cabinet.snapshot?.generation
  const [name, setName] = useState(tenant?.name ?? '')
  const [city, setCity] = useState(tenant?.city ?? '')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const mountedRef = useRef(true)
  const latestCabinetRef = useRef(cabinet)
  const { requireLatestMutation } = useLatestMutationGuard(
    cabinetModules.business,
  )

  useEffect(() => {
    latestCabinetRef.current = cabinet
  }, [cabinet])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- drafts reset only at a tenant scope boundary.
    setName(tenant?.name ?? '')
    setCity(tenant?.city ?? '')
    setSaveState('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the reset is intentionally keyed by the cabinet scope.
  }, [generation, tenant?.id])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  if (!tenant) {
    return (
      <p className="text-sm text-neutral-400">
        Оберіть розбірку, щоб змінити її налаштування.
      </p>
    )
  }

  const normalizedName = name.trim()
  const normalizedCity = city.trim()
  const busy = saveState === 'pending'
  const canSave = !busy && normalizedName.length >= 2

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    let scope: ReturnType<typeof requireLatestMutation>
    try {
      scope = requireLatestMutation({ quota: false })
    } catch {
      setSaveState('denied')
      return
    }

    setSaveState('pending')
    try {
      const updated = await businessApi.update(
        tenant.id,
        { name: normalizedName, city: normalizedCity || null },
        { signal: scope.signal },
      )
      const latest = latestCabinetRef.current
      const latestSnapshot = latest.snapshot
      if (
        !mountedRef.current ||
        scope.signal.aborted ||
        latestSnapshot?.generation !== scope.generation ||
        latestSnapshot?.tenantId !== scope.tenantId
      ) {
        return
      }
      setName(updated.name)
      setCity(updated.city ?? '')
      setSaveState('success')
      void Promise.resolve(cabinet.switchTenant(updated.id)).catch(
        () => undefined,
      )
    } catch {
      if (!mountedRef.current || scope.signal.aborted) return
      setSaveState('error')
    }
  }

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-8">
      <header className="grid gap-2">
        <p className="text-brand text-xs font-medium tracking-[0.18em] uppercase">
          Налаштування
        </p>
        <h1 className="text-3xl font-light tracking-tight text-white sm:text-4xl">
          Бізнес
        </h1>
        <p className="text-sm text-neutral-400">Дані поточної розбірки.</p>
      </header>
      <form
        onSubmit={(event) => void save(event)}
        className="bg-surface-1 grid gap-5 rounded-3xl border border-white/[0.06] p-5 sm:p-6"
      >
        <div className="grid gap-2">
          <label htmlFor="business-name" className="text-xs text-neutral-500">
            Назва розбірки
          </label>
          <input
            id="business-name"
            value={name}
            disabled={busy}
            onChange={(event) => {
              setName(event.target.value)
              if (!busy) setSaveState('idle')
            }}
            className="bg-background focus:ring-brand h-14 w-full rounded-2xl px-5 text-base text-white ring-1 ring-white/10 outline-none focus:ring-2 disabled:opacity-60"
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="business-city" className="text-xs text-neutral-500">
            Місто
          </label>
          <input
            id="business-city"
            value={city}
            disabled={busy}
            onChange={(event) => {
              setCity(event.target.value)
              if (!busy) setSaveState('idle')
            }}
            className="bg-background focus:ring-brand h-14 w-full rounded-2xl px-5 text-base text-white ring-1 ring-white/10 outline-none focus:ring-2 disabled:opacity-60"
          />
        </div>
        {saveState === 'success' && (
          <p role="status" className="text-sm text-neutral-400">
            Налаштування бізнесу збережено.
          </p>
        )}
        {saveState === 'denied' && (
          <p role="alert" className="text-sm text-red-400">
            Ви більше не маєте права змінювати налаштування бізнесу.
          </p>
        )}
        {saveState === 'error' && (
          <p role="alert" className="text-sm text-red-400">
            Не вдалося зберегти налаштування бізнесу. Спробуйте ще раз.
          </p>
        )}
        <button
          type="submit"
          disabled={!canSave}
          className="bg-brand hover:bg-brand-hover text-brand-foreground inline-flex min-h-11 w-fit items-center justify-center rounded-full px-6 text-sm disabled:opacity-50"
        >
          {busy ? 'Зберігаємо…' : 'Зберегти'}
        </button>
      </form>
    </section>
  )
}
