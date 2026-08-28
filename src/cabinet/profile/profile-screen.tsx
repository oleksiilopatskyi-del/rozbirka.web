import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { useCabinet } from '../CabinetContext'

type SaveState = 'idle' | 'pending' | 'success' | 'error'

const roleLabels: Record<string, string> = {
  owner: 'Власник',
  manager: 'Менеджер',
  master: 'Майстер',
}

export function ProfileScreen() {
  const auth = useAuth()
  const cabinet = useCabinet()
  const currentName = auth.user?.displayName ?? ''
  const [name, setName] = useState(currentName)
  const [savedName, setSavedName] = useState(currentName.trim())
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const normalizedName = name.trim()
  const busy = saveState === 'pending'
  const canSave =
    !busy && normalizedName.length >= 2 && normalizedName !== savedName

  const handleNameChange = (nextName: string) => {
    setName(nextName)
    if (saveState !== 'pending') setSaveState('idle')
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSave) return

    setSaveState('pending')
    try {
      await auth.updateName(normalizedName)
      if (!mountedRef.current) return
      setName(normalizedName)
      setSavedName(normalizedName)
      setSaveState('success')
    } catch {
      if (!mountedRef.current) return
      setSaveState('error')
    }
  }

  const role = cabinet.snapshot?.role
  const roleLabel = role
    ? (roleLabels[role.toLowerCase()] ?? role)
    : 'Не вказано'

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-8">
      <header className="grid gap-2">
        <p className="text-brand text-xs font-medium tracking-[0.18em] uppercase">
          Налаштування
        </p>
        <h1 className="text-3xl font-light tracking-tight text-white sm:text-4xl">
          Профіль
        </h1>
        <p className="text-sm text-neutral-400">
          Основна інформація вашого облікового запису.
        </p>
      </header>

      <div className="bg-surface-1 grid min-w-0 gap-8 rounded-3xl border border-white/[0.06] p-5 sm:p-6">
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="grid gap-4"
        >
          <div className="grid gap-2">
            <label htmlFor="profile-name" className="text-xs text-neutral-500">
              Ім’я
            </label>
            <input
              id="profile-name"
              value={name}
              disabled={busy}
              onChange={(event) => handleNameChange(event.target.value)}
              autoComplete="name"
              className="bg-background focus:ring-brand h-14 w-full rounded-2xl px-5 text-base text-white ring-1 ring-white/10 transition-all outline-none focus:ring-2 disabled:opacity-60"
            />
          </div>

          {saveState === 'success' && (
            <p role="status" className="text-sm text-neutral-400">
              Ім’я успішно оновлено.
            </p>
          )}
          {saveState === 'error' && (
            <p role="alert" className="text-sm text-red-400">
              Не вдалося зберегти ім’я. Спробуйте ще раз.
            </p>
          )}

          <button
            type="submit"
            disabled={!canSave}
            className="bg-brand hover:bg-brand-hover text-brand-foreground inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-full px-6 text-sm transition-colors disabled:opacity-50 sm:w-fit"
          >
            {busy ? 'Зберігаємо…' : 'Зберегти'}
          </button>
        </form>

        <dl className="grid gap-5 border-t border-white/[0.06] pt-6 sm:grid-cols-3">
          <ProfileValue
            label="Телефон"
            value={auth.user?.phone ?? 'Не вказано'}
          />
          <ProfileValue label="Роль" value={roleLabel} />
          <ProfileValue
            label="Поточна розбірка"
            value={cabinet.targetTenant?.name ?? 'Не вибрано'}
          />
        </dl>
      </div>
    </section>
  )
}

function ProfileValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="truncate text-sm text-white" title={value}>
        {value}
      </dd>
    </div>
  )
}
