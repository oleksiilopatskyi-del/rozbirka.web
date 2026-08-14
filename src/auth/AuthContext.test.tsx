import { StrictMode, useEffect } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { authApi } from '@/api/auth'
import { credentials } from '@/api/credentials'
import { sessionApi } from '@/api/session'
import { tenantPreference } from '@/api/tenant-preference'
import { tenantsApi } from '@/api/tenants'
import type { Tenant, User } from '@/api/types'
import { AuthProvider, useAuth } from './AuthContext'

/* eslint-disable @typescript-eslint/unbound-method -- Vitest spies on API singleton methods at their module boundaries. */

const user: User = {
  id: 'user-1',
  phone: '+380501112233',
  displayName: 'Власник',
  role: 'owner',
  isActive: true,
  lastLoginAt: '2026-08-13T10:00:00Z',
}

const firstTenant: Tenant = {
  id: 'tenant-1',
  name: 'Перша розбірка',
  slug: 'first',
  plan: 'active',
  planTier: 'pro',
  city: 'Київ',
  logoUrl: null,
  isActive: true,
  createdAt: '2026-08-01T10:00:00Z',
  roleName: 'owner',
}

const secondTenant: Tenant = {
  ...firstTenant,
  id: 'tenant-2',
  name: 'Друга розбірка',
  slug: 'second',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function AuthProbe({ onStatus }: { onStatus?: (status: string) => void }) {
  const auth = useAuth()

  useEffect(() => {
    onStatus?.(auth.status)
  }, [auth.status, onStatus])

  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="user">{auth.user?.displayName ?? 'none'}</span>
      <span data-testid="tenant">{auth.tenant?.id ?? 'none'}</span>
      <span data-testid="tenants">{auth.tenants.length}</span>
      <button type="button" onClick={() => void auth.hydrate()}>
        hydrate
      </button>
      <button type="button" onClick={() => void auth.signOut()}>
        sign out
      </button>
    </div>
  )
}

async function expectStatus(status: string) {
  await waitFor(() => {
    expect(screen.getByTestId('status')).toHaveTextContent(status)
  })
}

beforeEach(() => {
  credentials.clear()
  tenantPreference.clear()
  vi.spyOn(authApi, 'me').mockResolvedValue(user)
  vi.spyOn(authApi, 'logout').mockResolvedValue(undefined)
  vi.spyOn(tenantsApi, 'list').mockResolvedValue([firstTenant, secondTenant])
  vi.spyOn(sessionApi, 'refresh').mockImplementation(() => {
    credentials.setAccess('refreshed-access')
    return Promise.resolve({ accessToken: 'refreshed-access', expiresIn: 900 })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  credentials.clear()
  tenantPreference.clear()
})

it('restores a reload session through the HttpOnly-cookie refresh facade', async () => {
  render(
    <StrictMode>
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    </StrictMode>,
  )

  await expectStatus('authenticated')
  expect(screen.getByTestId('user')).toHaveTextContent('Власник')
  expect(sessionApi.refresh).toHaveBeenCalledOnce()
})

it('shows guest when refresh reports an absent or expired session', async () => {
  vi.mocked(sessionApi.refresh).mockRejectedValue({
    kind: 'session-expired',
    message: 'Сеанс завершився.',
  })

  render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  )

  await expectStatus('guest')
  expect(authApi.me).not.toHaveBeenCalled()
  expect(tenantsApi.list).not.toHaveBeenCalled()
})

it('loads me and tenants only after refresh succeeds', async () => {
  const refresh = deferred<{ accessToken: string; expiresIn: number }>()
  vi.mocked(sessionApi.refresh).mockImplementation(async () => {
    const response = await refresh.promise
    credentials.setAccess(response.accessToken)
    return response
  })

  render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  )

  expect(screen.getByTestId('status')).toHaveTextContent('loading')
  expect(authApi.me).not.toHaveBeenCalled()
  expect(tenantsApi.list).not.toHaveBeenCalled()

  refresh.resolve({ accessToken: 'refreshed-access', expiresIn: 900 })

  await expectStatus('authenticated')
  expect(authApi.me).toHaveBeenCalledOnce()
  expect(tenantsApi.list).toHaveBeenCalledOnce()
})

it('chooses the stored tenant when membership still exists', async () => {
  tenantPreference.set(secondTenant.id)

  render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  )

  await waitFor(() => {
    expect(screen.getByTestId('tenant')).toHaveTextContent(secondTenant.id)
  })
  expect(tenantPreference.get()).toBe(secondTenant.id)
})

it('clears invalid tenant preference when the user has no matching tenant', async () => {
  tenantPreference.set('former-tenant')
  vi.mocked(tenantsApi.list).mockImplementation(() => {
    expect(tenantPreference.get()).toBeNull()
    return Promise.resolve([firstTenant, secondTenant])
  })

  render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  )

  await waitFor(() => {
    expect(screen.getByTestId('tenant')).toHaveTextContent(firstTenant.id)
  })
  expect(tenantPreference.get()).toBe(firstTenant.id)
})

it('resets React auth state once when a mid-session refresh fails', async () => {
  credentials.setAccess('current-access')
  const statuses: string[] = []

  render(
    <AuthProvider>
      <AuthProbe onStatus={(status) => statuses.push(status)} />
    </AuthProvider>,
  )

  await expectStatus('authenticated')

  act(() => {
    credentials.clear()
    credentials.clear()
  })

  await waitFor(() => {
    expect(screen.getByTestId('status')).toHaveTextContent('guest')
  })
  expect(screen.getByTestId('user')).toHaveTextContent('none')
  expect(statuses.filter((status) => status === 'guest')).toHaveLength(1)
})

it('signs out locally even when Worker logout fails', async () => {
  credentials.setAccess('current-access')
  vi.mocked(authApi.logout).mockRejectedValue(new Error('worker offline'))
  const userEventApi = userEvent.setup()

  render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  )

  await expectStatus('authenticated')
  await userEventApi.click(screen.getByRole('button', { name: 'sign out' }))

  expect(screen.getByTestId('status')).toHaveTextContent('guest')
  expect(screen.getByTestId('user')).toHaveTextContent('none')
  expect(credentials.getAccess()).toBeNull()
})
