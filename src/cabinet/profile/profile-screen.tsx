import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { credentials } from '@/api/credentials'
import { profileApi } from '@/api/profile'
import { tenantPreference } from '@/api/tenant-preference'
import { useCabinet } from '../CabinetContext'

type SaveState = 'idle' | 'pending' | 'success' | 'error'
type DeleteState = 'idle' | 'confirming' | 'pending' | 'error'

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
  const [deleteState, setDeleteState] = useState<DeleteState>('idle')
  const mountedRef = useRef(true)
  const deleteRequestRef = useRef<AbortController | null>(null)
  const deletionDispatchedRef = useRef(false)
  const privateStateClearedRef = useRef(false)
  const authRef = useRef(auth)
  const profileGenerationRef = useRef(0)

  function clearPrivateState() {
    if (privateStateClearedRef.current) return
    privateStateClearedRef.current = true
    credentials.clear()
    tenantPreference.clear()
    void auth.signOut({ silent: true }).catch(() => undefined)
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (deletionDispatchedRef.current) {
        deleteRequestRef.current?.abort('profile-unmounted')
        deleteRequestRef.current = null
        clearPrivateState()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup must run only on unmount, using the latest render closure is not required after deletion dispatch.
  }, [])

  useEffect(() => {
    authRef.current = auth
    profileGenerationRef.current += 1
    const nextName = auth.user?.displayName ?? ''
    // eslint-disable-next-line react-hooks/set-state-in-effect -- draft state is intentionally reset at the authenticated-user boundary.
    setName(nextName)
    setSavedName(nextName.trim())
    setSaveState('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the reset is keyed only to identity transitions.
  }, [auth.status, auth.user?.id])

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

    const requestUserId = auth.user?.id
    const requestGeneration = profileGenerationRef.current
    setSaveState('pending')
    try {
      await auth.updateName(normalizedName)
      if (
        !mountedRef.current ||
        profileGenerationRef.current !== requestGeneration ||
        authRef.current.status !== 'authenticated' ||
        authRef.current.user?.id !== requestUserId
      ) {
        return
      }
      setName(normalizedName)
      setSavedName(normalizedName)
      setSaveState('success')
    } catch {
      if (
        !mountedRef.current ||
        profileGenerationRef.current !== requestGeneration ||
        authRef.current.user?.id !== requestUserId
      ) {
        return
      }
      setSaveState('error')
    }
  }

  const handleDelete = async () => {
    if (deleteState !== 'confirming') return

    const controller = new AbortController()
    deleteRequestRef.current = controller
    deletionDispatchedRef.current = true
    setDeleteState('pending')
    let deletionFailed = false
    try {
      await profileApi.deleteAccount({ signal: controller.signal })
    } catch {
      deletionFailed = true
    } finally {
      clearPrivateState()
      if (deleteRequestRef.current === controller) {
        deleteRequestRef.current = null
      }
    }
    if (deletionFailed && mountedRef.current) setDeleteState('error')
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
            <label htmlFor="profile-name" className="text-xs text-neutral-400">
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

        <section className="grid gap-3 border-t border-red-500/20 pt-6">
          <div className="grid gap-1">
            <h2 className="text-base text-white">Видалити акаунт</h2>
            <p className="text-sm text-neutral-400">
              Цю дію неможливо скасувати. Ви втратите доступ до всіх розбірок.
            </p>
          </div>
          {deleteState === 'error' && (
            <p role="alert" className="text-sm text-red-400">
              Не вдалося видалити акаунт. Спробуйте ще раз.
            </p>
          )}
          {deleteState === 'confirming' || deleteState === 'pending' ? (
            <div
              role="group"
              aria-labelledby="delete-account-title"
              aria-live="polite"
              className="grid gap-3 rounded-2xl border border-red-500/30 p-4"
            >
              <p id="delete-account-title" className="text-sm text-white">
                Підтвердіть видалення акаунта. Ця дія незворотна.
              </p>
              {deleteState === 'pending' ? (
                <p role="status" className="text-sm text-neutral-300">
                  Видалення розпочато. Локальний вихід буде виконано для
                  безпеки.
                </p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setDeleteState('idle')}
                    className="inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm text-white ring-1 ring-white/15"
                  >
                    Скасувати
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-red-500 px-5 text-sm text-white"
                  >
                    Так, видалити акаунт
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDeleteState('confirming')}
              className="inline-flex min-h-11 w-fit items-center justify-center rounded-full px-5 text-sm text-red-300 ring-1 ring-red-500/30 disabled:opacity-50"
            >
              Видалити акаунт
            </button>
          )}
        </section>
      </div>
    </section>
  )
}

function ProfileValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-xs text-neutral-400">{label}</dt>
      <dd className="truncate text-sm text-white" title={value}>
        {value}
      </dd>
    </div>
  )
}
