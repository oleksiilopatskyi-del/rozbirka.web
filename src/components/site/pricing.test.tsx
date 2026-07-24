import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/auth/AuthContext'
import { Pricing } from './pricing'

vi.mock('@/auth/AuthContext', () => ({ useAuth: vi.fn() }))

const mockedUseAuth = vi.mocked(useAuth)

describe('Pricing destinations', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      status: 'guest',
      user: null,
      tenant: null,
      tenants: [],
      hydrate: vi.fn(),
      switchTenant: vi.fn(),
      signOut: vi.fn(),
    })
  })

  it('sends guests through login with the selected plan', () => {
    render(
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('link', { name: /почати 7 днів/i }),
    ).toHaveAttribute('href', '/login?plan=pro_monthly')
  })

  it('sends authenticated users directly to the selected account plan', () => {
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
      user: null,
      tenant: null,
      tenants: [],
      hydrate: vi.fn(),
      switchTenant: vi.fn(),
      signOut: vi.fn(),
    })
    render(
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('link', { name: /почати 7 днів/i }),
    ).toHaveAttribute('href', '/account?section=plans&plan=pro_monthly')
  })

  it('renders every guest plan destination with a 44px minimum touch target', () => {
    render(
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>,
    )

    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/login?plan=lite_monthly',
      '/login?plan=pro_monthly',
      '/login?plan=enterprise_monthly',
    ])
    expect(links).toHaveLength(3)
    links.forEach((link) => expect(link).toHaveClass('min-h-11'))
  })
})
