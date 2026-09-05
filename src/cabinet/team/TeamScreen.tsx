import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import {
  Ban,
  KeyRound,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2,
} from 'lucide-react'
import { AlertDialog } from 'radix-ui'
import {
  Button,
  DataTable,
  DateValue,
  EmptyState,
  Field,
  FormDialog,
  Notice,
  PageBody,
  PageHeader,
  SectionPanel,
  SelectInput,
  SkeletonRows,
  StatusPill,
  TextInput,
  useOperation,
  type DataColumn,
  type StatusTone,
} from '@/components/app'
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
  /** What this action does, in the words of the person it happens to. */
  description: string
  /** Shown inside the dialog when the action fails, so the retry is one click. */
  failure: string
  confirm(): Promise<boolean>
}

type AccessRefreshState = 'ready' | 'refreshing' | 'failed'

const accessLostMessage =
  'Право керувати командою було змінено. Оновіть права або попросіть власника розбірки повернути доступ.'

/** The module each permission belongs to, so a role is composed, not hunted. */
const permissionGroupTitles: Record<string, string> = {
  cars: 'Автомобілі',
  parts: 'Запчастини',
  orders: 'Замовлення',
  customers: 'Клієнти',
  finance: 'Фінанси',
  intakes: 'Приймання',
  inventory: 'Інвентаризація',
  stickers: 'Стікери',
  reports: 'Звіти',
  team: 'Команда',
  billing: 'Підписка',
}

const permissionGroups = ALL_PERMISSIONS.reduce<
  { prefix: string; title: string; permissions: string[] }[]
>((groups, permission) => {
  const prefix = permission.split('.')[0] ?? permission
  const group = groups.find((candidate) => candidate.prefix === prefix)
  if (group) group.permissions.push(permission)
  else
    groups.push({
      prefix,
      title: permissionGroupTitles[prefix] ?? prefix,
      permissions: [permission],
    })
  return groups
}, [])

const invitationStatus = (
  invitation: InvitationDto,
): { label: string; tone: StatusTone } => {
  if (invitation.isUsed) return { label: 'Використано', tone: 'info' }
  if (invitation.isRevoked) return { label: 'Відкликано', tone: 'neutral' }
  if (invitation.isExpired) return { label: 'Прострочено', tone: 'warn' }
  return { label: 'Активне', tone: 'ok' }
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
  const roleAssignmentRef = useRef<{
    memberId: string
    roleId: string
  } | null>(null)
  const invitationRoleRef = useRef<string | null>(null)
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
      if (!signal.aborted)
        setError(
          'Не вдалося завантажити дані команди. Перевірте зв’язок і оновіть сторінку.',
        )
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
        'Дію виконано, але не вдалося оновити права. Натисніть «Оновити права», щоб продовжити роботу.',
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
        setError(accessLostMessage)
        return false
      }
      const signal = tenantRequestScope.signal
      setFeedback(null)
      setError(null)
      try {
        await operation(signal)
      } catch {
        // A dead request is reported where the user triggered it; a tenant
        // switch is not a failure, it is the old screen going away.
        if (signal.aborted) return false
        throw new Error('Не вдалося виконати дію. Спробуйте ще раз.')
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

  const roleAssignment = useOperation(
    async () => {
      const target = roleAssignmentRef.current
      if (target === null) return false
      return mutate('Роль учасника оновлено.', (signal) =>
        teamApi.changeRole(target.memberId, target.roleId, { signal }),
      )
    },
    {
      errorMessage: () =>
        'Не вдалося змінити роль учасника. Перевірте зв’язок і спробуйте ще раз.',
    },
  )

  const memberPermissions = useOperation(
    async () => {
      if (permissionMember === null) return false
      return mutate('Права учасника оновлено.', (signal) =>
        teamApi.updateUserPermissions(
          permissionMember.userId,
          selectedPermissions,
          { signal },
        ),
      )
    },
    {
      errorMessage: () =>
        'Не вдалося зберегти права. Перевірте зв’язок і спробуйте ще раз.',
      onSuccess: () => setPermissionMember(null),
    },
  )

  const roleUpdate = useOperation(
    async () => {
      if (editingRole === null) return false
      return mutate('Роль оновлено.', (signal) =>
        teamApi.updateRole(
          editingRole.id,
          {
            name: editingRoleName.trim(),
            permissions: editingRolePermissions,
          },
          { signal },
        ),
      )
    },
    {
      errorMessage: () =>
        'Не вдалося зберегти роль. Перевірте зв’язок і спробуйте ще раз.',
      onSuccess: () => setEditingRole(null),
    },
  )

  const roleCreation = useOperation(
    async () =>
      mutate('Роль створено.', (signal) =>
        teamApi.createRole(
          { name: newRoleName.trim(), permissions: newRolePermissions },
          { signal },
        ),
      ),
    {
      errorMessage: () =>
        'Не вдалося створити роль. Перевірте зв’язок і спробуйте ще раз.',
      onSuccess: (created) => {
        if (!created) return
        setNewRoleName('Нова роль')
        setNewRolePermissions(['orders.view'])
      },
    },
  )

  const invitationCreation = useOperation(
    async () => {
      const roleId = invitationRoleRef.current
      if (roleId === null) return false
      return mutate('Запрошення створено.', (signal) =>
        teamApi.createInvitation(roleId, { signal }),
      )
    },
    {
      errorMessage: () =>
        'Не вдалося створити запрошення. Перевірте зв’язок і спробуйте ще раз.',
    },
  )

  const confirmedAction = useOperation(
    async () => {
      if (confirmation === null) return false
      return confirmation.confirm()
    },
    {
      errorMessage: () =>
        confirmation?.failure ?? 'Не вдалося виконати дію. Спробуйте ще раз.',
      onSuccess: () => setConfirmation(null),
    },
  )

  const openPermissions = async (member: TeamMemberDto) => {
    if (!canManage()) {
      setError(accessLostMessage)
      return
    }
    const signal = tenantRequestScope.signal
    try {
      const result = await teamApi.getUserPermissions(member.userId, { signal })
      if (signal.aborted) return
      if (!canManage()) {
        setError(accessLostMessage)
        return
      }
      memberPermissions.reset()
      setPermissionMember(member)
      setSelectedPermissions(result.permissions)
    } catch {
      if (!signal.aborted)
        setError(
          'Не вдалося завантажити права учасника. Перевірте зв’язок і спробуйте ще раз.',
        )
    }
  }

  const openRoleEditor = (role: RoleDto) => {
    roleUpdate.reset()
    setEditingRole(role)
    setEditingRoleName(role.name)
    setEditingRolePermissions(role.permissions ?? [])
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
      setError(accessLostMessage)
      return
    }
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    confirmedAction.reset()
    setConfirmation(next)
  }

  const restoreFocus = () => restoreFocusRef.current?.focus()

  if (!canView) {
    return (
      <PageBody>
        <PageHeader eyebrow="Налаштування доступу" title="Команда" />
        <Notice role="alert" tone="danger">
          Недостатньо прав для перегляду команди. Попросіть власника розбірки
          відкрити вам розділ «Команда».
        </Notice>
      </PageBody>
    )
  }

  const pageError = error ?? roleAssignment.error

  const memberColumns: DataColumn<TeamMemberDto>[] = [
    {
      key: 'member',
      label: 'Учасник',
      variant: 'primary',
      cell: (member) => (
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate">{member.name}</span>
          {member.phone && (
            <span className="text-app-dim text-[12.5px]">{member.phone}</span>
          )}
        </span>
      ),
    },
    {
      key: 'role',
      label: 'Роль',
      cell: (member) =>
        canManageAccess ? (
          <SelectInput
            aria-busy={roleAssignment.pending}
            aria-label={`Роль для ${member.name}`}
            className="min-w-40"
            onChange={(event) => {
              roleAssignmentRef.current = {
                memberId: member.id,
                roleId: event.target.value,
              }
              roleAssignment.run()
            }}
            value={member.role.id}
          >
            {availableRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </SelectInput>
        ) : (
          member.role.name
        ),
    },
    {
      key: 'state',
      label: 'Стан',
      cell: (member) => (
        <StatusPill tone={member.isActive ? 'ok' : 'neutral'}>
          {member.isActive ? 'Активний' : 'Неактивний'}
        </StatusPill>
      ),
    },
    ...(canManageAccess
      ? [
          {
            key: 'actions',
            label: 'Дії',
            align: 'end' as const,
            headerHidden: true,
            cell: (member: TeamMemberDto) => (
              <span className="flex min-w-0 flex-wrap justify-end gap-2">
                <Button
                  aria-label={`Права ${member.name}`}
                  onClick={() => void openPermissions(member)}
                >
                  <KeyRound aria-hidden />
                  Права
                </Button>
                <Button
                  aria-label={
                    member.isActive
                      ? `Вимкнути ${member.name}`
                      : `Активувати ${member.name}`
                  }
                  onClick={() =>
                    askConfirmation({
                      title: member.isActive
                        ? 'Вимкнути учасника'
                        : 'Активувати учасника',
                      description: member.isActive
                        ? `${member.name} втратить доступ до кабінету. Ви зможете активувати цей обліковий запис пізніше.`
                        : `${member.name} знову отримає доступ до кабінету з роллю «${member.role.name}».`,
                      failure: member.isActive
                        ? 'Не вдалося вимкнути учасника. Перевірте зв’язок і спробуйте ще раз.'
                        : 'Не вдалося активувати учасника. Перевірте зв’язок і спробуйте ще раз.',
                      confirm: () =>
                        mutate(
                          member.isActive
                            ? 'Учасника вимкнено.'
                            : 'Учасника активовано.',
                          (signal) =>
                            member.isActive
                              ? teamApi.deactivateMember(member.id, { signal })
                              : teamApi.activateMember(member.id, { signal }),
                        ),
                    })
                  }
                >
                  {member.isActive ? (
                    <PowerOff aria-hidden />
                  ) : (
                    <Power aria-hidden />
                  )}
                  {member.isActive ? 'Вимкнути' : 'Активувати'}
                </Button>
                <Button
                  aria-label={`Видалити ${member.name}`}
                  onClick={() =>
                    askConfirmation({
                      title: 'Видалити учасника',
                      description: `${member.name} втратить доступ назавжди. Щоб повернути людину в команду, доведеться створити нове запрошення.`,
                      failure:
                        'Не вдалося видалити учасника. Перевірте зв’язок і спробуйте ще раз.',
                      confirm: () =>
                        mutate('Учасника видалено.', (signal) =>
                          teamApi.deleteMember(member.id, { signal }),
                        ),
                    })
                  }
                  variant="danger"
                >
                  <Trash2 aria-hidden />
                  Видалити
                </Button>
              </span>
            ),
          },
        ]
      : []),
  ]

  const roleColumns: DataColumn<RoleDto>[] = [
    {
      key: 'role',
      label: 'Роль',
      variant: 'primary',
      cell: (role) => role.name,
    },
    {
      key: 'kind',
      label: 'Тип',
      cell: (role) => (
        <StatusPill tone={role.isSystem ? 'info' : 'neutral'}>
          {role.isSystem ? 'Системна роль' : 'Власна роль'}
        </StatusPill>
      ),
    },
    {
      key: 'permissions',
      label: 'Права',
      cell: (role) =>
        `${String(role.permissions?.length ?? 0)} з ${String(ALL_PERMISSIONS.length)}`,
    },
    {
      key: 'members',
      label: 'Учасників',
      align: 'end',
      cell: (role) => role.membersCount ?? '—',
    },
    ...(canManageAccess
      ? [
          {
            key: 'actions',
            label: 'Дії',
            align: 'end' as const,
            headerHidden: true,
            cell: (role: RoleDto) =>
              role.isSystem ? (
                <span className="text-app-dim text-[12.5px]">
                  Змінам не підлягає
                </span>
              ) : (
                <span className="flex min-w-0 flex-wrap justify-end gap-2">
                  <Button
                    aria-label={`Редагувати ${role.name}`}
                    onClick={() => openRoleEditor(role)}
                  >
                    <Pencil aria-hidden />
                    Редагувати
                  </Button>
                  <Button
                    aria-label={`Видалити ${role.name}`}
                    onClick={() =>
                      askConfirmation({
                        title: 'Видалити роль',
                        description: `Роль «${role.name}» зникне зі списку. Учасникам із цією роллю доведеться призначити іншу.`,
                        failure:
                          'Не вдалося видалити роль. Перевірте зв’язок і спробуйте ще раз.',
                        confirm: () =>
                          mutate('Роль видалено.', (signal) =>
                            teamApi.deleteRole(role.id, { signal }),
                          ),
                      })
                    }
                    variant="danger"
                  >
                    <Trash2 aria-hidden />
                    Видалити
                  </Button>
                </span>
              ),
          },
        ]
      : []),
  ]

  const invitationColumns: DataColumn<InvitationDto>[] = [
    {
      key: 'code',
      label: 'Код',
      variant: 'primary',
      cell: (item) => <span className="font-mono">{item.code}</span>,
    },
    { key: 'role', label: 'Роль', cell: (item) => item.role.name },
    {
      key: 'state',
      label: 'Стан',
      cell: (item) => {
        const status = invitationStatus(item)
        return <StatusPill tone={status.tone}>{status.label}</StatusPill>
      },
    },
    {
      key: 'expires',
      label: 'Діє до',
      cell: (item) => <DateValue value={item.expiresAt} />,
    },
    ...(canManageAccess
      ? [
          {
            key: 'actions',
            label: 'Дії',
            align: 'end' as const,
            headerHidden: true,
            cell: (item: InvitationDto) =>
              invitationStatus(item).label === 'Активне' ? (
                <Button
                  aria-label={`Відкликати ${item.code}`}
                  onClick={() =>
                    askConfirmation({
                      title: 'Відкликати запрошення',
                      description: `Код ${item.code} перестане працювати. Створіть нове запрошення, якщо доступ ще потрібен.`,
                      failure:
                        'Не вдалося відкликати запрошення. Перевірте зв’язок і спробуйте ще раз.',
                      confirm: () =>
                        mutate('Запрошення відкликано.', (signal) =>
                          teamApi.revokeInvitation(item.id, { signal }),
                        ),
                    })
                  }
                  variant="danger"
                >
                  <Ban aria-hidden />
                  Відкликати
                </Button>
              ) : null,
          },
        ]
      : []),
  ]

  return (
    <PageBody className="gap-6">
      <PageHeader eyebrow="Налаштування доступу" title="Команда" />
      <p className="text-app-muted text-sm">
        Керуйте учасниками, ролями та запрошеннями розбірки.
      </p>

      {feedback && <Notice tone="ok">{feedback}</Notice>}
      {pageError && <Notice tone="danger">{pageError}</Notice>}
      {accessWarning && (
        <Notice
          action={
            <Button
              disabled={accessRefreshState === 'refreshing'}
              onClick={() => {
                void refreshAccess()
              }}
            >
              Оновити права
            </Button>
          }
          role="alert"
          tone="warn"
        >
          {accessWarning}
        </Notice>
      )}
      {loading && <SkeletonRows label="Завантажуємо команду…" />}

      {teamData && (
        <>
          <section
            aria-labelledby="team-members-heading"
            className="grid min-w-0 gap-3"
          >
            <div className="grid gap-1">
              <h2
                className="text-base font-semibold text-white"
                id="team-members-heading"
              >
                Учасники
              </h2>
              <p className="text-app-dim text-[12.5px]">
                Роль визначає, що людина бачить у кабінеті. Індивідуальні права
                додаються поверх ролі.
              </p>
            </div>
            <DataTable
              caption="Учасники команди"
              columns={memberColumns}
              empty={
                <EmptyState
                  description="Створіть запрошення нижче й надішліть код людині, яку берете в команду."
                  title="У команді поки лише ви"
                />
              }
              rowKey={(member) => member.id}
              rows={teamData.members}
            />
          </section>

          <section
            aria-labelledby="team-roles-heading"
            className="grid min-w-0 gap-3"
          >
            <div className="grid gap-1">
              <h2
                className="text-base font-semibold text-white"
                id="team-roles-heading"
              >
                Ролі
              </h2>
              <p className="text-app-dim text-[12.5px]">
                Системні ролі змінити не можна — створіть власну й дайте їй
                рівно ті права, що потрібні.
              </p>
            </div>
            <DataTable
              caption="Ролі команди"
              columns={roleColumns}
              empty={
                <EmptyState
                  description="Ролі визначають доступ до модулів кабінету."
                  title="Ролей поки немає"
                />
              }
              rowKey={(role) => role.id}
              rows={teamData.roles}
            />
            {canManageAccess && (
              <SectionPanel
                description="Назвіть роль так, як її називають у розбірці, і позначте потрібні права."
                title="Нова роль"
              >
                <form
                  className="grid min-w-0 gap-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    roleCreation.run()
                  }}
                >
                  {roleCreation.error !== null && (
                    <Notice tone="danger">{roleCreation.error}</Notice>
                  )}
                  <Field
                    hint="Наприклад: Диспетчер, Комірник, Продавець."
                    label="Назва нової ролі"
                    required
                  >
                    <TextInput
                      onChange={(event) => setNewRoleName(event.target.value)}
                      value={newRoleName}
                    />
                  </Field>
                  <PermissionChecklist
                    onToggle={toggleNewRolePermission}
                    selected={newRolePermissions}
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      {...roleCreation.triggerProps}
                      disabled={
                        roleCreation.pending ||
                        !newRoleName.trim() ||
                        newRolePermissions.length === 0
                      }
                      type="submit"
                      variant="primary"
                    >
                      <Plus aria-hidden />
                      Створити роль
                    </Button>
                  </div>
                </form>
              </SectionPanel>
            )}
          </section>

          <section
            aria-labelledby="team-invitations-heading"
            className="grid min-w-0 gap-3"
          >
            <div className="grid gap-1">
              <h2
                className="text-base font-semibold text-white"
                id="team-invitations-heading"
              >
                Запрошення
              </h2>
              <p className="text-app-dim text-[12.5px]">
                Запрошення — це код, який людина вводить під час реєстрації. Він
                діє до вказаної дати.
              </p>
            </div>
            {canManageAccess && (
              <form
                className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end"
                onSubmit={(event) => {
                  event.preventDefault()
                  const form = new FormData(event.currentTarget)
                  const roleId = form.get('invitation-role')
                  if (typeof roleId === 'string' && roleId) {
                    invitationRoleRef.current = roleId
                    invitationCreation.run()
                  }
                }}
              >
                <Field label="Роль для запрошення">
                  <SelectInput name="invitation-role">
                    {availableRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Button
                  {...invitationCreation.triggerProps}
                  type="submit"
                  variant="primary"
                >
                  <Plus aria-hidden />
                  Створити запрошення
                </Button>
              </form>
            )}
            {invitationCreation.error !== null && (
              <Notice tone="danger">{invitationCreation.error}</Notice>
            )}
            <DataTable
              caption="Запрошення до команди"
              columns={invitationColumns}
              empty={
                <EmptyState
                  description="Створіть запрошення й надішліть код людині — вона приєднається сама."
                  title="Запрошень поки немає"
                />
              }
              rowKey={(item) => item.id}
              rows={teamData.invitations}
            />
          </section>
        </>
      )}

      {editingRole !== null && (
        <FormDialog
          description="Змініть назву та права ролі. Зміни діють одразу для всіх, хто має цю роль."
          error={roleUpdate.error}
          onOpenChange={(open) => {
            if (!open) setEditingRole(null)
          }}
          onSubmit={(event) => {
            event.preventDefault()
            roleUpdate.run()
          }}
          open
          pending={roleUpdate.pending}
          size="lg"
          submitDisabled={
            !canManageAccess ||
            !editingRoleName.trim() ||
            editingRolePermissions.length === 0
          }
          submitLabel="Зберегти роль"
          title={`Роль: ${editingRole.name}`}
        >
          <Field label="Назва ролі" required>
            <TextInput
              onChange={(event) => setEditingRoleName(event.target.value)}
              value={editingRoleName}
            />
          </Field>
          <PermissionChecklist
            onToggle={toggleEditingRolePermission}
            selected={editingRolePermissions}
          />
        </FormDialog>
      )}

      {permissionMember !== null && (
        <FormDialog
          description={`Індивідуальні права для ${permissionMember.name}. Вони замінюють права ролі «${permissionMember.role.name}».`}
          error={memberPermissions.error}
          onOpenChange={(open) => {
            if (!open) setPermissionMember(null)
          }}
          onSubmit={(event) => {
            event.preventDefault()
            memberPermissions.run()
          }}
          open
          pending={memberPermissions.pending}
          size="lg"
          submitDisabled={!canManageAccess}
          submitLabel="Зберегти права"
          title={`Права: ${permissionMember.name}`}
        >
          <PermissionChecklist
            legend="Права користувача"
            onToggle={toggleUserPermission}
            selected={selectedPermissions}
          />
        </FormDialog>
      )}

      <AlertDialog.Root
        onOpenChange={(open) => {
          if (!open && !confirmedAction.pending) setConfirmation(null)
        }}
        open={confirmation !== null}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
          {confirmation && (
            <AlertDialog.Content
              className="bg-app-overlay border-app-line-2 rounded-sheet fixed inset-x-3 top-1/2 z-50 grid max-w-md -translate-y-1/2 gap-3 border p-5 text-white shadow-2xl sm:inset-x-auto sm:left-1/2 sm:w-full sm:-translate-x-1/2"
              onCloseAutoFocus={restoreFocus}
            >
              <AlertDialog.Title className="text-lg font-semibold">
                {confirmation.title}
              </AlertDialog.Title>
              <AlertDialog.Description className="text-app-muted text-sm leading-6">
                {confirmation.description}
              </AlertDialog.Description>
              {confirmedAction.error !== null && (
                <Notice tone="danger">{confirmedAction.error}</Notice>
              )}
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                {/* Cancel first, and focused on open: the way out of a
                    destructive question is never the default. */}
                <AlertDialog.Cancel asChild>
                  <Button disabled={confirmedAction.pending}>Скасувати</Button>
                </AlertDialog.Cancel>
                <AlertDialog.Action asChild>
                  <Button
                    aria-busy={confirmedAction.pending}
                    disabled={!canManageAccess || confirmedAction.pending}
                    onClick={(event) => {
                      event.preventDefault()
                      confirmedAction.run()
                    }}
                    variant="danger"
                  >
                    Підтвердити
                  </Button>
                </AlertDialog.Action>
              </div>
            </AlertDialog.Content>
          )}
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </PageBody>
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
    <fieldset className="grid min-w-0 gap-3">
      <legend className="text-app-dim mb-1 text-[12.5px]">
        {legend} — обрано{' '}
        {ALL_PERMISSIONS.filter((item) => selected.includes(item)).length} з{' '}
        {ALL_PERMISSIONS.length}
      </legend>
      {permissionGroups.map((group) => (
        <fieldset className="grid min-w-0 gap-1" key={group.prefix}>
          <legend className="text-app-dim font-mono text-[10.5px] tracking-[0.08em] uppercase">
            {group.title}
          </legend>
          <div className="grid min-w-0 gap-1 sm:grid-cols-2">
            {group.permissions.map((permission) => (
              <label
                className="text-app-muted rounded-control flex min-h-11 min-w-11 items-center gap-2.5 px-2 font-mono text-[12.5px] hover:bg-white/[0.04]"
                key={permission}
              >
                <input
                  aria-label={permission}
                  checked={selected.includes(permission)}
                  className="accent-brand size-4 shrink-0"
                  onChange={() => onToggle(permission)}
                  type="checkbox"
                />
                {permission}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </fieldset>
  )
}
