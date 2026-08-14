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
  switchTenant: vi.fn(),
  signOut: vi.fn(),
})

it('preserves a valid plan when redirecting an authenticated user', () => {
  vi.mocked(useAuth).mockReturnValue(authValue('authenticated'))

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
        <Route path="/account" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(
    screen.getByText('/account?section=plans&plan=pro_monthly|null'),
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
