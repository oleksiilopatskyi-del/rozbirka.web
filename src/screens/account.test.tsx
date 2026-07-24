import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { billingApi } from '@/api/billing'
import type { SubscriptionDto } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import { AccountScreen } from './account'

vi.mock('@/api/billing', () => ({
  billingApi: {
    getSubscription: vi.fn(),
    getPayments: vi.fn(),
    getPlans: vi.fn(),
    subscribe: vi.fn(),
    cancel: vi.fn(),
    cancelPayment: vi.fn(),
  },
}))

vi.mock('@/auth/AuthContext', () => ({
  useAuth: vi.fn(),
}))

/* eslint-disable @typescript-eslint/unbound-method */
const getSubscription = vi.mocked(billingApi.getSubscription)
const getPayments = vi.mocked(billingApi.getPayments)
const getPlans = vi.mocked(billingApi.getPlans)
/* eslint-enable @typescript-eslint/unbound-method */
const mockedUseAuth = vi.mocked(useAuth)

const subscription: SubscriptionDto = {
  state: 'trial',
  planCode: 'pro_monthly',
  planName: 'Pro',
  trialEndsAt: '2026-07-31T00:00:00Z',
  trialDaysRemaining: 7,
  currentPeriodEnd: '2026-07-31T00:00:00Z',
  nextChargeAt: null,
  amount: 0,
  currency: 'USD',
  cardLast4: null,
  cardBrand: null,
  canSubscribe: true,
  canCancel: false,
  canReactivate: false,
  canActivateTrial: false,
  usage: {
    cars: { used: 0, max: 100 },
    intakes: { used: 0, max: 100 },
    parts: { used: 0, max: 1000 },
    users: { used: 1, max: 10 },
    cashRegisters: { used: 0, max: 5 },
  },
  features: [],
}

function renderAccount() {
  return render(
    <MemoryRouter>
      <AccountScreen />
    </MemoryRouter>,
  )
}

describe('AccountScreen subscription state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
      user: {
        id: 'user-1',
        phone: '+380501112233',
        displayName: 'Власник',
        role: 'owner',
        isActive: true,
        lastLoginAt: null,
      },
      tenant: {
        id: 'tenant-1',
        name: 'Test',
        slug: 'test',
        plan: 'trial',
        planTier: 'pro',
        city: null,
        logoUrl: null,
        isActive: true,
        createdAt: '2026-07-24T00:00:00Z',
        roleName: 'Owner',
      },
      tenants: [
        {
          id: 'tenant-1',
          name: 'Test',
          slug: 'test',
          plan: 'trial',
          planTier: 'pro',
          city: null,
          logoUrl: null,
          isActive: true,
          createdAt: '2026-07-24T00:00:00Z',
          roleName: 'Owner',
        },
      ],
      hydrate: vi.fn(),
      switchTenant: vi.fn(),
      signOut: vi.fn(),
    })
    getPayments.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 0,
    })
    getPlans.mockResolvedValue([])
  })

  it('renders the trial already activated by the backend', async () => {
    getSubscription.mockResolvedValue(subscription)

    renderAccount()

    expect(await screen.findByText('Pro')).toBeInTheDocument()
    expect(screen.getByText('7 днів')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /активувати/i }),
    ).not.toBeInTheDocument()
  })

  it('routes a legacy activatable tenant to paid plans', async () => {
    getSubscription.mockResolvedValue({
      ...subscription,
      state: 'blocked',
      planCode: null,
      planName: null,
      trialEndsAt: null,
      trialDaysRemaining: null,
      currentPeriodEnd: null,
      canActivateTrial: true,
    })

    renderAccount()

    expect(
      await screen.findByRole('button', { name: 'Оформити підписку' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /активувати/i }),
    ).not.toBeInTheDocument()
  })

  it('opens and marks the plan requested in the URL', async () => {
    getSubscription.mockResolvedValue(subscription)
    getPlans.mockResolvedValue([
      {
        code: 'pro_monthly',
        name: 'Pro',
        amount: 59,
        currency: 'USD',
        interval: '1m',
        trialDays: 7,
        limits: {
          cars: 20,
          intakes: 25,
          parts: 2000,
          users: 5,
          cashRegisters: 2,
          photosPerPart: null,
        },
        features: [],
      },
    ])

    render(
      <MemoryRouter
        initialEntries={['/account?section=plans&plan=pro_monthly']}
      >
        <AccountScreen />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Обрано')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Тарифи' })).toBeInTheDocument()
  })
})
