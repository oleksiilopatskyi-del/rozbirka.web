import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { billingApi } from '@/api/billing'
import { useAuth } from '@/auth/AuthContext'
import { Pricing } from './pricing'

vi.mock('@/auth/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/api/billing', () => ({
  billingApi: { getPlans: vi.fn() },
}))

const mockedUseAuth = vi.mocked(useAuth)
// eslint-disable-next-line @typescript-eslint/unbound-method
const getPlans = vi.mocked(billingApi.getPlans)
const fullFeatures = [
  'intake_management',
  'reports.advanced',
  'team_collaboration',
  'multi_cash_registers',
  'qr_codes',
]
const apiPlans = [
  {
    code: 'lite_monthly',
    name: 'Lite',
    amount: 19,
    currency: 'USD',
    interval: '1m',
    trialDays: 14,
    limits: {
      cars: 3,
      intakes: 0,
      parts: 100,
      users: 1,
      cashRegisters: 1,
      photosPerPart: null,
    },
    features: [],
  },
  {
    code: 'pro_monthly',
    name: 'Pro',
    amount: 59,
    currency: 'USD',
    interval: '1m',
    trialDays: 14,
    limits: {
      cars: 20,
      intakes: 25,
      parts: 2000,
      users: 5,
      cashRegisters: 2,
      photosPerPart: null,
    },
    features: fullFeatures,
  },
  {
    code: 'enterprise_monthly',
    name: 'Enterprise',
    amount: 299,
    currency: 'USD',
    interval: '1m',
    trialDays: 14,
    limits: {
      cars: null,
      intakes: null,
      parts: null,
      users: null,
      cashRegisters: null,
      photosPerPart: null,
    },
    features: fullFeatures,
  },
]

describe('Pricing destinations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPlans.mockResolvedValue(apiPlans)
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

  it('renders the validated API catalog with canonical trial copy', async () => {
    render(
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>,
    )
    expect(
      await screen.findByRole('link', {
        name: 'Почати 14 днів безкоштовно',
      }),
    ).toHaveAttribute('href', '/login?plan=pro_monthly')
    expect(screen.getByText('20 авто, 2 000 запчастин')).toBeInTheDocument()
    expect(screen.queryByText(/API і мульти-локація/i)).toBeNull()
  })

  it('sends authenticated users directly to the selected account plan', async () => {
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
      await screen.findByRole('link', {
        name: 'Почати 14 днів безкоштовно',
      }),
    ).toHaveAttribute('href', '/account?section=plans&plan=pro_monthly')
  })

  it('renders every guest plan destination with a 44px minimum touch target', async () => {
    render(
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>,
    )

    const links = await screen.findAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/login?plan=lite_monthly',
      '/login?plan=pro_monthly',
      '/login?plan=enterprise_monthly',
    ])
    expect(links).toHaveLength(3)
    links.forEach((link) => expect(link).toHaveClass('min-h-11'))
  })

  it('renders the complete fallback when the public API fails', async () => {
    getPlans.mockRejectedValue(new Error('offline'))
    render(
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>,
    )
    expect(await screen.findByText('3 авто')).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })
})
