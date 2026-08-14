import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { invitationsApi, type InvitationInfo } from '@/api/invitations'
import { tenantPreference } from '@/api/tenant-preference'
import { useAuth, type AuthContextValue } from '@/auth/AuthContext'
import { InviteScreen } from './invite'

vi.mock('@/api/invitations', () => ({
  invitationsApi: { info: vi.fn(), accept: vi.fn() },
}))
vi.mock('@/auth/AuthContext', () => ({ useAuth: vi.fn() }))

/* eslint-disable @typescript-eslint/unbound-method */
const info = vi.mocked(invitationsApi.info)
const accept = vi.mocked(invitationsApi.accept)
/* eslint-enable @typescript-eslint/unbound-method */

const validInfo: InvitationInfo = {
  tenantName: 'Розбірка Соболя',
  roleName: 'Менеджер',
  createdByName: 'Олена',
  expiresAt: '2026-09-01T00:00:00Z',
  isValid: true,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function LocationProbe() {
  const location = useLocation()
  return (
    <span data-testid="location">{location.pathname + location.search}</span>
  )
}

function renderInvite(code = 'ABCD1234') {
  return render(
    <MemoryRouter initialEntries={[`/invite/${encodeURIComponent(code)}`]}>
      <Routes>
        <Route path="/invite/:code" element={<InviteScreen />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

const authValue = (
  status: AuthContextValue['status'],
  displayName = 'Власник',
): AuthContextValue => ({
  status,
  user:
    status === 'authenticated'
      ? {
          id: 'user-1',
          phone: '+380501112233',
          displayName,
          role: 'owner',
          isActive: true,
          lastLoginAt: null,
        }
      : null,
  tenant: null,
  tenants: [],
  hydrate: vi.fn().mockResolvedValue(undefined),
  switchTenant: vi.fn(),
  signOut: vi.fn(),
})

let auth: AuthContextValue

beforeEach(() => {
  tenantPreference.clear()
  auth = authValue('guest')
  vi.mocked(useAuth).mockReturnValue(auth)
  info.mockResolvedValue(validInfo)
  accept.mockResolvedValue({
    tenantId: 'tenant-2',
    tenantName: 'Розбірка Соболя',
    role: 'manager',
    permissions: ['cars.view'],
  })
})

afterEach(() => {
  vi.resetAllMocks()
  tenantPreference.clear()
})

it('shows invitation information before authentication', async () => {
  renderInvite()

  expect(await screen.findByText('Розбірка Соболя')).toBeInTheDocument()
  expect(screen.getByText('Менеджер')).toBeInTheDocument()
  expect(screen.getByText(/Олена/)).toBeInTheDocument()
})

it('links a guest to the encoded invitation login intent', async () => {
  renderInvite('AB/CD')

  expect(
    await screen.findByRole('link', { name: 'Прийняти запрошення' }),
  ).toHaveAttribute('href', '/login?invite=AB%2FCD')
})

it('accepts for a named user, selects the tenant, hydrates, then replaces navigation', async () => {
  auth = authValue('authenticated')
  const hydration = deferred<void>()
  vi.mocked(auth.hydrate).mockReturnValue(hydration.promise)
  vi.mocked(useAuth).mockReturnValue(auth)
  const user = userEvent.setup()
  renderInvite()

  await user.click(
    await screen.findByRole('button', { name: 'Прийняти запрошення' }),
  )

  expect(tenantPreference.get()).toBe('tenant-2')
  expect(screen.queryByTestId('location')).not.toBeInTheDocument()

  await act(async () => {
    hydration.resolve()
    await hydration.promise
  })

  expect(await screen.findByTestId('location')).toHaveTextContent('/account')
})

it('routes an authenticated unnamed user through the invitation login name step', async () => {
  auth = authValue('authenticated', ' ')
  vi.mocked(useAuth).mockReturnValue(auth)
  const user = userEvent.setup()
  renderInvite('AB/CD')

  await user.click(
    await screen.findByRole('button', { name: 'Прийняти запрошення' }),
  )

  expect(screen.getByTestId('location')).toHaveTextContent(
    '/login?invite=AB%2FCD',
  )
})

it.each([
  ['expired', 'INVITE_EXPIRED', 'Посилання прострочене'],
  ['used', 'INVITE_USED', 'Запрошення вже використано'],
  ['revoked', 'INVITE_REVOKED', 'Запрошення скасовано'],
  ['not-found', 'INVITE_NOT_FOUND', 'Недійсне посилання'],
])('renders %s invitation state', async (_state, code, title) => {
  info.mockRejectedValue({
    kind: code === 'INVITE_NOT_FOUND' ? 'not-found' : 'conflict',
    code,
    message: 'backend wording',
  })

  renderInvite()

  expect(
    await screen.findByRole('heading', { name: title }),
  ).toBeInTheDocument()
  expect(screen.queryByText('backend wording')).not.toBeInTheDocument()
})

it('prevents overlapping accepts', async () => {
  auth = authValue('authenticated')
  vi.mocked(useAuth).mockReturnValue(auth)
  const pending = deferred<Awaited<ReturnType<typeof invitationsApi.accept>>>()
  accept.mockReturnValue(pending.promise)
  const user = userEvent.setup()
  renderInvite()
  const button = await screen.findByRole('button', {
    name: 'Прийняти запрошення',
  })

  await user.click(button)
  await user.click(button)

  expect(accept).toHaveBeenCalledTimes(1)
  expect(button).toBeDisabled()

  pending.resolve({
    tenantId: 'tenant-2',
    tenantName: 'Розбірка Соболя',
    role: 'manager',
    permissions: [],
  })
  await waitFor(() => expect(auth.hydrate).toHaveBeenCalledOnce())
})
