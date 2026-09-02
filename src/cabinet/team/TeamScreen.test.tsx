/* eslint-disable @typescript-eslint/unbound-method -- Vitest resolves object methods into typed mocks. */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/app'
import {
  teamApi,
  type InvitationDto,
  type RoleDto,
  type TeamMemberDto,
} from '@/api/team'
import { useCabinet, type CabinetContextValue } from '../CabinetContext'
import { cabinetModules } from '../module-registry'
import { tenantRequestScope } from '../tenant-request-scope'
import { TeamScreen } from './TeamScreen'

vi.mock('@/api/team', () => ({
  teamApi: {
    listMembers: vi.fn(),
    getMember: vi.fn(),
    changeRole: vi.fn(),
    deactivateMember: vi.fn(),
    activateMember: vi.fn(),
    deleteMember: vi.fn(),
    listRoles: vi.fn(),
    getRole: vi.fn(),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn(),
    getUserPermissions: vi.fn(),
    updateUserPermissions: vi.fn(),
    listInvitations: vi.fn(),
    createInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
  },
}))
vi.mock('../CabinetContext', () => ({ useCabinet: vi.fn() }))

const ownerRole: RoleDto = {
  id: 'role-owner',
  name: 'Власник',
  isSystem: true,
  permissions: ['team.view', 'team.manage'],
  membersCount: 1,
}

const mechanicRole: RoleDto = {
  id: 'role-mechanic',
  name: 'Механік',
  isSystem: false,
  permissions: ['parts.view'],
  membersCount: 1,
}

const member: TeamMemberDto = {
  id: 'member-1',
  userId: 'user-1',
  name: 'Олена',
  phone: '+380501112233',
  role: mechanicRole,
  isActive: true,
  joinedAt: '2026-08-01T10:00:00Z',
}

const invitation = (overrides: Partial<InvitationDto> = {}): InvitationDto => ({
  id: 'invite-1',
  code: 'INVITE-1',
  role: mechanicRole,
  expiresAt: '2026-09-01T10:00:00Z',
  createdAt: '2026-08-01T10:00:00Z',
  isUsed: false,
  isRevoked: false,
  isExpired: false,
  ...overrides,
})

const cabinet = (permissions = ['team.view', 'team.manage']) =>
  ({
    status: 'ready',
    targetTenant: {
      id: 'tenant-1',
      name: 'Koval Auto',
      slug: 'koval',
      plan: 'trial',
      planTier: 'pro',
      city: null,
      logoUrl: null,
      isActive: true,
      createdAt: '2026-08-01T10:00:00Z',
      roleName: 'owner',
    },
    snapshot: {
      userId: 'user-owner',
      tenantId: 'tenant-1',
      generation: 1,
      role: 'owner',
      permissions: new Set(permissions),
      features: new Set<string>(),
      entitlement: null,
      subscription: null,
    },
    error: null,
    retry: vi.fn(),
    switchTenant: vi.fn(),
  }) satisfies CabinetContextValue

/** `useOperation` reports through the toast api the cabinet shell provides. */
const teamScreen = () => (
  <ToastProvider>
    <TeamScreen definition={cabinetModules.team} />
  </ToastProvider>
)
const renderScreen = () => render(teamScreen())

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  tenantRequestScope.rotate()
  vi.mocked(useCabinet).mockReturnValue(cabinet())
  vi.mocked(teamApi.listMembers).mockResolvedValue([member])
  vi.mocked(teamApi.listRoles).mockResolvedValue([ownerRole, mechanicRole])
  vi.mocked(teamApi.listInvitations).mockResolvedValue([invitation()])
  vi.mocked(teamApi.changeRole).mockResolvedValue({
    ...member,
    role: ownerRole,
  })
  vi.mocked(teamApi.deactivateMember).mockResolvedValue(undefined)
  vi.mocked(teamApi.activateMember).mockResolvedValue(undefined)
  vi.mocked(teamApi.deleteMember).mockResolvedValue(undefined)
  vi.mocked(teamApi.createRole).mockResolvedValue(mechanicRole)
  vi.mocked(teamApi.updateRole).mockResolvedValue(mechanicRole)
  vi.mocked(teamApi.deleteRole).mockResolvedValue(undefined)
  vi.mocked(teamApi.getUserPermissions).mockResolvedValue({
    userId: 'user-1',
    roleName: 'Механік',
    permissions: ['parts.view'],
  })
  vi.mocked(teamApi.updateUserPermissions).mockResolvedValue({
    userId: 'user-1',
    roleName: 'Механік',
    permissions: ['parts.view'],
  })
  vi.mocked(teamApi.createInvitation).mockResolvedValue(invitation())
  vi.mocked(teamApi.revokeInvitation).mockResolvedValue(undefined)
})

it('loads the member, role, and invitation lifecycle with tenant cancellation', async () => {
  renderScreen()

  expect(
    await screen.findByRole('heading', { name: 'Команда' }),
  ).toBeInTheDocument()
  expect(await screen.findByText('Олена')).toBeInTheDocument()
  expect(screen.getAllByText('Власник').length).toBeGreaterThan(0)
  expect(screen.getByText('Активне')).toBeInTheDocument()
  expect(teamApi.listMembers).toHaveBeenCalledWith({
    signal: tenantRequestScope.signal,
  })
  expect(teamApi.listRoles).toHaveBeenCalledWith({
    signal: tenantRequestScope.signal,
  })
  expect(teamApi.listInvitations).toHaveBeenCalledWith({
    signal: tenantRequestScope.signal,
  })

  const options = vi.mocked(teamApi.listMembers).mock.calls[0]?.[0]
  tenantRequestScope.rotate()
  expect(options?.signal?.aborted).toBe(true)
})

it('marks invitation lifecycle states and only allows revoking active invitations', async () => {
  vi.mocked(teamApi.listInvitations).mockResolvedValue([
    invitation({ id: 'active' }),
    invitation({ id: 'used', isUsed: true }),
    invitation({ id: 'revoked', isRevoked: true }),
    invitation({ id: 'expired', isExpired: true }),
  ])

  renderScreen()

  expect(await screen.findByText('Використано')).toBeInTheDocument()
  expect(screen.getByText('Відкликано')).toBeInTheDocument()
  expect(screen.getByText('Прострочено')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /^Відкликати/ })).toHaveLength(1)
})

it('protects system roles while allowing custom roles to be managed', async () => {
  renderScreen()

  expect(await screen.findByText('Системна роль')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Видалити Власник' })).toBeNull()
  expect(
    screen.getByRole('button', { name: 'Видалити Механік' }),
  ).toBeInTheDocument()
})

it('hides every mutation control without team.manage', async () => {
  vi.mocked(useCabinet).mockReturnValue(cabinet(['team.view']))

  renderScreen()

  expect(await screen.findByText('Олена')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', {
      name: /Вимкнути|Активувати|Видалити|Права|Створити|Відкликати/,
    }),
  ).toBeNull()
  expect(screen.queryByLabelText('Роль для Олена')).toBeNull()
  expect(screen.queryByLabelText('Назва нової ролі')).toBeNull()
})

it('revalidates team.manage immediately before member, role, permission, and invitation mutations', async () => {
  const currentCabinet = cabinet()
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const user = userEvent.setup()
  renderScreen()

  await screen.findByText('Олена')
  const changeRole = screen.getByLabelText('Роль для Олена')
  const permissions = screen.getByRole('button', { name: 'Права Олена' })
  const createRole = screen.getByRole('button', { name: 'Створити роль' })
  const createInvitation = screen.getByRole('button', {
    name: 'Створити запрошення',
  })
  const revokeInvitation = screen.getByRole('button', {
    name: 'Відкликати INVITE-1',
  })
  const deleteRole = screen.getByRole('button', { name: 'Видалити Механік' })
  currentCabinet.snapshot?.permissions.delete('team.manage')

  await user.selectOptions(changeRole, 'role-owner')
  await user.click(permissions)
  await user.click(createRole)
  await user.click(createInvitation)
  await user.click(revokeInvitation)
  await user.click(deleteRole)

  expect(teamApi.changeRole).not.toHaveBeenCalled()
  expect(teamApi.getUserPermissions).not.toHaveBeenCalled()
  expect(teamApi.createRole).not.toHaveBeenCalled()
  expect(teamApi.createInvitation).not.toHaveBeenCalled()
  expect(teamApi.revokeInvitation).not.toHaveBeenCalled()
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

it('confirms and completes member, role, permission, and invitation mutations', async () => {
  const currentCabinet = cabinet()
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const user = userEvent.setup()
  renderScreen()

  await screen.findByText('Олена')
  await user.selectOptions(
    screen.getByLabelText('Роль для Олена'),
    'role-owner',
  )
  await waitFor(() =>
    expect(teamApi.changeRole).toHaveBeenCalledWith('member-1', 'role-owner', {
      signal: tenantRequestScope.signal,
    }),
  )

  await user.click(screen.getByRole('button', { name: 'Права Олена' }))
  await screen.findByRole('dialog', { name: 'Права: Олена' })
  await user.click(screen.getByRole('button', { name: 'Зберегти права' }))
  expect(teamApi.updateUserPermissions).toHaveBeenCalledWith(
    'user-1',
    ['parts.view'],
    { signal: tenantRequestScope.signal },
  )

  await user.click(screen.getByRole('button', { name: 'Відкликати INVITE-1' }))
  expect(screen.getByRole('alertdialog')).toHaveTextContent(
    'Відкликати запрошення',
  )
  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))
  expect(teamApi.revokeInvitation).toHaveBeenCalledWith('invite-1', {
    signal: tenantRequestScope.signal,
  })
  expect(currentCabinet.retry).toHaveBeenCalledTimes(3)
})

it('does not load or render team data without team.view', async () => {
  vi.mocked(useCabinet).mockReturnValue(cabinet(['parts.view']))

  renderScreen()

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Недостатньо прав для перегляду команди.',
  )
  expect(teamApi.listMembers).not.toHaveBeenCalled()
  expect(teamApi.listRoles).not.toHaveBeenCalled()
  expect(teamApi.listInvitations).not.toHaveBeenCalled()
  expect(screen.queryByText('Олена')).toBeNull()
})

it('clears old tenant data, aborts stale work, and starts a new load on tenant generation change', async () => {
  const currentCabinet = cabinet()
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const secondMember = { ...member, id: 'member-2', name: 'Іван' }
  vi.mocked(teamApi.listMembers)
    .mockResolvedValueOnce([member])
    .mockResolvedValueOnce([secondMember])
  vi.mocked(teamApi.listRoles)
    .mockResolvedValueOnce([ownerRole, mechanicRole])
    .mockResolvedValueOnce([ownerRole, mechanicRole])
  vi.mocked(teamApi.listInvitations)
    .mockResolvedValueOnce([invitation()])
    .mockResolvedValueOnce([invitation({ id: 'invite-2' })])
  const view = renderScreen()

  expect(await screen.findByText('Олена')).toBeInTheDocument()
  const previousSignal = vi.mocked(teamApi.listMembers).mock.calls[0]?.[0]
  currentCabinet.targetTenant = {
    ...currentCabinet.targetTenant,
    id: 'tenant-2',
    slug: 'other-garage',
  }
  currentCabinet.snapshot = {
    ...currentCabinet.snapshot,
    tenantId: 'tenant-2',
    generation: 2,
  }
  tenantRequestScope.rotate()
  view.rerender(teamScreen())

  expect(previousSignal?.signal?.aborted).toBe(true)
  expect(screen.queryByText('Олена')).toBeNull()
  expect(await screen.findByText('Іван')).toBeInTheDocument()
  expect(teamApi.listMembers).toHaveBeenCalledTimes(2)
})

it('refreshes authoritative cabinet access after an access-changing direct mutation', async () => {
  const currentCabinet = cabinet()
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const user = userEvent.setup()
  renderScreen()

  await user.selectOptions(
    await screen.findByLabelText('Роль для Олена'),
    'role-owner',
  )

  await waitFor(() => expect(currentCabinet.retry).toHaveBeenCalledOnce())
  expect(screen.getByRole('status')).toHaveTextContent(
    'Роль учасника оновлено.',
  )
})

it('blocks a second mutation while the authoritative access retry is unresolved', async () => {
  const currentCabinet = cabinet()
  const accessRetry = deferred<void>()
  currentCabinet.retry = vi.fn(() => accessRetry.promise)
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const user = userEvent.setup()
  renderScreen()

  await user.click(
    await screen.findByRole('button', { name: 'Редагувати Механік' }),
  )
  const roleDialog = await screen.findByRole('dialog', {
    name: 'Роль: Механік',
  })
  const saveRole = within(roleDialog).getByRole('button', {
    name: 'Зберегти роль',
  })

  await user.click(saveRole)
  await waitFor(() => expect(teamApi.updateRole).toHaveBeenCalledOnce())
  await waitFor(() => expect(currentCabinet.retry).toHaveBeenCalledOnce())

  expect(saveRole).toBeDisabled()
  const roleForm = saveRole.closest('form')
  expect(roleForm).not.toBeNull()
  fireEvent.submit(roleForm!)
  expect(teamApi.updateRole).toHaveBeenCalledOnce()

  accessRetry.resolve(undefined)
})

it('does not read team data before an access-changing mutation retry settles', async () => {
  const currentCabinet = cabinet()
  const accessRetry = deferred<void>()
  currentCabinet.retry = vi.fn(() => accessRetry.promise)
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const user = userEvent.setup()
  renderScreen()

  await user.selectOptions(
    await screen.findByLabelText('Роль для Олена'),
    'role-owner',
  )
  await waitFor(() => expect(currentCabinet.retry).toHaveBeenCalledOnce())

  const readsBeforeAccessSettles = [
    vi.mocked(teamApi.listMembers).mock.calls.length,
    vi.mocked(teamApi.listRoles).mock.calls.length,
    vi.mocked(teamApi.listInvitations).mock.calls.length,
  ]
  accessRetry.resolve(undefined)

  expect(readsBeforeAccessSettles).toEqual([1, 1, 1])
  await waitFor(() => expect(teamApi.listMembers).toHaveBeenCalledTimes(2))
  expect(teamApi.listRoles).toHaveBeenCalledTimes(2)
  expect(teamApi.listInvitations).toHaveBeenCalledTimes(2)
})

it('reloads only the current cabinet identity after a retry changes generation', async () => {
  const currentCabinet = cabinet()
  const accessRetry = deferred<void>()
  const currentIdentityReload = deferred<TeamMemberDto[]>()
  const initialSignal = tenantRequestScope.signal
  const currentMember = { ...member, id: 'member-2', name: 'Іван' }
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  vi.mocked(teamApi.listMembers)
    .mockResolvedValueOnce([member])
    .mockImplementation((options) =>
      options?.signal === initialSignal
        ? Promise.resolve([{ ...member, isActive: false }])
        : currentIdentityReload.promise,
    )
  const user = userEvent.setup()
  const view = renderScreen()
  currentCabinet.retry = vi.fn(() => {
    currentCabinet.targetTenant = {
      ...currentCabinet.targetTenant,
      id: 'tenant-2',
      slug: 'other-garage',
    }
    currentCabinet.snapshot = {
      ...currentCabinet.snapshot,
      tenantId: 'tenant-2',
      generation: 2,
    }
    tenantRequestScope.rotate()
    view.rerender(teamScreen())
    return accessRetry.promise
  })

  await user.click(
    await screen.findByRole('button', { name: 'Вимкнути Олена' }),
  )
  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))
  await waitFor(() => expect(currentCabinet.retry).toHaveBeenCalledOnce())

  const readsBeforeAccessSettles = [
    vi.mocked(teamApi.listMembers).mock.calls.length,
    vi.mocked(teamApi.listRoles).mock.calls.length,
    vi.mocked(teamApi.listInvitations).mock.calls.length,
  ]
  const currentSignal = tenantRequestScope.signal
  accessRetry.resolve(undefined)
  await waitFor(() =>
    expect(
      vi
        .mocked(teamApi.listMembers)
        .mock.calls.some(([options]) => options?.signal === currentSignal),
    ).toBe(true),
  )
  currentIdentityReload.resolve([currentMember])

  expect(await screen.findByText('Іван')).toBeInTheDocument()
  expect(screen.queryByText('Олена')).toBeNull()
  expect(readsBeforeAccessSettles).toEqual([1, 1, 1])
  for (const listOperation of [
    teamApi.listMembers,
    teamApi.listRoles,
    teamApi.listInvitations,
  ]) {
    expect(vi.mocked(listOperation).mock.calls).toHaveLength(2)
    expect(vi.mocked(listOperation).mock.calls[1]?.[0]?.signal).toBe(
      currentSignal,
    )
  }
})

it('keeps mutation controls fail-closed when authoritative access retry fails', async () => {
  const currentCabinet = cabinet()
  const accessRetry = deferred<void>()
  currentCabinet.retry = vi.fn(() => accessRetry.promise)
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const user = userEvent.setup()
  renderScreen()

  await user.selectOptions(
    await screen.findByLabelText('Роль для Олена'),
    'role-owner',
  )
  await waitFor(() => expect(currentCabinet.retry).toHaveBeenCalledOnce())
  accessRetry.reject(new Error('offline'))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'не вдалося оновити права',
  )
  expect(screen.queryByLabelText('Роль для Олена')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Створити роль' })).toBeNull()
  expect(
    screen.queryByRole('button', { name: 'Створити запрошення' }),
  ).toBeNull()
  expect(teamApi.createRole).not.toHaveBeenCalled()
  expect(teamApi.createInvitation).not.toHaveBeenCalled()
})

it('refreshes access before the access-warning retry starts any team reads', async () => {
  const currentCabinet = cabinet()
  const failedAccessRetry = deferred<void>()
  const successfulAccessRetry = deferred<void>()
  const teamReload = deferred<TeamMemberDto[]>()
  currentCabinet.retry = vi
    .fn()
    .mockImplementationOnce(() => failedAccessRetry.promise)
    .mockImplementationOnce(() => successfulAccessRetry.promise)
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const user = userEvent.setup()
  renderScreen()

  await user.selectOptions(
    await screen.findByLabelText('Роль для Олена'),
    'role-owner',
  )
  await waitFor(() => expect(currentCabinet.retry).toHaveBeenCalledOnce())
  failedAccessRetry.reject(new Error('offline'))
  const retryAccess = await screen.findByRole('button', {
    name: 'Оновити права',
  })

  vi.mocked(teamApi.listMembers).mockClear()
  vi.mocked(teamApi.listRoles).mockClear()
  vi.mocked(teamApi.listInvitations).mockClear()
  vi.mocked(teamApi.listMembers).mockImplementationOnce(
    () => teamReload.promise,
  )

  await user.click(retryAccess)
  const retryCallsBeforeTeamSettles = vi.mocked(currentCabinet.retry).mock.calls
    .length
  const readsBeforeAccessSettles = [
    vi.mocked(teamApi.listMembers).mock.calls.length,
    vi.mocked(teamApi.listRoles).mock.calls.length,
    vi.mocked(teamApi.listInvitations).mock.calls.length,
  ]

  successfulAccessRetry.resolve(undefined)
  await waitFor(() => expect(teamApi.listMembers).toHaveBeenCalledOnce())
  teamReload.resolve([member])
  await waitFor(() => expect(currentCabinet.retry).toHaveBeenCalledTimes(2))

  expect(retryCallsBeforeTeamSettles).toBe(2)
  expect(readsBeforeAccessSettles).toEqual([0, 0, 0])
})

it('denies a confirmation when team.manage is revoked after the dialog opens', async () => {
  const currentCabinet = cabinet()
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const user = userEvent.setup()
  renderScreen()

  await user.click(
    await screen.findByRole('button', { name: 'Вимкнути Олена' }),
  )
  expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  currentCabinet.snapshot?.permissions.delete('team.manage')
  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))

  expect(teamApi.deactivateMember).not.toHaveBeenCalled()
  expect(currentCabinet.retry).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Право керувати командою було змінено.',
  )
})

it('denies direct permission edits when team.manage is revoked after the editor opens', async () => {
  const currentCabinet = cabinet()
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const user = userEvent.setup()
  renderScreen()

  await user.click(await screen.findByRole('button', { name: 'Права Олена' }))
  await screen.findByRole('dialog', { name: 'Права: Олена' })
  currentCabinet.snapshot?.permissions.delete('team.manage')
  await user.click(screen.getByRole('button', { name: 'Зберегти права' }))

  expect(teamApi.updateUserPermissions).not.toHaveBeenCalled()
  expect(currentCabinet.retry).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Право керувати командою було змінено.',
  )
})

it('creates and edits roles with arbitrary permissions and refreshes cabinet access', async () => {
  const currentCabinet = cabinet()
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const user = userEvent.setup()
  renderScreen()

  await screen.findByText('Олена')
  await user.clear(screen.getByLabelText('Назва нової ролі'))
  await user.type(screen.getByLabelText('Назва нової ролі'), 'Диспетчер')
  await user.click(screen.getByLabelText('team.manage'))
  await user.click(screen.getByRole('button', { name: 'Створити роль' }))
  await waitFor(() =>
    expect(teamApi.createRole).toHaveBeenCalledWith(
      { name: 'Диспетчер', permissions: ['orders.view', 'team.manage'] },
      { signal: tenantRequestScope.signal },
    ),
  )

  await user.click(screen.getByRole('button', { name: 'Редагувати Механік' }))
  const roleDialog = await screen.findByRole('dialog', {
    name: 'Роль: Механік',
  })
  await user.click(within(roleDialog).getByLabelText('team.manage'))
  await user.click(
    within(roleDialog).getByRole('button', { name: 'Зберегти роль' }),
  )
  await waitFor(() =>
    expect(teamApi.updateRole).toHaveBeenCalledWith(
      'role-mechanic',
      { name: 'Механік', permissions: ['parts.view', 'team.manage'] },
      { signal: tenantRequestScope.signal },
    ),
  )
  expect(currentCabinet.retry).toHaveBeenCalledTimes(2)
})

it('refreshes access after member, role, and invitation confirmation mutations', async () => {
  const currentCabinet = cabinet()
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const user = userEvent.setup()
  renderScreen()

  await user.click(
    await screen.findByRole('button', { name: 'Вимкнути Олена' }),
  )
  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))
  await waitFor(() => expect(teamApi.deactivateMember).toHaveBeenCalledOnce())

  await user.click(screen.getByRole('button', { name: 'Видалити Олена' }))
  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))
  await waitFor(() => expect(teamApi.deleteMember).toHaveBeenCalledOnce())

  await user.click(screen.getByRole('button', { name: 'Видалити Механік' }))
  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))
  await waitFor(() => expect(teamApi.deleteRole).toHaveBeenCalledOnce())

  await user.click(screen.getByRole('button', { name: 'Відкликати INVITE-1' }))
  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))
  await waitFor(() => expect(teamApi.revokeInvitation).toHaveBeenCalledOnce())

  expect(currentCabinet.retry).toHaveBeenCalledTimes(4)
  expect(screen.getByRole('status')).toHaveTextContent('Запрошення відкликано.')
})

it('refreshes access after activating a member', async () => {
  const currentCabinet = cabinet()
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  vi.mocked(teamApi.listMembers).mockResolvedValue([
    { ...member, isActive: false },
  ])
  const user = userEvent.setup()
  renderScreen()

  await user.click(
    await screen.findByRole('button', { name: 'Активувати Олена' }),
  )
  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))

  await waitFor(() => expect(teamApi.activateMember).toHaveBeenCalledOnce())
  expect(currentCabinet.retry).toHaveBeenCalledOnce()
  expect(screen.getByRole('status')).toHaveTextContent('Учасника активовано.')
})

it('supports Escape dismissal and restores focus to the confirmation trigger', async () => {
  const user = userEvent.setup()
  renderScreen()

  const trigger = await screen.findByRole('button', {
    name: 'Відкликати INVITE-1',
  })
  await user.click(trigger)
  expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Скасувати' })).toHaveFocus()
  await user.keyboard('{Escape}')

  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(trigger).toHaveFocus()
})

it('creates an invitation and refreshes the visible invitation lifecycle', async () => {
  const currentCabinet = cabinet()
  const createdInvitation = invitation({ id: 'invite-2', code: 'INVITE-NEW' })
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  vi.mocked(teamApi.listInvitations)
    .mockResolvedValueOnce([invitation()])
    .mockResolvedValueOnce([invitation(), createdInvitation])
  const user = userEvent.setup()
  renderScreen()

  await user.selectOptions(
    await screen.findByLabelText('Роль для запрошення'),
    'role-mechanic',
  )
  await user.click(screen.getByRole('button', { name: 'Створити запрошення' }))

  await waitFor(() =>
    expect(teamApi.createInvitation).toHaveBeenCalledWith('role-mechanic', {
      signal: tenantRequestScope.signal,
    }),
  )
  expect(await screen.findByText('INVITE-NEW')).toBeInTheDocument()
  expect(screen.getAllByText('Активне')).toHaveLength(2)
  expect(currentCabinet.retry).toHaveBeenCalledOnce()
})

it('refreshes visible member data after a successful member mutation', async () => {
  const currentCabinet = cabinet()
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  vi.mocked(teamApi.listMembers)
    .mockResolvedValueOnce([member])
    .mockResolvedValueOnce([{ ...member, isActive: false }])
  const user = userEvent.setup()
  renderScreen()

  await user.click(
    await screen.findByRole('button', { name: 'Вимкнути Олена' }),
  )
  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))

  expect(await screen.findByText('Неактивний')).toBeInTheDocument()
  expect(currentCabinet.retry).toHaveBeenCalledOnce()
})

it('keeps mutation success without calling it a failure when authoritative access refresh fails', async () => {
  const currentCabinet = cabinet()
  const accessRetry = deferred<void>()
  currentCabinet.retry = vi.fn(() => accessRetry.promise)
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const user = userEvent.setup()
  renderScreen()

  await user.click(
    await screen.findByRole('button', { name: 'Вимкнути Олена' }),
  )
  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))
  await waitFor(() => expect(currentCabinet.retry).toHaveBeenCalledOnce())
  accessRetry.reject(new Error('offline'))

  expect(await screen.findByText('Активний')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Учасника вимкнено.')
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Дію виконано, але не вдалося оновити права.',
  )
  expect(
    screen.getByRole('button', { name: 'Оновити права' }),
  ).toBeInTheDocument()
  expect(screen.queryByText('Не вдалося виконати дію.')).toBeNull()
  expect(teamApi.listMembers).toHaveBeenCalledOnce()
})

it('keeps old data hidden across a retry generation switch until the current identity reloads', async () => {
  const currentCabinet = cabinet()
  const accessRetry = deferred<void>()
  const newReload = deferred<TeamMemberDto[]>()
  const initialSignal = tenantRequestScope.signal
  const newMember = { ...member, id: 'member-2', name: 'Іван' }
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  vi.mocked(teamApi.listMembers)
    .mockResolvedValueOnce([member])
    .mockImplementation((options) =>
      options?.signal === initialSignal
        ? Promise.resolve([{ ...member, isActive: false }])
        : newReload.promise,
    )
  const user = userEvent.setup()
  const view = renderScreen()
  currentCabinet.retry = vi.fn(() => {
    currentCabinet.targetTenant = {
      ...currentCabinet.targetTenant,
      id: 'tenant-2',
      slug: 'other-garage',
    }
    currentCabinet.snapshot = {
      ...currentCabinet.snapshot,
      tenantId: 'tenant-2',
      generation: 2,
    }
    tenantRequestScope.rotate()
    view.rerender(teamScreen())
    return accessRetry.promise
  })

  await user.click(
    await screen.findByRole('button', { name: 'Вимкнути Олена' }),
  )
  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))
  await waitFor(() => expect(currentCabinet.retry).toHaveBeenCalledOnce())
  expect(screen.queryByText('+380501112233')).toBeNull()

  accessRetry.resolve(undefined)
  await waitFor(() =>
    expect(
      vi
        .mocked(teamApi.listMembers)
        .mock.calls.some(
          ([options]) => options?.signal === tenantRequestScope.signal,
        ),
    ).toBe(true),
  )
  newReload.resolve([newMember])

  expect(await screen.findByText('Іван')).toBeInTheDocument()
  expect(screen.queryByText('Олена')).toBeNull()
})
