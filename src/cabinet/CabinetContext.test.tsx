import { useEffect } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { authApi } from '@/api/auth'
import { billingApi } from '@/api/billing'
import { credentials } from '@/api/credentials'
import { sessionApi } from '@/api/session'
import { tenantPreference } from '@/api/tenant-preference'
import { tenantsApi } from '@/api/tenants'
import type { Tenant, User } from '@/api/types'
import { AuthProvider, useAuth } from '@/auth/AuthContext'
import { accessApi } from './access-api'
import type { MePermissionsDto } from './access-types'
import {
  CabinetProvider,
  useCabinet,
  type CabinetContextValue,
} from './CabinetContext'

/* eslint-disable @typescript-eslint/unbound-method -- Vitest spies on API singleton methods at their module boundaries. */

const user: User = {
  id: 'user-1',
  phone: '+380501112233',
  displayName: 'Власник',
  role: 'owner',
  isActive: true,
  lastLoginAt: '2026-08-13T10:00:00Z',
}

const tenant = (id: string, isActive = true): Tenant => ({
  id,
  name: `Розбірка ${id.toUpperCase()}`,
  slug: id,
  plan: 'active',
  planTier: 'pro',
  city: 'Київ',
  logoUrl: null,
  isActive,
  createdAt: '2026-08-01T10:00:00Z',
  roleName: 'owner',
})

const tenantA = tenant('a')
const tenantB = tenant('b')
const tenantC = tenant('c')
const inactiveTenant = tenant('inactive', false)
const tenants = [tenantA, tenantB, tenantC, inactiveTenant]

const access = (id: string): MePermissionsDto => ({
  role: id,
  permissions: ['cars.view'],
  features: [],
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

let cabinet: CabinetContextValue | null = null

function CabinetProbe() {
  const auth = useAuth()
  const value = useCabinet()

  useEffect(() => {
    cabinet = value
  }, [value])

  return (
    <div>
      <span>{`tenant:${auth.tenant?.id ?? 'none'} access:${value.snapshot?.tenantId ?? 'none'}`}</span>
      {auth.tenants.map((candidate) => (
        <button
          key={candidate.id}
          type="button"
          onClick={() => void value.switchTenant(candidate.id)}
        >
          {candidate.name}
        </button>
      ))}
    </div>
  )
}

function RouteChangeButton({ slug }: { slug: string }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => void navigate(`/app/${slug}/dashboard`)}
    >
      route {slug}
    </button>
  )
}

function SignOutButton() {
  const auth = useAuth()
  return (
    <button type="button" onClick={() => void auth.signOut({ silent: true })}>
      sign out cabinet
    </button>
  )
}

function CabinetRoute() {
  return (
    <>
      <RouteChangeButton slug="c" />
      <SignOutButton />
      <CabinetProvider>
        <CabinetProbe />
      </CabinetProvider>
    </>
  )
}

function renderCabinet(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/app/:tenantSlug/*" element={<CabinetRoute />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  cabinet = null
  credentials.setAccess('current-access')
  tenantPreference.set(tenantA.id)
  vi.spyOn(authApi, 'me').mockResolvedValue(user)
  vi.spyOn(authApi, 'logout').mockResolvedValue(undefined)
  vi.spyOn(tenantsApi, 'list').mockResolvedValue(tenants)
  vi.spyOn(sessionApi, 'invalidate').mockResolvedValue(undefined)
  vi.spyOn(sessionApi, 'refresh').mockResolvedValue({
    accessToken: 'refreshed-access',
    expiresIn: 900,
  })
  vi.spyOn(accessApi, 'get').mockImplementation(() =>
    Promise.resolve(access(tenantPreference.get() ?? 'none')),
  )
  vi.spyOn(billingApi, 'getSubscription')
})

afterEach(() => {
  vi.restoreAllMocks()
  credentials.clear()
  tenantPreference.clear()
})

it('renders no A children after switching begins and commits B atomically', async () => {
  const accessB = deferred<MePermissionsDto>()
  vi.mocked(accessApi.get).mockImplementation(() => {
    const target = tenantPreference.get()
    return target === tenantB.id
      ? accessB.promise
      : Promise.resolve(access(target ?? 'none'))
  })
  const userEventApi = userEvent.setup()

  renderCabinet('/app/a/dashboard')
  expect(await screen.findByText('tenant:a access:a')).toBeVisible()

  await userEventApi.click(screen.getByRole('button', { name: 'Розбірка B' }))

  expect(screen.queryByText('tenant:a access:a')).not.toBeInTheDocument()
  expect(screen.getByText('Перемикаємо розбірку…')).toBeVisible()

  await act(async () => {
    accessB.resolve(access('b'))
    await accessB.promise
  })

  expect(await screen.findByText('tenant:b access:b')).toBeVisible()
})

it('shows an honest retry state for an access network failure', async () => {
  vi.mocked(accessApi.get)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(access('b'))
  const userEventApi = userEvent.setup()

  renderCabinet('/app/b/dashboard')

  await userEventApi.click(
    await screen.findByRole('button', { name: 'Спробувати ще раз' }),
  )

  expect(await screen.findByText('tenant:b access:b')).toBeVisible()
})

it('does not fall back to another tenant for an unknown URL slug', async () => {
  renderCabinet('/app/missing/dashboard')

  expect(await screen.findByText('Розбірку не знайдено')).toBeVisible()
  expect(accessApi.get).not.toHaveBeenCalled()
  expect(tenantPreference.get()).toBe(tenantA.id)
})

it('does not load tenant access for an inactive tenant', async () => {
  renderCabinet('/app/inactive/dashboard')

  expect(await screen.findByText('Розбірка неактивна')).toBeVisible()
  expect(accessApi.get).not.toHaveBeenCalled()
  expect(tenantPreference.get()).toBe(tenantA.id)
})

it('commits only the last target during rapid switches', async () => {
  const accessB = deferred<MePermissionsDto>()
  const accessC = deferred<MePermissionsDto>()
  vi.mocked(accessApi.get).mockImplementation(() => {
    const target = tenantPreference.get()
    if (target === tenantB.id) return accessB.promise
    if (target === tenantC.id) return accessC.promise
    return Promise.resolve(access(target ?? 'none'))
  })

  renderCabinet('/app/a/dashboard')
  expect(await screen.findByText('tenant:a access:a')).toBeVisible()
  const readyCabinet = cabinet
  if (!readyCabinet) throw new Error('Cabinet context was not exposed')

  let switchB!: Promise<void>
  let switchC!: Promise<void>
  act(() => {
    switchB = readyCabinet.switchTenant(tenantB.id)
    switchC = readyCabinet.switchTenant(tenantC.id)
  })

  accessC.resolve(access('c'))
  await act(async () => switchC)
  expect(await screen.findByText('tenant:c access:c')).toBeVisible()

  accessB.resolve(access('b'))
  await act(async () => switchB)
  expect(screen.queryByText('tenant:b access:b')).not.toBeInTheDocument()
  expect(screen.getByText('tenant:c access:c')).toBeVisible()
})

it('supersedes an in-flight URL tenant when the route changes', async () => {
  const accessA = deferred<MePermissionsDto>()
  vi.mocked(accessApi.get).mockImplementation(() => {
    const target = tenantPreference.get()
    return target === tenantA.id
      ? accessA.promise
      : Promise.resolve(access(target ?? 'none'))
  })
  const userEventApi = userEvent.setup()

  renderCabinet('/app/a/dashboard')
  expect(await screen.findByText('Завантажуємо розбірку…')).toBeVisible()

  await userEventApi.click(screen.getByRole('button', { name: 'route c' }))

  expect(await screen.findByText('tenant:c access:c')).toBeVisible()
  accessA.resolve(access('a'))
  await act(async () => accessA.promise)
  expect(screen.queryByText('tenant:a access:a')).not.toBeInTheDocument()
})

it('invalidates in-flight tenant work on unmount', async () => {
  const accessB = deferred<MePermissionsDto>()
  let accessSignal: AbortSignal | undefined
  vi.mocked(accessApi.get).mockImplementation(({ signal } = {}) => {
    accessSignal = signal
    return accessB.promise
  })

  const rendered = renderCabinet('/app/b/dashboard')
  await waitFor(() => expect(accessSignal).toBeDefined())

  rendered.unmount()

  expect(accessSignal?.aborted).toBe(true)
  accessB.resolve(access('b'))
  await act(async () => accessB.promise)
})

it('invalidates in-flight tenant work on sign-out', async () => {
  const accessB = deferred<MePermissionsDto>()
  let accessSignal: AbortSignal | undefined
  vi.mocked(accessApi.get).mockImplementation(({ signal } = {}) => {
    accessSignal = signal
    return accessB.promise
  })
  const userEventApi = userEvent.setup()

  renderCabinet('/app/b/dashboard')
  await waitFor(() => expect(accessSignal).toBeDefined())

  await userEventApi.click(
    screen.getByRole('button', { name: 'sign out cabinet' }),
  )

  expect(accessSignal?.aborted).toBe(true)
  accessB.resolve(access('b'))
  await act(async () => accessB.promise)
})
