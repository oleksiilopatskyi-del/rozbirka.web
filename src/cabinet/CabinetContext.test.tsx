import { useEffect } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router'
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
import { tenantRequestScope } from './tenant-request-scope'
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

const access = (
  id: string,
  permissions: string[] = ['cars.view'],
): MePermissionsDto => ({
  role: id,
  permissions,
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
      <span>{`snapshot-user:${value.snapshot?.userId ?? 'none'}`}</span>
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

function LocationProbe() {
  const location = useLocation()
  return (
    <span>{`route:${location.pathname}${location.search}${location.hash}`}</span>
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

function ReauthenticateButton() {
  const auth = useAuth()
  return (
    <button type="button" onClick={() => void auth.hydrate('reauth-access')}>
      reauthenticate cabinet
    </button>
  )
}

function CabinetRoute() {
  return (
    <>
      <RouteChangeButton slug="c" />
      <RouteChangeButton slug="missing" />
      <RouteChangeButton slug="inactive" />
      <SignOutButton />
      <ReauthenticateButton />
      <LocationProbe />
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
          <Route path="/app/:tenant/*" element={<CabinetRoute />} />
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

it('preserves a registered suffix after the target view policy allows it', async () => {
  const userEventApi = userEvent.setup()

  renderCabinet('/app/a/settings/profile?tab=security#phone')
  expect(await screen.findByText('tenant:a access:a')).toBeVisible()

  await userEventApi.click(screen.getByRole('button', { name: 'Розбірка B' }))

  expect(await screen.findByText('tenant:b access:b')).toBeVisible()
  expect(
    screen.getByText('route:/app/b/settings/profile?tab=security#phone'),
  ).toBeVisible()
})

it('falls back to the target dashboard when the target view policy denies the suffix', async () => {
  const userEventApi = userEvent.setup()

  renderCabinet('/app/a/settings/billing/overview?tab=plans#invoice')
  expect(await screen.findByText('tenant:a access:a')).toBeVisible()

  await userEventApi.click(screen.getByRole('button', { name: 'Розбірка B' }))

  expect(await screen.findByText('tenant:b access:b')).toBeVisible()
  expect(
    screen.getByText('route:/app/b/dashboard?tab=plans#invoice'),
  ).toBeVisible()
})

it('keeps a failed selection on the current route and navigates its successful retry', async () => {
  const offline = new Error('offline')
  let bAttempts = 0
  vi.mocked(accessApi.get).mockImplementation(() => {
    const target = tenantPreference.get() ?? 'none'
    if (target === tenantB.id) {
      bAttempts += 1
      return bAttempts === 1
        ? Promise.reject(offline)
        : Promise.resolve(access(target))
    }
    return Promise.resolve(access(target))
  })
  const userEventApi = userEvent.setup()

  renderCabinet('/app/a/settings/profile?tab=security#phone')
  expect(await screen.findByText('tenant:a access:a')).toBeVisible()

  await userEventApi.click(screen.getByRole('button', { name: 'Розбірка B' }))

  expect(
    await screen.findByRole('button', { name: 'Спробувати ще раз' }),
  ).toBeVisible()
  expect(
    screen.getByText('route:/app/a/settings/profile?tab=security#phone'),
  ).toBeVisible()

  await userEventApi.click(
    screen.getByRole('button', { name: 'Спробувати ще раз' }),
  )

  expect(await screen.findByText('tenant:b access:b')).toBeVisible()
  expect(
    screen.getByText('route:/app/b/settings/profile?tab=security#phone'),
  ).toBeVisible()
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

it('keeps the current tenant untouched when an inactive tenant is selected', async () => {
  const preferenceSet = vi.spyOn(tenantPreference, 'set')

  renderCabinet('/app/a/settings/profile?tab=security#phone')
  expect(await screen.findByText('tenant:a access:a')).toBeVisible()
  const readyCabinet = cabinet
  if (!readyCabinet) throw new Error('Cabinet context was not exposed')
  const sharedSignal = tenantRequestScope.signal
  preferenceSet.mockClear()
  vi.mocked(accessApi.get).mockClear()

  await act(async () => readyCabinet.switchTenant(inactiveTenant.id))

  expect(screen.getByText('tenant:a access:a')).toBeVisible()
  expect(
    screen.getByText('route:/app/a/settings/profile?tab=security#phone'),
  ).toBeVisible()
  expect(screen.queryByText('Розбірка неактивна')).not.toBeInTheDocument()
  expect(tenantPreference.get()).toBe(tenantA.id)
  expect(preferenceSet).not.toHaveBeenCalled()
  expect(accessApi.get).not.toHaveBeenCalled()
  expect(tenantRequestScope.signal).toBe(sharedSignal)
  expect(sharedSignal.aborted).toBe(false)
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
  expect(screen.getByText('route:/app/c/dashboard')).toBeVisible()

  accessB.resolve(access('b'))
  await act(async () => switchB)
  expect(screen.queryByText('tenant:b access:b')).not.toBeInTheDocument()
  expect(screen.getByText('tenant:c access:c')).toBeVisible()
  expect(screen.getByText('route:/app/c/dashboard')).toBeVisible()
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

it('reloads access after a different user signs in to the same tenant', async () => {
  const secondUser: User = { ...user, id: 'user-2', displayName: 'Майстер' }
  const secondAccess = deferred<MePermissionsDto>()
  vi.mocked(authApi.me)
    .mockResolvedValueOnce(user)
    .mockResolvedValueOnce(secondUser)
  vi.mocked(accessApi.get)
    .mockResolvedValueOnce(access('a'))
    .mockReturnValueOnce(secondAccess.promise)
  const userEventApi = userEvent.setup()

  renderCabinet('/app/a/dashboard')
  expect(await screen.findByText('snapshot-user:user-1')).toBeVisible()

  await userEventApi.click(
    screen.getByRole('button', { name: 'sign out cabinet' }),
  )
  expect(screen.queryByText('snapshot-user:user-1')).not.toBeInTheDocument()

  await userEventApi.click(
    screen.getByRole('button', { name: 'reauthenticate cabinet' }),
  )
  await waitFor(() => expect(accessApi.get).toHaveBeenCalledTimes(2))

  expect(screen.queryByText('snapshot-user:user-1')).not.toBeInTheDocument()
  expect(screen.getByText('Завантажуємо розбірку…')).toBeVisible()

  await act(async () => {
    secondAccess.resolve(access('a'))
    await secondAccess.promise
  })
  expect(await screen.findByText('snapshot-user:user-2')).toBeVisible()
})

it('aborts the shared tenant request scope on unmount', async () => {
  const rendered = renderCabinet('/app/a/dashboard')
  expect(await screen.findByText('tenant:a access:a')).toBeVisible()
  const sharedSignal = tenantRequestScope.signal

  rendered.unmount()

  expect(sharedSignal.aborted).toBe(true)
})

it('aborts the shared tenant request scope on sign-out', async () => {
  const userEventApi = userEvent.setup()
  renderCabinet('/app/a/dashboard')
  expect(await screen.findByText('tenant:a access:a')).toBeVisible()
  const sharedSignal = tenantRequestScope.signal

  await userEventApi.click(
    screen.getByRole('button', { name: 'sign out cabinet' }),
  )

  expect(sharedSignal.aborted).toBe(true)
})

it.each([
  ['/app/missing/dashboard', 'Розбірку не знайдено'],
  ['/app/inactive/dashboard', 'Розбірка неактивна'],
])('aborts the shared tenant request scope at %s', async (path, message) => {
  const sharedSignal = tenantRequestScope.signal

  renderCabinet(path)

  expect(await screen.findByText(message)).toBeVisible()
  expect(sharedSignal.aborted).toBe(true)
})

it('rotates the shared scope between distinct invalid route boundaries', async () => {
  const userEventApi = userEvent.setup()
  renderCabinet('/app/missing/dashboard')
  expect(await screen.findByText('Розбірку не знайдено')).toBeVisible()
  const unknownScopeSignal = tenantRequestScope.signal

  await userEventApi.click(
    screen.getByRole('button', { name: 'route inactive' }),
  )

  expect(await screen.findByText('Розбірка неактивна')).toBeVisible()
  expect(unknownScopeSignal.aborted).toBe(true)
})

it('keeps an already-ready tenant mounted without starting a transition', async () => {
  const userEventApi = userEvent.setup()
  renderCabinet('/app/a/dashboard')
  expect(await screen.findByText('tenant:a access:a')).toBeVisible()
  const sharedSignal = tenantRequestScope.signal

  await userEventApi.click(screen.getByRole('button', { name: 'Розбірка A' }))

  expect(screen.getByText('tenant:a access:a')).toBeVisible()
  expect(screen.queryByText('Перемикаємо розбірку…')).not.toBeInTheDocument()
  expect(accessApi.get).toHaveBeenCalledOnce()
  expect(sharedSignal.aborted).toBe(false)
  expect(screen.getByText('route:/app/a/dashboard')).toBeVisible()
})
