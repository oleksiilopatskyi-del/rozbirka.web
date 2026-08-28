import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubscriptionDto } from '../api/types'
import type { CabinetContextValue } from './CabinetContext'
import { useCabinet } from './CabinetContext'
import { ModuleBoundary, type CabinetModuleScreenProps } from './ModuleBoundary'
import type {
  CabinetModuleDefinition,
  CabinetModuleKey,
} from './module-registry'

interface ModuleRegistryExports {
  cabinetModules: Readonly<Record<CabinetModuleKey, CabinetModuleDefinition>>
}

vi.mock('./CabinetContext', () => ({
  useCabinet: vi.fn(),
}))

vi.mock('./module-registry', async (importOriginal) => {
  const actual = await importOriginal<ModuleRegistryExports>()
  return {
    ...actual,
    cabinetModules: {
      ...actual.cabinetModules,
      cars: { ...actual.cabinetModules.cars, released: false },
    },
  }
})

const mockedUseCabinet = vi.mocked(useCabinet)

const renderBoundary = (
  module: CabinetModuleKey,
  screenComponent: LazyExoticComponent<ComponentType<CabinetModuleScreenProps>>,
) =>
  render(
    <MemoryRouter>
      <ModuleBoundary module={module} screen={screenComponent} />
    </MemoryRouter>,
  )

const subscription: SubscriptionDto = {
  state: 'active',
  planCode: 'pro',
  planName: 'Pro',
  trialEndsAt: null,
  trialDaysRemaining: null,
  currentPeriodEnd: null,
  nextChargeAt: null,
  amount: 4900,
  currency: 'UAH',
  cardLast4: '4242',
  cardBrand: 'visa',
  canSubscribe: false,
  canCancel: true,
  canReactivate: false,
  canActivateTrial: false,
  usage: {
    cars: { used: 1, max: 10 },
    intakes: { used: 1, max: 10 },
    parts: { used: 1, max: 10 },
    users: { used: 1, max: 10 },
    cashRegisters: { used: 1, max: 10 },
  },
  features: [],
}

const cabinet = (
  permissions: string[] = ['billing.view'],
): CabinetContextValue => ({
  status: 'ready',
  targetTenant: {
    id: 'tenant-1',
    name: 'Koval Auto',
    slug: 'koval',
    plan: 'active',
    planTier: 'pro',
    city: 'Київ',
    logoUrl: null,
    isActive: true,
    createdAt: '2026-08-01T10:00:00Z',
    roleName: 'owner',
  },
  snapshot: {
    userId: 'user-1',
    tenantId: 'tenant-1',
    generation: 1,
    role: 'owner',
    permissions: new Set(permissions),
    features: new Set(),
    entitlement: { state: subscription.state, usage: subscription.usage },
    subscription,
  },
  error: null,
  retry: vi.fn(),
  switchTenant: vi.fn(),
})

beforeEach(() => {
  mockedUseCabinet.mockReturnValue(cabinet())
})

describe('ModuleBoundary', () => {
  it('never loads code for an unreleased registry module', () => {
    const load = vi.fn(() =>
      Promise.resolve({
        default: (_props: CabinetModuleScreenProps) => <p>Cars module code</p>,
      }),
    )
    const Screen = lazy(load)

    renderBoundary('cars', Screen)

    expect(
      screen.getByRole('heading', { name: 'Модуль готується до запуску' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'До головної' })).toHaveAttribute(
      'href',
      '/app/koval/dashboard',
    )
    expect(screen.queryByText('Cars module code')).not.toBeInTheDocument()
    expect(load).not.toHaveBeenCalled()
  })

  it('loads an allowed released module screen lazily', async () => {
    const load = vi.fn(() =>
      Promise.resolve({
        default: ({ definition }: CabinetModuleScreenProps) => (
          <h1>{definition.navigation?.label}</h1>
        ),
      }),
    )
    const Screen = lazy(load)

    renderBoundary('billing', Screen)

    expect(
      await screen.findByRole('heading', { name: 'Підписка' }),
    ).toBeVisible()
    expect(load).toHaveBeenCalledOnce()
  })

  it('maps a policy denial to the access state without loading module code', () => {
    mockedUseCabinet.mockReturnValue(cabinet([]))
    const load = vi.fn(() =>
      Promise.resolve({
        default: (_props: CabinetModuleScreenProps) => (
          <p>Billing module code</p>
        ),
      }),
    )
    const Screen = lazy(load)

    renderBoundary('billing', Screen)

    expect(
      screen.getByRole('heading', { name: 'Недостатньо прав' }),
    ).toBeVisible()
    expect(screen.queryByText('Billing module code')).not.toBeInTheDocument()
    expect(load).not.toHaveBeenCalled()
  })

  it('shows a truthful plan state for a released feature-gated module without loading its code', () => {
    mockedUseCabinet.mockReturnValue(cabinet(['reports.view']))
    const load = vi.fn(() =>
      Promise.resolve({
        default: (_props: CabinetModuleScreenProps) => (
          <p>Reports module code</p>
        ),
      }),
    )
    const Screen = lazy(load)

    renderBoundary('reports', Screen)

    expect(
      screen.getByRole('heading', {
        name: 'Функція недоступна на вашому тарифі',
      }),
    ).toBeVisible()
    expect(screen.getByText(/поточн.*тариф/i)).toBeVisible()
    expect(screen.getByRole('link', { name: 'До головної' })).toHaveAttribute(
      'href',
      '/app/koval/dashboard',
    )
    expect(
      screen.queryByRole('heading', { name: 'Модуль готується до запуску' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Reports module code')).not.toBeInTheDocument()
    expect(load).not.toHaveBeenCalled()
  })
})
