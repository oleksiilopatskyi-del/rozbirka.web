import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { FEATURES } from '@/api/types'
import type { TenantAccessSnapshot } from '../access-types'
import type * as ModuleRegistry from '../module-registry'
import { DashboardDestinations } from './DashboardDestinations'

vi.mock('../module-registry', async (importOriginal) => {
  const actual = await importOriginal<typeof ModuleRegistry>()
  return {
    ...actual,
    cabinetModules: {
      ...actual.cabinetModules,
      cars: { ...actual.cabinetModules.cars, released: true },
      intakes: { ...actual.cabinetModules.intakes, released: true },
      reports: { ...actual.cabinetModules.reports, released: true },
    },
  }
})

const usage = {
  cars: { used: 1, max: 10 },
  intakes: { used: 1, max: 10 },
  parts: { used: 1, max: 10 },
  users: { used: 1, max: 10 },
  cashRegisters: { used: 1, max: 10 },
}

const snapshot = ({
  role = 'owner',
  permissions = [
    'cars.view',
    'cars.manage',
    'intakes.view',
    'intakes.manage',
    'reports.view',
    'reports.manage',
  ],
  features = [FEATURES.AdvancedReports, FEATURES.IntakeManagement],
  state = 'active',
  quotaUsage = usage,
}: {
  role?: string
  permissions?: string[]
  features?: string[]
  state?: 'active' | 'blocked'
  quotaUsage?: typeof usage
} = {}): TenantAccessSnapshot => ({
  userId: 'user-1',
  tenantId: 'tenant-1',
  generation: 1,
  role,
  permissions: new Set(permissions),
  features: new Set(features),
  entitlement: { state, usage: quotaUsage },
  subscription: null,
})

function renderDestinations(access: TenantAccessSnapshot) {
  return render(
    <MemoryRouter>
      <DashboardDestinations snapshot={access} tenant={{ slug: 'koval' }} />
    </MemoryRouter>,
  )
}

it('derives unique in-tenant links and quick actions without dashboard.view', () => {
  const access = snapshot()
  expect(access.permissions).not.toContain('dashboard.view')

  renderDestinations(access)

  const destinations = screen.getByRole('region', { name: 'Робочі модулі' })
  expect(
    within(destinations).getByRole('link', { name: 'Автомобілі' }),
  ).toHaveAttribute('href', '/app/koval/cars')
  expect(
    within(destinations).getByRole('link', { name: 'Приймання' }),
  ).toHaveAttribute('href', '/app/koval/intakes')
  expect(
    within(destinations).getByRole('link', { name: 'Звіти' }),
  ).toHaveAttribute('href', '/app/koval/reports')

  const actions = screen.getByRole('region', { name: 'Швидкі дії' })
  expect(
    within(actions).getByRole('link', { name: 'Відкрити: Автомобілі' }),
  ).toHaveAttribute('href', '/app/koval/cars')
  expect(
    within(actions).getByRole('link', { name: 'Відкрити: Приймання' }),
  ).toHaveAttribute('href', '/app/koval/intakes')
  expect(
    within(actions).getByRole('link', { name: 'Відкрити: Звіти' }),
  ).toHaveAttribute('href', '/app/koval/reports')

  const labels = screen.getAllByRole('link').map((link) => link.textContent)
  expect(new Set(labels).size).toBe(labels.length)
  expect(
    screen.queryByRole('link', { name: 'Запчастини' }),
  ).not.toBeInTheDocument()
})

it.each([
  [
    'manager',
    snapshot({
      role: 'manager',
      permissions: ['cars.view', 'cars.manage', 'intakes.view'],
      features: [FEATURES.IntakeManagement],
    }),
    ['Автомобілі', 'Приймання'],
    ['Відкрити: Автомобілі'],
  ],
  [
    'master',
    snapshot({
      role: 'master',
      permissions: ['intakes.view', 'intakes.manage'],
      features: [FEATURES.IntakeManagement],
    }),
    ['Приймання'],
    ['Відкрити: Приймання'],
  ],
  [
    'missing feature',
    snapshot({ features: [FEATURES.IntakeManagement] }),
    ['Автомобілі', 'Приймання'],
    ['Відкрити: Автомобілі', 'Відкрити: Приймання'],
  ],
  ['blocked subscription', snapshot({ state: 'blocked' }), [], []],
  [
    'exhausted intake quota',
    snapshot({
      quotaUsage: { ...usage, intakes: { used: 10, max: 10 } },
    }),
    ['Автомобілі', 'Приймання', 'Звіти'],
    ['Відкрити: Автомобілі', 'Відкрити: Звіти'],
  ],
] as const)('%s respects policy outcomes', (_name, access, links, actions) => {
  renderDestinations(access)

  for (const label of links) {
    expect(screen.getByRole('link', { name: label })).toBeVisible()
  }
  for (const label of actions) {
    expect(screen.getByRole('link', { name: label })).toHaveClass('min-h-11')
  }

  const renderedLinks = screen.queryAllByRole('link')
  expect(renderedLinks).toHaveLength(links.length + actions.length)
  expect(
    renderedLinks.every((link) =>
      link.getAttribute('href')?.startsWith('/app/koval/'),
    ),
  ).toBe(true)
})
