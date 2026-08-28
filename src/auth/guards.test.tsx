import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { expect, it, vi } from 'vitest'
import { useAuth } from './AuthContext'
import { RedirectIfAuth, RequireAuth } from './guards'

vi.mock('./AuthContext', () => ({ useAuth: vi.fn() }))

function LocationProbe() {
  const location = useLocation()
  return (
    <span>
      {location.pathname + location.search}|
      {JSON.stringify(location.state ?? null)}
    </span>
  )
}

const authValue = (status: 'loading' | 'authenticated' | 'guest') => ({
  status,
  user: null,
  tenant: null,
  tenants: [],
  hydrate: vi.fn(),
  commitTenant: vi.fn(),
  updateName: vi.fn(),
  signOut: vi.fn(),
})

it('preserves a valid plan when redirecting an authenticated user', () => {
  vi.mocked(useAuth).mockReturnValue({
    ...authValue('authenticated'),
    tenant: {
      id: 'tenant-1',
      name: 'Koval Auto',
      slug: 'koval',
      plan: 'active',
      planTier: 'pro',
      city: null,
      logoUrl: null,
      isActive: true,
      createdAt: '2026-08-01T00:00:00Z',
      roleName: 'owner',
    },
  })

  render(
    <MemoryRouter initialEntries={['/login?plan=pro_monthly']}>
      <Routes>
        <Route
          path="/login"
          element={
            <RedirectIfAuth>
              <span>login</span>
            </RedirectIfAuth>
          }
        />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(
    screen.getByText('/app/koval/settings/billing/plans?plan=pro_monthly|null'),
  ).toBeInTheDocument()
})

it('rejects an unsafe authenticated fallback destination', () => {
  vi.mocked(useAuth).mockReturnValue(authValue('authenticated'))

  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route
          path="/login"
          element={
            <RedirectIfAuth to="https://evil.example/steal-session">
              <span>login</span>
            </RedirectIfAuth>
          }
        />
        <Route path="/account" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(screen.getByText('/account|null')).toBeInTheDocument()
})

it('preserves the protected-route fallback after login hydration', () => {
  vi.mocked(useAuth).mockReturnValue(authValue('authenticated'))

  render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/login',
          state: { from: '/account?section=team' },
        },
      ]}
    >
      <Routes>
        <Route
          path="/login"
          element={
            <RedirectIfAuth>
              <span>login</span>
            </RedirectIfAuth>
          }
        />
        <Route path="/account" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(screen.getByText('/account?section=team|null')).toBeInTheDocument()
})

it('records the full protected path for a guest login return', () => {
  vi.mocked(useAuth).mockReturnValue(authValue('guest'))

  render(
    <MemoryRouter initialEntries={['/account?section=team']}>
      <Routes>
        <Route
          path="/account"
          element={
            <RequireAuth>
              <span>account</span>
            </RequireAuth>
          }
        />
        <Route path="/login" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(
    screen.getByText('/login|{"from":"/account?section=team"}'),
  ).toBeInTheDocument()
})

it('allows an authenticated user without a display name to finish the login name step', () => {
  vi.mocked(useAuth).mockReturnValue({
    ...authValue('authenticated'),
    user: {
      id: 'user-1',
      phone: '+380501112233',
      displayName: ' ',
      role: 'owner',
      isActive: true,
      lastLoginAt: null,
    },
  })

  render(
    <MemoryRouter initialEntries={['/login?invite=ABCD1234']}>
      <Routes>
        <Route
          path="/login"
          element={
            <RedirectIfAuth>
              <span>name step</span>
            </RedirectIfAuth>
          }
        />
      </Routes>
    </MemoryRouter>,
  )

  expect(screen.getByText('name step')).toBeInTheDocument()
})
