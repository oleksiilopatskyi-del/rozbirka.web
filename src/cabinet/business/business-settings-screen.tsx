import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, Notice, PageBody, PageHeader } from '@/components/app'
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
    <PageBody className="gap-6" width="narrow">
      <PageHeader eyebrow="Налаштування" title="Бізнес" />
      <p className="text-app-muted text-sm">Дані поточної розбірки.</p>
      <form
        onSubmit={(event) => void save(event)}
        className="border-app-line rounded-panel bg-app-raised grid gap-5 border p-5 sm:p-6"
      >
        <div className="grid gap-2">
          <label
            htmlFor="business-name"
            className="text-app-muted text-[12.5px]"
          >
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
            className="bg-app-input border-app-line-2 rounded-control text-app-ink focus-visible:border-brand min-h-11 w-full border px-3 text-sm outline-none transition-colors disabled:opacity-55"
          />
        </div>
        <div className="grid gap-2">
          <label
            htmlFor="business-city"
            className="text-app-muted text-[12.5px]"
          >
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
            className="bg-app-input border-app-line-2 rounded-control text-app-ink focus-visible:border-brand min-h-11 w-full border px-3 text-sm outline-none transition-colors disabled:opacity-55"
          />
        </div>
        {saveState === 'success' && (
          <Notice tone="ok">Налаштування бізнесу збережено.</Notice>
        )}
        {saveState === 'denied' && (
          <Notice tone="danger">
            Ви більше не маєте права змінювати налаштування бізнесу.
          </Notice>
        )}
        {saveState === 'error' && (
          <Notice tone="danger">
            Не вдалося зберегти налаштування бізнесу. Спробуйте ще раз.
          </Notice>
        )}
        <Button
          className="w-fit"
          disabled={!canSave}
          type="submit"
          variant="primary"
        >
          {busy ? 'Зберігаємо…' : 'Зберегти'}
        </Button>
      </form>
    </PageBody>
  )
}
