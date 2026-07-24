import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { expect, it, vi } from 'vitest'
import { useAuth } from './AuthContext'
import { RedirectIfAuth } from './guards'

vi.mock('./AuthContext', () => ({ useAuth: vi.fn() }))

function LocationProbe() {
  const location = useLocation()
  return <span>{location.pathname + location.search}</span>
}

it('preserves a valid plan when redirecting an authenticated user', () => {
  vi.mocked(useAuth).mockReturnValue({
    status: 'authenticated',
    user: null,
    tenant: null,
    tenants: [],
    hydrate: vi.fn(),
    switchTenant: vi.fn(),
    signOut: vi.fn(),
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
        <Route path="/account" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(
    screen.getByText('/account?section=plans&plan=pro_monthly'),
  ).toBeInTheDocument()
})
