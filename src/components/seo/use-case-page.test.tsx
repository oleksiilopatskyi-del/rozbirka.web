import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/auth/AuthContext'
import { PartsInventoryScreen } from '@/screens/parts-inventory'
import { PartsSalesScreen } from '@/screens/parts-sales'

vi.mock('@/auth/AuthContext', () => ({ useAuth: vi.fn() }))

describe('use-case pages', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      status: 'guest',
      user: null,
      tenant: null,
      tenants: [],
      hydrate: vi.fn(),
      switchTenant: vi.fn(),
      signOut: vi.fn(),
    })
  })

  it('renders the inventory use case with unique content and destinations', () => {
    render(
      <MemoryRouter>
        <PartsInventoryScreen />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Облік автозапчастин для авторозбірки без таблиць і хаосу',
      }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(
      screen.getByRole('link', { name: 'Облік продажів' }),
    ).toHaveAttribute('href', '/oblik-prodazhiv-avtozapchastyn')
    expect(
      screen.getByRole('link', { name: 'Спробувати rozbirka' }),
    ).toHaveAttribute('href', '/login')
    expect(screen.getAllByText(/QR-стікер/).length).toBeGreaterThan(0)
  })

  it('renders the sales use case with distinct copy and its related destination', () => {
    render(
      <MemoryRouter>
        <PartsSalesScreen />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Облік продажів автозапчастин: від замовлення до оплати',
      }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(
      screen.getByRole('link', { name: 'Облік автозапчастин' }),
    ).toHaveAttribute('href', '/oblik-avtozapchastyn')
    expect(screen.getAllByText(/кілька платежів/).length).toBeGreaterThan(0)
  })
})
