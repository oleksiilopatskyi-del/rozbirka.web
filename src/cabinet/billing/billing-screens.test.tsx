import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, CanceledError } from 'axios'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { billingApi } from '@/api/billing'
import type { PublicPlanDto, SubscriptionDto } from '@/api/types'
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

const cancellableSubscription: SubscriptionDto = {
  ...subscription,
  state: 'active',
  amount: 29,
  canSubscribe: false,
  canCancel: true,
}

const litePlan: PublicPlanDto = {
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
}

const pendingPayment = {
  id: 'payment-1',
  type: 'checkout' as const,
  status: 'pending' as const,
  amount: 29,
  currency: 'USD',
  providerInvoiceId: 'invoice-1',
  checkoutUrl: 'https://pay.example/checkout',
  checkoutExpiresAt: '2026-08-15T12:00:00Z',
  createdAt: '2026-08-15T10:00:00Z',
}

const paymentPage = (items = [pendingPayment]) => ({
  items,
  page: 1,
  pageSize: 10,
  total: items.length,
  totalPages: items.length > 0 ? 1 : 0,
})

function axiosFailure(status: number, message: string) {
  return new AxiosError(
    'request failed',
    'ERR_BAD_RESPONSE',
    { headers: new AxiosHeaders(), method: 'post', url: '/billing' },
    undefined,
    {
      status,
      statusText: 'Error',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
      data: { error: { code: 'BILLING_FAILURE', message } },
    },
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const cabinet = (
  permissions = ['billing.view', 'billing.manage'],
  currentSubscription: SubscriptionDto = subscription,
  generation = 4,
) =>
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
      generation,
      role: 'custom-role',
      permissions: new Set(permissions),
      features: new Set<string>(),
      subscription: currentSubscription,
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
  vi.mocked(billingApi.getPlans).mockResolvedValue([litePlan])

  renderScreen(<PlansScreen />)

  expect(await screen.findByText('Lite')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Обрати' })).toBeNull()
})

it('checks billing.manage immediately before checkout dispatch', async () => {
  vi.mocked(billingApi.getPlans).mockResolvedValue([litePlan])
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
  vi.mocked(billingApi.getPlans).mockResolvedValue([litePlan])
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
  vi.mocked(billingApi.getPayments).mockResolvedValue(paymentPage())
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
  vi.mocked(billingApi.getPayments).mockResolvedValue(paymentPage())
  renderScreen(<PaymentsScreen />)

  const checkout = await screen.findByRole('link', {
    name: 'Продовжити оплату',
  })
  expect(checkout).toHaveAttribute('href', 'https://pay.example/checkout')
  expect(checkout).toHaveAttribute('target', '_blank')
  expect(checkout).toHaveAttribute('rel', 'noopener noreferrer')
})

it('prevents stale-authorized pending checkout navigation', async () => {
  vi.mocked(billingApi.getPayments).mockResolvedValue(paymentPage())
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

it('shows a retryable plans error instead of treating a network failure as empty', async () => {
  vi.mocked(billingApi.getPlans)
    .mockRejectedValueOnce(new AxiosError('offline', 'ERR_NETWORK'))
    .mockResolvedValueOnce([litePlan])
  const user = userEvent.setup()
  renderScreen(<PlansScreen />)

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Не вдалося завантажити тарифи: немає з’єднання з мережею.',
  )
  expect(screen.queryByText(/Дані недоступні/)).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Спробувати ще раз' }))

  expect(await screen.findByText('Lite')).toBeInTheDocument()
  expect(billingApi.getPlans).toHaveBeenCalledTimes(2)
})

it('shows a retryable payments error instead of treating a network failure as empty', async () => {
  vi.mocked(billingApi.getPayments)
    .mockRejectedValueOnce(new AxiosError('offline', 'ERR_NETWORK'))
    .mockResolvedValueOnce(paymentPage([]))
  const user = userEvent.setup()
  renderScreen(<PaymentsScreen />)

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Не вдалося завантажити платежі: немає з’єднання з мережею.',
  )
  expect(screen.queryByText('Платежів ще не було.')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Спробувати ще раз' }))

  expect(await screen.findByText('Платежів ще не було.')).toBeInTheDocument()
  expect(billingApi.getPayments).toHaveBeenCalledTimes(2)
})

it('surfaces a backend checkout denial without leaking an unhandled rejection', async () => {
  vi.mocked(billingApi.getPlans).mockResolvedValue([litePlan])
  vi.mocked(billingApi.subscribe).mockRejectedValue(
    axiosFailure(403, 'raw backend permission detail'),
  )
  const unhandledRejection = vi.fn()
  window.addEventListener('unhandledrejection', unhandledRejection)

  try {
    const user = userEvent.setup()
    renderScreen(<PlansScreen />)
    await user.click(await screen.findByRole('button', { name: 'Обрати' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'У вас більше немає права змінювати підписку.',
    )
    expect(alert).not.toHaveTextContent('raw backend permission detail')
    await Promise.resolve()
    expect(unhandledRejection).not.toHaveBeenCalled()
  } finally {
    window.removeEventListener('unhandledrejection', unhandledRejection)
  }
})

it('surfaces a conflicting payment cancellation without leaking an unhandled rejection', async () => {
  vi.mocked(billingApi.getPayments).mockResolvedValue(paymentPage())
  vi.mocked(billingApi.cancelPayment).mockRejectedValue(
    axiosFailure(409, 'raw provider status detail'),
  )
  const unhandledRejection = vi.fn()
  window.addEventListener('unhandledrejection', unhandledRejection)

  try {
    const user = userEvent.setup()
    renderScreen(<PaymentsScreen />)
    await user.click(await screen.findByRole('button', { name: 'Скасувати' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Статус платежу вже змінився. Оновіть список платежів.',
    )
    expect(alert).not.toHaveTextContent('raw provider status detail')
    await Promise.resolve()
    expect(unhandledRejection).not.toHaveBeenCalled()
  } finally {
    window.removeEventListener('unhandledrejection', unhandledRejection)
  }
})

it('settles a rejected subscription cancellation with truthful feedback', async () => {
  vi.mocked(useCabinet).mockReturnValue(
    cabinet(undefined, cancellableSubscription),
  )
  vi.mocked(billingApi.cancel).mockRejectedValue(
    new AxiosError('offline', 'ERR_NETWORK'),
  )
  const confirmCancellation = vi.spyOn(window, 'confirm').mockReturnValue(true)
  const unhandledRejection = vi.fn()
  window.addEventListener('unhandledrejection', unhandledRejection)

  try {
    const user = userEvent.setup()
    renderScreen(<SubscriptionScreen />)
    await user.click(screen.getByRole('button', { name: 'Скасувати' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не вдалося скасувати підписку: немає з’єднання з мережею.',
    )
    expect(screen.getByRole('button', { name: 'Скасувати' })).toBeEnabled()
    await Promise.resolve()
    expect(unhandledRejection).not.toHaveBeenCalled()
  } finally {
    confirmCancellation.mockRestore()
    window.removeEventListener('unhandledrejection', unhandledRejection)
  }
})

it('ignores a recognized tenant-scope cancellation while a new plans generation loads', async () => {
  const oldLoad = deferred<PublicPlanDto[]>()
  vi.mocked(billingApi.getPlans)
    .mockReturnValueOnce(oldLoad.promise)
    .mockResolvedValueOnce([litePlan])
  let currentCabinet = cabinet(undefined, subscription, 4)
  vi.mocked(useCabinet).mockImplementation(() => currentCabinet)
  const view = renderScreen(<PlansScreen />)
  await waitFor(() => expect(billingApi.getPlans).toHaveBeenCalledOnce())

  tenantRequestScope.rotate()
  currentCabinet = cabinet(undefined, subscription, 5)
  view.rerender(
    <MemoryRouter>
      <PlansScreen />
    </MemoryRouter>,
  )
  oldLoad.reject(new CanceledError())

  expect(await screen.findByText('Lite')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('surfaces a cancellation that was not caused by tenant-scope rotation', async () => {
  vi.mocked(billingApi.getPlans).mockRejectedValue(new CanceledError())

  renderScreen(<PlansScreen />)

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Не вдалося завантажити тарифи. Спробуйте ще раз.',
  )
})

it('does not surface a late mutation failure from a stale cabinet generation', async () => {
  vi.mocked(billingApi.getPayments).mockResolvedValue(paymentPage())
  const staleCancellation = deferred<void>()
  vi.mocked(billingApi.cancelPayment).mockReturnValue(staleCancellation.promise)
  let currentCabinet = cabinet(undefined, subscription, 4)
  vi.mocked(useCabinet).mockImplementation(() => currentCabinet)
  const user = userEvent.setup()
  const view = renderScreen(<PaymentsScreen />)
  await user.click(await screen.findByRole('button', { name: 'Скасувати' }))

  tenantRequestScope.rotate()
  currentCabinet = cabinet(undefined, subscription, 5)
  view.rerender(
    <MemoryRouter>
      <PaymentsScreen />
    </MemoryRouter>,
  )
  staleCancellation.reject(axiosFailure(409, 'stale backend response'))

  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Скасувати' })).toBeEnabled(),
  )
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
