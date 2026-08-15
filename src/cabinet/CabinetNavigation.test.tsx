import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { expect, it, vi } from 'vitest'
import type { SubscriptionDto, Tenant } from '../api/types'
import type { TenantAccessSnapshot } from './access-types'
import { CabinetNavigation } from './CabinetNavigation'

const activeTenant: Tenant = {
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

const otherTenant: Tenant = {
  ...activeTenant,
  id: 'tenant-2',
  name: 'Luxe Parts',
  slug: 'luxe',
}

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

const snapshot = (permissions: string[]): TenantAccessSnapshot => ({
  userId: 'user-1',
  tenantId: activeTenant.id,
  generation: 1,
  role: 'owner',
  permissions: new Set(permissions),
  features: new Set(),
  subscription,
})

const renderNavigation = (
  permissions = ['billing.view'],
  onLogout = vi.fn<() => Promise<void>>(),
) =>
  render(
    <MemoryRouter initialEntries={['/app/koval/settings/billing/overview']}>
      <CabinetNavigation
        tenant={activeTenant}
        tenants={[activeTenant, otherTenant]}
        snapshot={snapshot(permissions)}
        onSwitchTenant={vi.fn()}
        onLogout={onLogout}
      />
    </MemoryRouter>,
  )

it('shows only released and allowed links with current-route semantics', () => {
  renderNavigation()

  const desktop = screen.getByRole('navigation', {
    name: 'Навігація кабінету',
  })
  expect(within(desktop).getByRole('link', { name: 'Головна' })).toBeVisible()
  expect(
    within(desktop).getByRole('link', { name: 'Підписка' }),
  ).toHaveAttribute('aria-current', 'page')
  expect(
    within(desktop).queryByRole('link', { name: 'Автомобілі' }),
  ).not.toBeInTheDocument()

  expect(
    screen
      .getByRole('navigation', { name: 'Навігація планшета' })
      .querySelectorAll('a.min-h-11.min-w-11'),
  ).not.toHaveLength(0)
  expect(screen.getByRole('button', { name: 'Ще' })).toHaveClass(
    'min-h-11',
    'min-w-11',
  )
})

it('omits released links denied by the shared cabinet policy', () => {
  renderNavigation([])

  const desktop = screen.getByRole('navigation', {
    name: 'Навігація кабінету',
  })
  expect(
    within(desktop).queryByRole('link', { name: 'Підписка' }),
  ).not.toBeInTheDocument()
  expect(within(desktop).getByRole('link', { name: 'Профіль' })).toBeVisible()
})

it('shows and restores every tablet rail label on focus and hover', async () => {
  const user = userEvent.setup()
  renderNavigation()
  const tabletNavigation = screen.getByRole('navigation', {
    name: 'Навігація планшета',
  })
  const rail = tabletNavigation.closest('aside')
  if (rail === null) throw new Error('Tablet rail was not rendered')

  const controls = [
    ...['Головна', 'Підписка', 'Тарифи', 'Платежі', 'Профіль'].map(
      (label) =>
        [
          within(tabletNavigation).getByRole('link', { name: label }),
          label,
        ] as const,
    ),
    [
      within(rail).getByRole('combobox', { name: 'Перемкнути розбірку' }),
      'Перемкнути розбірку',
    ] as const,
    [within(rail).getByRole('button', { name: 'Вийти' }), 'Вийти'] as const,
  ]

  for (const [control, label] of controls) {
    const tooltip = within(rail).getByText(label, {
      selector: '[role="tooltip"]',
    })
    expect(tooltip).not.toBeVisible()

    fireEvent.focus(control)
    expect(tooltip).toBeVisible()
    fireEvent.blur(control)
    expect(tooltip).not.toBeVisible()

    await user.hover(control)
    expect(tooltip).toBeVisible()
    await user.unhover(control)
    expect(tooltip).not.toBeVisible()
  }
})

it('opens the mobile More dialog by keyboard and restores trigger focus', async () => {
  const user = userEvent.setup()
  renderNavigation()
  const more = screen.getByRole('button', { name: 'Ще' })

  more.focus()
  await user.keyboard('{Enter}')

  const dialog = screen.getByRole('dialog', { name: 'Меню кабінету' })
  expect(dialog).toBeVisible()
  expect(within(dialog).getByRole('link', { name: 'Підписка' })).toBeVisible()
  expect(
    within(dialog).getByRole('combobox', { name: 'Перемкнути розбірку' }),
  ).toBeVisible()

  await user.keyboard('{Escape}')

  expect(
    screen.queryByRole('dialog', { name: 'Меню кабінету' }),
  ).not.toBeInTheDocument()
  expect(more).toHaveFocus()
})

it('exposes logout in the keyboard-accessible mobile menu', async () => {
  const onLogout = vi.fn<() => Promise<void>>().mockResolvedValue()
  const user = userEvent.setup()
  renderNavigation(['billing.view'], onLogout)

  screen.getByRole('button', { name: 'Ще' }).focus()
  await user.keyboard('{Enter}')
  const dialog = screen.getByRole('dialog', { name: 'Меню кабінету' })
  const logout = within(dialog).getByRole('button', { name: 'Вийти' })
  logout.focus()
  await user.keyboard('{Enter}')

  expect(onLogout).toHaveBeenCalledOnce()
})
