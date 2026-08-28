import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { DashboardData } from '@/api/dashboard-contract'
import { DashboardSummary } from './DashboardSummary'

const summary = (overrides: Partial<DashboardData> = {}): DashboardData => ({
  userName: 'Максим',
  role: 'owner',
  yardName: 'Koval Auto',
  yardCity: 'Київ',
  isYardEmpty: false,
  todaySalesCount: 1_234,
  availablePartsCount: 5_678,
  intakesCount: 12,
  revenue: {
    today: [{ currency: 'UAH', amount: 45_600 }],
    week: [],
    month: [],
  },
  todayNewPartsCount: 23,
  lastActivity: {
    type: 'Додано запчастину',
    userName: 'Олена',
    timestamp: '2026-08-28T13:45:00Z',
  },
  activeCarsCount: 6,
  outOfStockPartsCount: 0,
  customersCount: 789,
  totalBalanceUah: 123_456,
  teamMembersCount: 4,
  totalInvested: 23_000,
  totalRecouped: 8_500,
  carsInWork: 3,
  totalPartsSold: 45,
  myPartsToday: 2,
  lastMyActivity: {
    type: 'Продано запчастину',
    userName: 'Максим',
    timestamp: '2026-08-28T14:00:00Z',
  },
  ...overrides,
})

const getByExactText = (text: string) =>
  screen.getByText((_content, element) => element?.textContent === text)

it('renders common and owner totals in Ukrainian formats', () => {
  render(<DashboardSummary data={summary()} />)

  expect(screen.getByRole('region', { name: 'Зведення' })).toContainElement(
    screen.getByText('Продажів сьогодні'),
  )
  expect(getByExactText('1\u00a0234')).toBeInTheDocument()
  expect(getByExactText('5\u00a0678')).toBeInTheDocument()
  expect(getByExactText('45\u00a0600\u00a0₴')).toBeInTheDocument()
  expect(getByExactText('123\u00a0456\u00a0₴')).toBeInTheDocument()
  const activity = screen.getByRole('region', { name: 'Остання активність' })
  expect(activity).toHaveTextContent(/28\.08\.2026, 16:45/)
  expect(activity).toHaveTextContent(/Додано запчастину/)
})

it('does not invent absent owner values', () => {
  render(
    <DashboardSummary
      data={summary({
        activeCarsCount: null,
        outOfStockPartsCount: null,
        customersCount: null,
        totalBalanceUah: null,
        teamMembersCount: null,
        totalInvested: null,
        totalRecouped: null,
      })}
    />,
  )

  expect(screen.queryByText('Активних авто')).not.toBeInTheDocument()
  expect(screen.queryByText('Баланс')).not.toBeInTheDocument()
  expect(screen.queryByText('Інвестовано')).not.toBeInTheDocument()
})

it('renders Core-provided work totals for an owner, including a real zero', () => {
  render(
    <DashboardSummary
      data={summary({
        role: 'owner',
        carsInWork: 3,
        totalPartsSold: 0,
        myPartsToday: null,
        lastMyActivity: null,
      })}
    />,
  )

  expect(screen.getByText('Авто в роботі')).toBeInTheDocument()
  expect(screen.getByText('Продано запчастин').parentElement).toHaveTextContent(
    '0',
  )
})

it('renders Core-provided personal totals and activity for a manager', () => {
  render(
    <DashboardSummary
      data={summary({
        role: 'manager',
        carsInWork: null,
        totalPartsSold: null,
        myPartsToday: 2,
        lastMyActivity: {
          type: 'Продано запчастину',
          userName: 'Олена',
          timestamp: '2026-08-28T14:00:00Z',
        },
      })}
    />,
  )

  expect(screen.getByText('Продано мною сьогодні')).toBeInTheDocument()
  expect(
    screen.getByRole('region', { name: 'Моя остання активність' }),
  ).toHaveTextContent('Продано запчастину · Олена')
})

it('renders master-only totals and activity without owner values', () => {
  render(
    <DashboardSummary
      data={summary({
        role: 'master',
        activeCarsCount: null,
        outOfStockPartsCount: null,
        customersCount: null,
        totalBalanceUah: null,
        teamMembersCount: null,
        totalInvested: null,
        totalRecouped: null,
      })}
    />,
  )

  expect(screen.getByText('Авто в роботі')).toBeInTheDocument()
  expect(screen.getByText('Продано мною сьогодні')).toBeInTheDocument()
  expect(screen.getByText(/Продано запчастину/)).toBeInTheDocument()
  expect(screen.queryByText('Активних авто')).not.toBeInTheDocument()
})

it('renders an empty yard as a successful onboarding state', () => {
  render(<DashboardSummary data={summary({ isYardEmpty: true })} />)

  expect(screen.getByText('Почніть наповнювати розбірку')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
