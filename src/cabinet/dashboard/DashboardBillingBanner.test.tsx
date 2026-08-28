import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { expect, it } from 'vitest'
import type { SubscriptionDto, Tenant } from '@/api/types'
import type { TenantAccessSnapshot } from '../access-types'
import { DashboardBillingBanner } from './DashboardBillingBanner'

const tenant: Tenant = {
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
}

const subscription = (state: SubscriptionDto['state']): SubscriptionDto => ({
  state,
  planCode: 'pro_monthly',
  planName: 'Pro',
  trialEndsAt: '2026-09-01T00:00:00Z',
  trialDaysRemaining: 4,
  currentPeriodEnd: '2026-09-28T00:00:00Z',
  nextChargeAt: '2026-09-28T00:00:00Z',
  amount: 499,
  currency: 'UAH',
  cardLast4: null,
  cardBrand: null,
  canSubscribe: true,
  canCancel: false,
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
})

const snapshot = (
  state: SubscriptionDto['state'],
  permissions = ['billing.view'],
  exhausted = false,
): TenantAccessSnapshot => ({
  userId: 'user-1',
  tenantId: tenant.id,
  generation: 1,
  role: 'owner',
  permissions: new Set(permissions),
  features: new Set(),
  entitlement: {
    state,
    usage: {
      cars: { used: exhausted ? 10 : 1, max: 10 },
      intakes: { used: 1, max: 10 },
      parts: { used: 1, max: 10 },
      users: { used: 1, max: 10 },
      cashRegisters: { used: 1, max: 10 },
    },
  },
  subscription: subscription(state),
})

function renderBanner(access: TenantAccessSnapshot) {
  render(
    <MemoryRouter>
      <DashboardBillingBanner snapshot={access} tenant={tenant} />
    </MemoryRouter>,
  )
}

it.each([
  ['trial', 'Пробний період', false],
  ['pastDue', 'Потрібна оплата', true],
  ['cancelled', 'Підписку скасовано', true],
  ['blocked', 'Доступ призупинено', true],
] as const)(
  'guides %s subscriptions from the snapshot',
  (state, text, urgent) => {
    renderBanner(snapshot(state))

    const banner = screen.getByRole(urgent ? 'alert' : 'status')
    expect(banner).toHaveTextContent(text)
    expect(
      screen.getByRole('link', { name: 'Перейти до підписки' }),
    ).toHaveAttribute('href', '/app/koval/settings/billing/overview')
  },
)

it('guides an exhausted quota from entitlement data', () => {
  renderBanner(snapshot('active', ['billing.view'], true))

  expect(screen.getByRole('alert')).toHaveTextContent('Ліміт авто вичерпано')
})

it('does not expose a billing link when policy denies billing view', () => {
  renderBanner(snapshot('pastDue', []))

  expect(screen.getByText('Потрібна оплата')).toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})
