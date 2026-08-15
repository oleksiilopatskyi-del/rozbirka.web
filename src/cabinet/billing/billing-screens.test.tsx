import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { billingApi } from '@/api/billing'
import type { SubscriptionDto } from '@/api/types'
import { useCabinet, type CabinetContextValue } from '../CabinetContext'
import { tenantRequestScope } from '../tenant-request-scope'
import { PaymentsScreen } from './payments-screen'
import { PlansScreen } from './plans-screen'
import { SubscriptionScreen } from './subscription-screen'

/* eslint-disable @typescript-eslint/unbound-method -- Vitest resolves object methods into typed mocks. */

vi.mock('@/api/billing', () => ({
  billingApi: {
    getSubscription: vi.fn(),
    getPlans: vi.fn(),
    subscribe: vi.fn(),
    cancel: vi.fn(),
    getPayments: vi.fn(),
    cancelPayment: vi.fn(),
  },
}))
vi.mock('../CabinetContext', () => ({ useCabinet: vi.fn() }))

const subscription: SubscriptionDto = {
  state: 'trial',
  planCode: 'pro_monthly',
  planName: 'Pro',
  trialEndsAt: '2026-08-21T00:00:00Z',
  trialDaysRemaining: 7,
  currentPeriodEnd: '2026-08-21T00:00:00Z',
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

const cabinet = (permissions = ['billing.view', 'billing.manage']) =>
  ({
    status: 'ready',
    targetTenant: {
      id: 'tenant-1',
      name: 'Koval Auto',
      slug: 'koval',
      plan: 'trial',
      planTier: 'pro',
      city: null,
      logoUrl: null,
      isActive: true,
      createdAt: '2026-08-01T10:00:00Z',
      roleName: 'manager',
    },
    snapshot: {
      userId: 'user-1',
      tenantId: 'tenant-1',
      generation: 4,
      role: 'custom-role',
      permissions: new Set(permissions),
      features: new Set<string>(),
      subscription,
    },
    error: null,
    retry: vi.fn(),
    switchTenant: vi.fn(),
  }) satisfies CabinetContextValue

const renderScreen = (screenToRender: ReactNode) =>
  render(<MemoryRouter>{screenToRender}</MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  tenantRequestScope.rotate()
  vi.mocked(useCabinet).mockReturnValue(cabinet())
  vi.mocked(billingApi.getPlans).mockResolvedValue([])
  vi.mocked(billingApi.getPayments).mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  })
})

it('uses the cabinet subscription snapshot without loading it again', () => {
  renderScreen(<SubscriptionScreen />)

  expect(screen.getByText('Pro')).toBeInTheDocument()
  expect(screen.getByText('7 днів')).toBeInTheDocument()
  expect(billingApi.getSubscription).not.toHaveBeenCalled()
})

it('loads plans with a signal that aborts on tenant transition', async () => {
  renderScreen(<PlansScreen />)

  await waitFor(() => expect(billingApi.getPlans).toHaveBeenCalledOnce())
  const options = vi.mocked(billingApi.getPlans).mock.calls[0]?.[0]
  expect(options?.signal?.aborted).toBe(false)

  tenantRequestScope.rotate()

  expect(options?.signal?.aborted).toBe(true)
})

it('hides checkout controls without billing.manage regardless of role name', async () => {
  vi.mocked(useCabinet).mockReturnValue(cabinet(['billing.view']))
  vi.mocked(billingApi.getPlans).mockResolvedValue([
    {
      code: 'lite_monthly',
      name: 'Lite',
      amount: 29,
      currency: 'USD',
      interval: '1m',
      trialDays: 14,
      limits: {
        cars: 10,
        intakes: 10,
        parts: 1000,
        users: 2,
        cashRegisters: 1,
        photosPerPart: null,
      },
      features: [],
    },
  ])

  renderScreen(<PlansScreen />)

  expect(await screen.findByText('Lite')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Обрати' })).toBeNull()
})

it('checks billing.manage immediately before checkout dispatch', async () => {
  vi.mocked(billingApi.getPlans).mockResolvedValue([
    {
      code: 'lite_monthly',
      name: 'Lite',
      amount: 29,
      currency: 'USD',
      interval: '1m',
      trialDays: 14,
      limits: {
        cars: 10,
        intakes: 10,
        parts: 1000,
        users: 2,
        cashRegisters: 1,
        photosPerPart: null,
      },
      features: [],
    },
  ])
  vi.mocked(billingApi.subscribe).mockReturnValue(new Promise(() => undefined))
  const user = userEvent.setup()
  renderScreen(<PlansScreen />)

  await user.click(await screen.findByRole('button', { name: 'Обрати' }))

  expect(billingApi.subscribe).toHaveBeenCalledWith(
    { planCode: 'lite_monthly' },
    { signal: tenantRequestScope.signal },
  )
})

it('rechecks the latest permission instead of trusting the rendered control', async () => {
  vi.mocked(billingApi.getPlans).mockResolvedValue([
    {
      code: 'lite_monthly',
      name: 'Lite',
      amount: 29,
      currency: 'USD',
      interval: '1m',
      trialDays: 14,
      limits: {
        cars: 10,
        intakes: 10,
        parts: 1000,
        users: 2,
        cashRegisters: 1,
        photosPerPart: null,
      },
      features: [],
    },
  ])
  const currentCabinet = cabinet()
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const user = userEvent.setup()
  renderScreen(<PlansScreen />)
  const button = await screen.findByRole('button', { name: 'Обрати' })
  currentCabinet.snapshot?.permissions.delete('billing.manage')

  await user.click(button)

  expect(billingApi.subscribe).not.toHaveBeenCalled()
})

it('loads payments with tenant scope and exposes cancel only with billing.manage', async () => {
  vi.mocked(billingApi.getPayments).mockResolvedValue({
    items: [
      {
        id: 'payment-1',
        type: 'checkout',
        status: 'pending',
        amount: 29,
        currency: 'USD',
        providerInvoiceId: 'invoice-1',
        checkoutUrl: 'https://pay.example/checkout',
        checkoutExpiresAt: '2026-08-15T12:00:00Z',
        createdAt: '2026-08-15T10:00:00Z',
      },
    ],
    page: 1,
    pageSize: 10,
    total: 1,
    totalPages: 1,
  })
  vi.mocked(useCabinet).mockReturnValue(cabinet(['billing.view']))

  renderScreen(<PaymentsScreen />)

  expect(await screen.findByText('Очікує')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Скасувати' })).toBeNull()
  expect(billingApi.getPayments).toHaveBeenCalledWith(1, 10, {
    signal: tenantRequestScope.signal,
  })
  const options = vi.mocked(billingApi.getPayments).mock.calls[0]?.[2]
  tenantRequestScope.rotate()
  expect(options?.signal?.aborted).toBe(true)
})

it('keeps pending checkout as a secured new-tab link', async () => {
  vi.mocked(billingApi.getPayments).mockResolvedValue({
    items: [
      {
        id: 'payment-1',
        type: 'checkout',
        status: 'pending',
        amount: 29,
        currency: 'USD',
        providerInvoiceId: 'invoice-1',
        checkoutUrl: 'https://pay.example/checkout',
        checkoutExpiresAt: '2026-08-15T12:00:00Z',
        createdAt: '2026-08-15T10:00:00Z',
      },
    ],
    page: 1,
    pageSize: 10,
    total: 1,
    totalPages: 1,
  })
  renderScreen(<PaymentsScreen />)

  const checkout = await screen.findByRole('link', {
    name: 'Продовжити оплату',
  })
  expect(checkout).toHaveAttribute('href', 'https://pay.example/checkout')
  expect(checkout).toHaveAttribute('target', '_blank')
  expect(checkout).toHaveAttribute('rel', 'noopener noreferrer')
})

it('prevents stale-authorized pending checkout navigation', async () => {
  vi.mocked(billingApi.getPayments).mockResolvedValue({
    items: [
      {
        id: 'payment-1',
        type: 'checkout',
        status: 'pending',
        amount: 29,
        currency: 'USD',
        providerInvoiceId: 'invoice-1',
        checkoutUrl: 'https://pay.example/checkout',
        checkoutExpiresAt: '2026-08-15T12:00:00Z',
        createdAt: '2026-08-15T10:00:00Z',
      },
    ],
    page: 1,
    pageSize: 10,
    total: 1,
    totalPages: 1,
  })
  const currentCabinet = cabinet()
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  renderScreen(<PaymentsScreen />)
  const checkout = await screen.findByRole('link', {
    name: 'Продовжити оплату',
  })
  currentCabinet.snapshot?.permissions.delete('billing.manage')
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })

  checkout.dispatchEvent(event)

  expect(event.defaultPrevented).toBe(true)
})
