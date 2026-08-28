import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import { AlertDialog, Dialog } from 'radix-ui'
import { ALL_PERMISSIONS } from '../access-types'
import { useCabinet } from '../CabinetContext'
import type { CabinetModuleScreenProps } from '../ModuleBoundary'
import { tenantRequestScope } from '../tenant-request-scope'
import {
  teamApi,
  type InvitationDto,
  type RoleDto,
  type TeamMemberDto,
} from '@/api/team'

interface TeamData {
  tenantId: string | null
  generation: number | null
  members: TeamMemberDto[]
  roles: RoleDto[]
  invitations: InvitationDto[]
}

interface Confirmation {
  title: string
  description: string
  confirm(): Promise<boolean>
}

type AccessRefreshState = 'ready' | 'refreshing' | 'failed'

const invitationStatus = (invitation: InvitationDto) => {
  if (invitation.isUsed) return 'Використано'
  if (invitation.isRevoked) return 'Відкликано'
  if (invitation.isExpired) return 'Прострочено'
  return 'Активне'
}

export const TeamScreen: ComponentType<CabinetModuleScreenProps> = () => {
  const cabinet = useCabinet()
  const [data, setData] = useState<TeamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [accessWarning, setAccessWarning] = useState<string | null>(null)
  const [accessRefreshState, setAccessRefreshState] =
    useState<AccessRefreshState>('ready')
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [permissionMember, setPermissionMember] =
    useState<TeamMemberDto | null>(null)
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])
  const [newRoleName, setNewRoleName] = useState('Нова роль')
  const [newRolePermissions, setNewRolePermissions] = useState<string[]>([
    'orders.view',
  ])
  const [editingRole, setEditingRole] = useState<RoleDto | null>(null)
  const [editingRoleName, setEditingRoleName] = useState('')
  const [editingRolePermissions, setEditingRolePermissions] = useState<
    string[]
  >([])
  const accessRefreshRequiredRef = useRef(false)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const tenantId = cabinet.snapshot?.tenantId ?? null
  const generation = cabinet.snapshot?.generation ?? null
  const canView = cabinet.snapshot?.permissions.has('team.view') === true
  const canManageAccess =
    accessRefreshState === 'ready' &&
    cabinet.snapshot?.permissions.has('team.manage') === true

  const canManage = useCallback(
    () =>
      !accessRefreshRequiredRef.current &&
      cabinet.snapshot?.permissions.has('team.manage') === true,
    [cabinet],
  )

  const load = useCallback(async () => {
    const signal = tenantRequestScope.signal
    setLoading(true)
    setError(null)
    try {
      const [members, roles, invitations] = await Promise.all([
        teamApi.listMembers({ signal }),
        teamApi.listRoles({ signal }),
        teamApi.listInvitations({ signal }),
      ])
      if (!signal.aborted)
        setData({ tenantId, generation, members, roles, invitations })
    } catch {
      if (!signal.aborted) setError('Не вдалося завантажити дані команди.')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [generation, tenantId])

  useEffect(() => {
    if (!canView || accessRefreshState !== 'ready') return
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [accessRefreshState, canView, generation, load, refreshNonce, tenantId])

  const refreshAccess = useCallback(async () => {
    accessRefreshRequiredRef.current = true
    setAccessRefreshState('refreshing')
    try {
      await cabinet.retry()
      setAccessWarning(null)
      accessRefreshRequiredRef.current = false
      setAccessRefreshState('ready')
      setRefreshNonce((current) => current + 1)
      return true
    } catch {
      setAccessRefreshState('failed')
      setAccessWarning(
        'Дію виконано, але не вдалося оновити права. Спробуйте оновити доступ.',
      )
      return false
    }
  }, [cabinet])

  const mutate = useCallback(
    async (
      successMessage: string,
      operation: (signal: AbortSignal) => Promise<unknown>,
    ) => {
      if (!canManage()) {
        setError('Право керувати командою було змінено.')
        return false
      }
      const signal = tenantRequestScope.signal
      setFeedback(null)
      setError(null)
      try {
        await operation(signal)
      } catch {
        if (!signal.aborted)
          setFeedback('Не вдалося виконати дію. Спробуйте ще раз.')
        return false
      }
      if (signal.aborted) return false

      setFeedback(successMessage)
      await refreshAccess()
      return true
    },
    [canManage, refreshAccess],
  )

  const teamData =
    data?.tenantId === tenantId && data.generation === generation ? data : null
  const availableRoles = useMemo(() => teamData?.roles ?? [], [teamData?.roles])

  const openPermissions = async (member: TeamMemberDto) => {
    if (!canManage()) {
      setError('Право керувати командою було змінено.')
      return
    }
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const signal = tenantRequestScope.signal
    try {
      const result = await teamApi.getUserPermissions(member.userId, { signal })
      if (signal.aborted) return
      if (!canManage()) {
        setError('Право керувати командою було змінено.')
        return
      }
      setPermissionMember(member)
      setSelectedPermissions(result.permissions)
    } catch {
      if (!signal.aborted)
        setFeedback('Не вдалося завантажити права користувача.')
    }
  }

  const toggleNewRolePermission = (permission: string) => {
    setNewRolePermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    )
  }

  const toggleUserPermission = (permission: string) => {
    setSelectedPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    )
  }

  const toggleEditingRolePermission = (permission: string) => {
    setEditingRolePermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    )
  }

  const askConfirmation = (next: Confirmation) => {
    if (!canManage()) {
      setError('Право керувати командою було змінено.')
      return
    }
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setConfirmation(next)
  }

  const restoreFocus = () => restoreFocusRef.current?.focus()

  if (!canView) {
    return (
      <section className="mx-auto grid w-full max-w-6xl gap-8">
        <header className="grid gap-2">
          <h1 className="text-3xl font-light tracking-tight text-white sm:text-4xl">
            Команда
          </h1>
        </header>
        <p role="alert" className="text-sm text-red-400">
          Недостатньо прав для перегляду команди.
        </p>
      </section>
    )
  }

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-8">
      <header className="grid gap-2">
        <p className="text-brand text-xs font-medium tracking-[0.18em] uppercase">
          Налаштування доступу
        </p>
        <h1 className="text-3xl font-light tracking-tight text-white sm:text-4xl">
          Команда
        </h1>
        <p className="text-sm text-neutral-400">
          Керуйте учасниками, ролями та запрошеннями розбірки.
        </p>
      </header>

      {feedback && (
        <p role="status" className="text-sm text-neutral-300">
          {feedback}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {accessWarning && (
        <div role="alert" className="grid gap-2 text-sm text-amber-300">
          <p>{accessWarning}</p>
          <button
            type="button"
            disabled={accessRefreshState === 'refreshing'}
            onClick={() => {
              void refreshAccess()
            }}
          >
            Оновити права
          </button>
        </div>
      )}
      {loading && <p role="status">Завантажуємо команду…</p>}

      {teamData && (
        <>
          <section
            aria-labelledby="team-members-heading"
            className="grid gap-4"
          >
            <h2 id="team-members-heading" className="text-xl text-white">
              Учасники
            </h2>
            <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
              <table className="w-full text-left text-sm">
                <thead className="text-neutral-400">
                  <tr>
                    <th scope="col" className="p-4">
                      Учасник
                    </th>
                    <th scope="col" className="p-4">
                      Роль
                    </th>
                    <th scope="col" className="p-4">
                      Стан
                    </th>
                    {canManageAccess && (
                      <th scope="col" className="p-4">
                        Дії
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {teamData.members.map((member) => (
                    <tr
                      key={member.id}
                      className="border-t border-white/[0.06] text-white"
                    >
                      <th scope="row" className="p-4 font-medium">
                        {member.name}
                        {member.phone && (
                          <span className="block text-xs font-normal text-neutral-400">
                            {member.phone}
                          </span>
                        )}
                      </th>
                      <td className="p-4">
                        {canManageAccess ? (
                          <select
                            aria-label={`Роль для ${member.name}`}
                            value={member.role.id}
                            onChange={(event) =>
                              void mutate('Роль учасника оновлено.', (signal) =>
                                teamApi.changeRole(
                                  member.id,
                                  event.target.value,
                                  { signal },
                                ),
                              )
                            }
                          >
                            {availableRoles.map((role) => (
                              <option key={role.id} value={role.id}>
                                {role.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          member.role.name
                        )}
                      </td>
                      <td className="p-4">
                        {member.isActive ? 'Активний' : 'Неактивний'}
                      </td>
                      {canManageAccess && (
                        <td className="p-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void openPermissions(member)}
                            >
                              Права {member.name}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                askConfirmation({
                                  title: member.isActive
                                    ? 'Вимкнути учасника'
                                    : 'Активувати учасника',
                                  description: member.name,
                                  confirm: () =>
                                    mutate(
                                      member.isActive
                                        ? 'Учасника вимкнено.'
                                        : 'Учасника активовано.',
                                      (signal) =>
                                        member.isActive
                                          ? teamApi.deactivateMember(
                                              member.id,
                                              { signal },
                                            )
                                          : teamApi.activateMember(member.id, {
                                              signal,
                                            }),
                                    ),
                                })
                              }
                            >
                              {member.isActive
                                ? `Вимкнути ${member.name}`
                                : `Активувати ${member.name}`}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                askConfirmation({
                                  title: 'Видалити учасника',
                                  description: member.name,
                                  confirm: () =>
                                    mutate('Учасника видалено.', (signal) =>
                                      teamApi.deleteMember(member.id, {
                                        signal,
                                      }),
                                    ),
                                })
                              }
                            >
                              Видалити {member.name}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="team-roles-heading" className="grid gap-4">
            <h2 id="team-roles-heading" className="text-xl text-white">
              Ролі
            </h2>
            <ul className="grid gap-3">
              {teamData.roles.map((role) => (
                <li
                  key={role.id}
                  className="rounded-2xl border border-white/[0.06] p-4 text-white"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p>{role.name}</p>
                      {role.isSystem && (
                        <p className="text-xs text-neutral-400">
                          Системна роль
                        </p>
                      )}
                    </div>
                    {canManageAccess && !role.isSystem && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            restoreFocusRef.current =
                              document.activeElement instanceof HTMLElement
                                ? document.activeElement
                                : null
                            setEditingRole(role)
                            setEditingRoleName(role.name)
                            setEditingRolePermissions(role.permissions ?? [])
                          }}
                        >
                          Редагувати {role.name}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            askConfirmation({
                              title: 'Видалити роль',
                              description: role.name,
                              confirm: () =>
                                mutate('Роль видалено.', (signal) =>
                                  teamApi.deleteRole(role.id, { signal }),
                                ),
                            })
                          }
                        >
                          Видалити {role.name}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {canManageAccess && (
              <form
                className="grid gap-3 rounded-2xl border border-white/[0.06] p-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void mutate('Роль створено.', (signal) =>
                    teamApi.createRole(
                      {
                        name: newRoleName.trim(),
                        permissions: newRolePermissions,
                      },
                      { signal },
                    ),
                  )
                }}
              >
                <label className="grid gap-1">
                  <span>Назва нової ролі</span>
                  <input
                    aria-label="Назва нової ролі"
                    value={newRoleName}
                    onChange={(event) => setNewRoleName(event.target.value)}
                  />
                </label>
                <PermissionChecklist
                  selected={newRolePermissions}
                  onToggle={toggleNewRolePermission}
                />
                <button
                  type="submit"
                  disabled={
                    !newRoleName.trim() || newRolePermissions.length === 0
                  }
                >
                  Створити роль
                </button>
              </form>
            )}
          </section>

          <section
            aria-labelledby="team-invitations-heading"
            className="grid gap-4"
          >
            <h2 id="team-invitations-heading" className="text-xl text-white">
              Запрошення
            </h2>
            {canManageAccess && (
              <form
                className="flex flex-wrap gap-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  const form = new FormData(event.currentTarget)
                  const roleId = form.get('invitation-role')
                  if (typeof roleId === 'string' && roleId)
                    void mutate('Запрошення створено.', (signal) =>
                      teamApi.createInvitation(roleId, { signal }),
                    )
                }}
              >
                <label className="grid gap-1">
                  <span>Роль для запрошення</span>
                  <select
                    aria-label="Роль для запрошення"
                    name="invitation-role"
                  >
                    {availableRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit">Створити запрошення</button>
              </form>
            )}
            <ul className="grid gap-3">
              {teamData.invitations.map((item) => {
                const status = invitationStatus(item)
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.06] p-4 text-white"
                  >
                    <div>
                      <p>{item.code}</p>
                      <p className="text-sm text-neutral-400">
                        {item.role.name} · <span>{status}</span>
                      </p>
                    </div>
                    {canManageAccess && status === 'Активне' && (
                      <button
                        type="button"
                        onClick={() =>
                          askConfirmation({
                            title: 'Відкликати запрошення',
                            description: item.code,
                            confirm: () =>
                              mutate('Запрошення відкликано.', (signal) =>
                                teamApi.revokeInvitation(item.id, { signal }),
                              ),
                          })
                        }
                      >
                        Відкликати {item.code}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      )}

      <Dialog.Root
        open={editingRole !== null}
        onOpenChange={(open) => {
          if (!open) setEditingRole(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
          {editingRole && (
            <Dialog.Content
              aria-label={`Роль: ${editingRole.name}`}
              className="bg-surface-2 fixed inset-x-3 top-1/2 z-50 max-h-[90dvh] max-w-lg -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/10 p-4 text-white sm:inset-x-auto sm:left-1/2 sm:w-full sm:-translate-x-1/2"
              onCloseAutoFocus={restoreFocus}
            >
              <Dialog.Title>{`Роль: ${editingRole.name}`}</Dialog.Title>
              <Dialog.Description className="sr-only">
                Змініть назву та права ролі.
              </Dialog.Description>
              <form
                className="mt-3 grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  void (async () => {
                    await mutate('Роль оновлено.', (signal) =>
                      teamApi.updateRole(
                        editingRole.id,
                        {
                          name: editingRoleName.trim(),
                          permissions: editingRolePermissions,
                        },
                        { signal },
                      ),
                    )
                    setEditingRole(null)
                  })()
                }}
              >
                <label className="grid gap-1">
                  <span>Назва ролі</span>
                  <input
                    value={editingRoleName}
                    onChange={(event) => setEditingRoleName(event.target.value)}
                  />
                </label>
                <PermissionChecklist
                  selected={editingRolePermissions}
                  onToggle={toggleEditingRolePermission}
                />
                <button
                  type="submit"
                  disabled={
                    !canManageAccess ||
                    !editingRoleName.trim() ||
                    editingRolePermissions.length === 0
                  }
                >
                  Зберегти роль
                </button>
                <Dialog.Close type="button">Скасувати</Dialog.Close>
              </form>
            </Dialog.Content>
          )}
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={permissionMember !== null}
        onOpenChange={(open) => {
          if (!open) setPermissionMember(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
          {permissionMember && (
            <Dialog.Content
              aria-label={`Права: ${permissionMember.name}`}
              className="bg-surface-2 fixed inset-x-3 top-1/2 z-50 max-h-[90dvh] max-w-lg -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/10 p-4 text-white sm:inset-x-auto sm:left-1/2 sm:w-full sm:-translate-x-1/2"
              onCloseAutoFocus={restoreFocus}
            >
              <Dialog.Title>{`Права: ${permissionMember.name}`}</Dialog.Title>
              <Dialog.Description className="sr-only">
                Налаштуйте індивідуальні права учасника.
              </Dialog.Description>
              <form
                className="mt-3 grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  void (async () => {
                    await mutate('Права учасника оновлено.', (signal) =>
                      teamApi.updateUserPermissions(
                        permissionMember.userId,
                        selectedPermissions,
                        { signal },
                      ),
                    )
                    setPermissionMember(null)
                  })()
                }}
              >
                <PermissionChecklist
                  selected={selectedPermissions}
                  onToggle={toggleUserPermission}
                  legend="Права користувача"
                />
                <button type="submit" disabled={!canManageAccess}>
                  Зберегти права
                </button>
                <Dialog.Close type="button">Скасувати</Dialog.Close>
              </form>
            </Dialog.Content>
          )}
        </Dialog.Portal>
      </Dialog.Root>

      <AlertDialog.Root
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null)
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
          {confirmation && (
            <AlertDialog.Content
              aria-label={confirmation.title}
              className="bg-surface-2 fixed inset-x-3 top-1/2 z-50 max-w-md -translate-y-1/2 rounded-2xl border border-white/10 p-4 text-white sm:inset-x-auto sm:left-1/2 sm:w-full sm:-translate-x-1/2"
              onCloseAutoFocus={restoreFocus}
            >
              <AlertDialog.Title>{confirmation.title}</AlertDialog.Title>
              <AlertDialog.Description className="text-neutral-400">
                {confirmation.description}
              </AlertDialog.Description>
              <div className="mt-3 flex gap-2">
                <AlertDialog.Action
                  disabled={!canManageAccess}
                  onClick={(event) => {
                    event.preventDefault()
                    void (async () => {
                      await confirmation.confirm()
                      setConfirmation(null)
                    })()
                  }}
                >
                  Підтвердити
                </AlertDialog.Action>
                <AlertDialog.Cancel>Скасувати</AlertDialog.Cancel>
              </div>
            </AlertDialog.Content>
          )}
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  )
}

function PermissionChecklist({
  selected,
  onToggle,
  legend = 'Права ролі',
}: {
  selected: string[]
  onToggle: (this: void, permission: string) => void
  legend?: string
}) {
  return (
    <fieldset className="grid gap-2">
      <legend>{legend}</legend>
      {ALL_PERMISSIONS.map((permission) => (
        <label key={permission} className="flex gap-2">
          <input
            type="checkbox"
            aria-label={permission}
            checked={selected.includes(permission)}
            onChange={() => onToggle(permission)}
          />
          {permission}
        </label>
      ))}
    </fieldset>
  )
}
