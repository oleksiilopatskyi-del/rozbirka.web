import { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Tenant } from '@/api/types'
import { useAuth, type AuthContextValue } from '@/auth/AuthContext'
import type { TenantAccessSnapshot } from '../access-types'
import { useCabinet, type CabinetContextValue } from '../CabinetContext'
import { ProfileScreen } from './profile-screen'

vi.mock('@/auth/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('../CabinetContext', () => ({ useCabinet: vi.fn() }))

const tenant: Tenant = {
  id: 'tenant-1',
  name: 'QA Switch Test',
  slug: 'qa-switch-test',
  plan: 'active',
  planTier: 'pro',
  city: 'Львів',
  logoUrl: null,
  isActive: true,
  createdAt: '2026-08-01T10:00:00Z',
  roleName: 'manager',
}

const snapshot: TenantAccessSnapshot = {
  userId: 'user-1',
  tenantId: tenant.id,
  generation: 1,
  role: 'Manager',
  permissions: new Set(),
  features: new Set(),
  entitlement: null,
  subscription: null,
}

const updateName = vi.fn<(name: string) => Promise<void>>()

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  updateName.mockReset()
  updateName.mockResolvedValue(undefined)
  vi.mocked(useAuth).mockReturnValue({
    status: 'authenticated',
    user: {
      id: 'user-1',
      phone: '+380733182301',
      displayName: 'Олена',
      role: 'manager',
      isActive: true,
      lastLoginAt: null,
    },
    tenant,
    tenants: [tenant],
    hydrate: vi.fn(),
    commitTenant: vi.fn(),
    updateName,
    signOut: vi.fn(),
  } satisfies AuthContextValue)
  vi.mocked(useCabinet).mockReturnValue({
    status: 'ready',
    targetTenant: tenant,
    snapshot,
    error: null,
    retry: vi.fn(),
    switchTenant: vi.fn(),
  } satisfies CabinetContextValue)
})

it('renders the approved authenticated profile fields', () => {
  render(<ProfileScreen />)

  expect(screen.getByRole('heading', { name: 'Профіль' })).toBeVisible()
  expect(screen.getByLabelText('Ім’я')).toHaveValue('Олена')
  expect(screen.getByText('+380733182301')).toBeVisible()
  expect(screen.getByText('Менеджер')).toBeVisible()
  expect(screen.getByText('QA Switch Test')).toBeVisible()
})

it('disables saving an unchanged or invalid display name', async () => {
  const user = userEvent.setup()
  render(<ProfileScreen />)

  const input = screen.getByLabelText('Ім’я')
  const save = screen.getByRole('button', { name: 'Зберегти' })
  expect(save).toBeDisabled()

  await user.clear(input)
  await user.type(input, ' А ')
  expect(save).toBeDisabled()
  expect(updateName).not.toHaveBeenCalled()
})

it('trims and saves the name once while the request is pending', async () => {
  const pending = deferred<void>()
  updateName.mockReturnValue(pending.promise)
  const user = userEvent.setup()
  render(<ProfileScreen />)

  const input = screen.getByLabelText('Ім’я')
  await user.clear(input)
  await user.type(input, '  Нова назва  ')
  const save = screen.getByRole('button', { name: 'Зберегти' })
  await user.click(save)

  expect(updateName).toHaveBeenCalledOnce()
  expect(updateName).toHaveBeenCalledWith('Нова назва')
  expect(save).toBeDisabled()
  expect(save).toHaveTextContent('Зберігаємо…')
  await user.click(save)
  expect(updateName).toHaveBeenCalledOnce()

  await act(() => {
    pending.resolve()
    return pending.promise
  })
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Ім’я успішно оновлено.',
  )
})

it('keeps the typed value and shows a retryable error when saving fails', async () => {
  updateName.mockRejectedValue(new Error('identity offline'))
  const user = userEvent.setup()
  render(<ProfileScreen />)

  const input = screen.getByLabelText('Ім’я')
  await user.clear(input)
  await user.type(input, 'Нове ім’я')
  await user.click(screen.getByRole('button', { name: 'Зберегти' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Не вдалося зберегти ім’я. Спробуйте ще раз.',
  )
  expect(input).toHaveValue('Нове ім’я')
  expect(screen.getByRole('button', { name: 'Зберегти' })).toBeEnabled()
})

it('does not publish local completion state after unmount', async () => {
  const pending = deferred<void>()
  updateName.mockReturnValue(pending.promise)
  const user = userEvent.setup()
  const view = render(<ProfileScreen />)

  const input = screen.getByLabelText('Ім’я')
  await user.clear(input)
  await user.type(input, 'Інше ім’я')
  await user.click(screen.getByRole('button', { name: 'Зберегти' }))
  view.unmount()

  await act(() => {
    pending.resolve()
    return pending.promise
  })
  expect(updateName).toHaveBeenCalledOnce()
})

it('publishes save completion after the StrictMode effect replay', async () => {
  const pending = deferred<void>()
  updateName.mockReturnValue(pending.promise)
  const user = userEvent.setup()
  render(
    <StrictMode>
      <ProfileScreen />
    </StrictMode>,
  )

  const input = screen.getByLabelText('Ім’я')
  await user.clear(input)
  await user.type(input, 'Ім’я в StrictMode')
  await user.click(screen.getByRole('button', { name: 'Зберегти' }))
  await act(() => {
    pending.resolve()
    return pending.promise
  })

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Ім’я успішно оновлено.',
  )
})
