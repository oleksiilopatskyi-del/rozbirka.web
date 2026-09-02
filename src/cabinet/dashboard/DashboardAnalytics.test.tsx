import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type {
  DashboardAnalytics as DashboardAnalyticsData,
  DashboardPeriod,
} from '@/api/dashboard-contract'
import type { DashboardLoadable } from './use-dashboard-data'
import { DashboardAnalytics } from './DashboardAnalytics'

const analytics = (
  overrides: Partial<DashboardAnalyticsData> = {},
): DashboardAnalyticsData => ({
  period: 'week',
  labels: ['Пн', 'Вт', 'Ср'],
  revenue: {
    totals: { UAH: 12_500, USD: 75 },
    trendPercent: 12.5,
    series: [100, -200, 50],
  },
  partsSold: { total: 24, delta: -3, series: [4, 9, 11] },
  activeOrders: { total: 8, delta: 2, series: [2, 4, 2] },
  topPart: {
    id: 'part-1',
    name: 'Фара ліва',
    photoUrl: null,
    revenueUsd: 75,
    salesCount: 3,
    salesSeries: [1, 1, 1],
  },
  ...overrides,
})

const ready = (
  data: DashboardAnalyticsData = analytics(),
): DashboardLoadable<DashboardAnalyticsData> => ({
  status: 'ready',
  data,
  error: null,
})

function renderAnalytics({
  loadable = ready(),
  period = 'week',
  onPeriodChange = vi.fn(),
  retry = vi.fn().mockResolvedValue(undefined),
}: {
  loadable?: DashboardLoadable<DashboardAnalyticsData>
  period?: DashboardPeriod
  onPeriodChange?: (period: DashboardPeriod) => void
  retry?: () => Promise<void>
} = {}) {
  render(
    <DashboardAnalytics
      loadable={loadable}
      onPeriodChange={onPeriodChange}
      period={period}
      retry={retry}
    />,
  )
  return { onPeriodChange, retry }
}

it('changes the selected period once for pointer and keyboard activation', async () => {
  const user = userEvent.setup()
  const onPeriodChange = vi.fn()
  renderAnalytics({ onPeriodChange })
  const buttons = screen.getAllByRole('button')

  expect(
    screen.getByRole('group', { name: 'Період аналітики' }),
  ).toContainElement(screen.getByRole('button', { name: 'Тиждень' }))
  expect(buttons).toHaveLength(3)
  expect(
    buttons.filter((button) => button.getAttribute('aria-pressed') === 'true'),
  ).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Тиждень' })).toHaveClass(
    'min-h-11',
  )

  await user.click(screen.getByRole('button', { name: 'День' }))
  expect(onPeriodChange).toHaveBeenCalledTimes(1)
  expect(onPeriodChange).toHaveBeenLastCalledWith('day')

  onPeriodChange.mockClear()
  screen.getByRole('button', { name: 'Місяць' }).focus()
  await user.keyboard('{Enter}')
  expect(onPeriodChange).toHaveBeenCalledTimes(1)
  expect(onPeriodChange).toHaveBeenCalledWith('month')
})

it('moves focus across the period group with arrow keys without selecting', async () => {
  const user = userEvent.setup()
  const onPeriodChange = vi.fn()
  renderAnalytics({ onPeriodChange })

  screen.getByRole('button', { name: 'День' }).focus()
  await user.keyboard('{ArrowRight}')
  expect(screen.getByRole('button', { name: 'Тиждень' })).toHaveFocus()

  await user.keyboard('{ArrowLeft}{ArrowLeft}')
  expect(screen.getByRole('button', { name: 'Місяць' })).toHaveFocus()
  expect(onPeriodChange).not.toHaveBeenCalled()
})

it('renders response currencies, textual trends, authoritative totals, and decorative bars', () => {
  renderAnalytics()

  expect(screen.getByText('Виручка, UAH')).toBeInTheDocument()
  expect(screen.getByText('Виручка, USD')).toBeInTheDocument()
  expect(screen.getByText('+12,5%')).toHaveClass('text-state-ok')
  expect(screen.getByText('24')).toBeInTheDocument()
  expect(screen.getByText('−3')).toHaveClass('text-state-danger')
  expect(screen.getByText('8')).toBeInTheDocument()
  expect(screen.getByText('+2')).toHaveClass('text-state-ok')
  expect(screen.getAllByText(/менше, ніж у попередній період/)).toHaveLength(1)
  expect(screen.getByText('Фара ліва')).toBeInTheDocument()
  const charts = document.querySelectorAll(
    '[aria-label="Декоративна діаграма"]',
  )
  expect(charts).toHaveLength(4)
  expect(charts[0]).toHaveAttribute('aria-hidden', 'true')
})

it('omits the optional top part and renders zero series without invalid bar dimensions', () => {
  renderAnalytics({
    loadable: ready(
      analytics({
        revenue: { totals: {}, trendPercent: 0, series: [0, 0, 0] },
        partsSold: { total: 0, delta: 0, series: [0, 0, 0] },
        activeOrders: { total: 0, delta: 0, series: [0, 0, 0] },
        topPart: null,
      }),
    ),
  })

  expect(
    screen.queryByRole('heading', { name: 'Найкраща запчастина' }),
  ).not.toBeInTheDocument()
  expect(
    document.querySelectorAll('[aria-label="Декоративна діаграма"]'),
  ).toHaveLength(3)
  expect(screen.getAllByTestId('analytics-bar')).toHaveLength(9)
  for (const bar of screen.getAllByTestId('analytics-bar')) {
    expect(bar).toHaveStyle({ height: '0%' })
  }
})

it('shows analytics loading and error states without exposing retry outside the error', async () => {
  const loading: DashboardLoadable<DashboardAnalyticsData> = {
    status: 'loading',
    data: null,
    error: null,
  }
  const retry = vi.fn().mockResolvedValue(undefined)
  const { rerender } = render(
    <DashboardAnalytics
      loadable={loading}
      onPeriodChange={vi.fn()}
      period="week"
      retry={retry}
    />,
  )

  expect(screen.getByRole('status', { name: 'Аналітика' })).toHaveTextContent(
    'Завантажуємо аналітику',
  )
  expect(
    screen.queryByRole('button', { name: 'Спробувати ще раз' }),
  ).not.toBeInTheDocument()

  rerender(
    <DashboardAnalytics
      loadable={{
        status: 'error',
        data: null,
        error: { kind: 'network', message: 'Немає з’єднання з мережею.' },
      }}
      onPeriodChange={vi.fn()}
      period="week"
      retry={retry}
    />,
  )

  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Спробувати ще раз' }))
  expect(retry).toHaveBeenCalledOnce()
})
