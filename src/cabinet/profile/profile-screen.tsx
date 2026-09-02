import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, Notice, PageBody, PageHeader, Panel } from '@/components/app'
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
    <PageBody className="gap-6" width="narrow">
      <PageHeader eyebrow="Налаштування" title="Профіль" />
      <p className="text-app-muted text-sm">
        Основна інформація вашого облікового запису.
      </p>

      <Panel className="grid min-w-0 gap-8 p-5 sm:p-6" padded={false}>
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="grid gap-4"
        >
          <div className="grid gap-2">
            <label
              htmlFor="profile-name"
              className="text-app-muted text-[12.5px]"
            >
              Ім’я
            </label>
            <input
              id="profile-name"
              value={name}
              disabled={busy}
              onChange={(event) => handleNameChange(event.target.value)}
              autoComplete="name"
              className="bg-app-input border-app-line-2 rounded-control text-app-ink focus-visible:border-brand min-h-11 w-full border px-3 text-sm outline-none transition-colors disabled:opacity-55"
            />
          </div>

          {saveState === 'success' && (
            <Notice tone="ok">Ім’я успішно оновлено.</Notice>
          )}
          {saveState === 'error' && (
            <Notice tone="danger">
              Не вдалося зберегти ім’я. Спробуйте ще раз.
            </Notice>
          )}

          <Button
            className="w-full sm:w-fit"
            disabled={!canSave}
            type="submit"
            variant="primary"
          >
            {busy ? 'Зберігаємо…' : 'Зберегти'}
          </Button>
        </form>

        <dl className="border-app-line grid gap-5 border-t pt-6 sm:grid-cols-3">
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
            <h2 className="text-base font-semibold text-white">
              Видалити акаунт
            </h2>
            <p className="text-app-muted text-sm">
              Цю дію неможливо скасувати. Ви втратите доступ до всіх розбірок.
            </p>
          </div>
          {deleteState === 'error' && (
            <Notice tone="danger">
              Не вдалося видалити акаунт. Спробуйте ще раз.
            </Notice>
          )}
          {deleteState === 'confirming' || deleteState === 'pending' ? (
            <div
              role="group"
              aria-labelledby="delete-account-title"
              aria-live="polite"
              className="border-state-danger/30 rounded-panel grid gap-3 border p-4"
            >
              <p id="delete-account-title" className="text-sm text-white">
                Підтвердіть видалення акаунта. Ця дія незворотна.
              </p>
              {deleteState === 'pending' ? (
                <p role="status" className="text-app-muted text-sm">
                  Видалення розпочато. Локальний вихід буде виконано для
                  безпеки.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setDeleteState('idle')}>
                    Скасувати
                  </Button>
                  <Button onClick={() => void handleDelete()} variant="danger">
                    Так, видалити акаунт
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Button
              className="w-fit"
              onClick={() => setDeleteState('confirming')}
              variant="danger"
            >
              Видалити акаунт
            </Button>
          )}
        </section>
      </Panel>
    </PageBody>
  )
}

function ProfileValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-app-dim text-[12.5px]">{label}</dt>
      <dd className="truncate text-sm text-white" title={value}>
        {value}
      </dd>
    </div>
  )
}
