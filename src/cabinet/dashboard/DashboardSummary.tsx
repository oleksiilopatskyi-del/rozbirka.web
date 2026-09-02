import { EmptyState } from '@/components/app'
/**
 * Parts trade in dollars — the analytics contract names the same figure
 * `revenueUsd`; only the till (`totalBalanceUah`) is hryvnia.
 */
const CAR_CURRENCY = 'USD'

import { cn } from '@/lib/utils'
import type { DashboardData, LastActivity } from '@/api/dashboard-contract'

const numberFormatter = new Intl.NumberFormat('uk-UA')
const currencyFormatter = (currency: string) =>
  new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  })
const dateFormatter = new Intl.DateTimeFormat('uk-UA', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Kyiv',
})

interface SummaryItem {
  label: string
  value: string
  accent?: boolean
}

export function DashboardSummary({ data }: { data: DashboardData }) {
  const revenue = revenueItem(data)
  const commonItems = compact([
    revenue === null ? null : { ...revenue, accent: true },
    item('Продажів сьогодні', data.todaySalesCount),
    item('Доступних запчастин', data.availablePartsCount),
    item('Приймань', data.intakesCount),
    item('Нових запчастин сьогодні', data.todayNewPartsCount),
  ])
  const managementItems = compact([
    item('Активних авто', data.activeCarsCount),
    item('Немає в наявності', data.outOfStockPartsCount),
    item('Клієнтів', data.customersCount),
    moneyItem('Баланс каси', data.totalBalanceUah, 'UAH'),
    item('Учасників команди', data.teamMembersCount),
    moneyItem('Інвестовано', data.totalInvested, CAR_CURRENCY),
    moneyItem('Повернуто', data.totalRecouped, CAR_CURRENCY),
  ])
  const workItems = compact([
    item('Авто в роботі', data.carsInWork),
    item('Продано запчастин', data.totalPartsSold),
    item('Продано мною сьогодні', data.myPartsToday),
  ])

  return (
    <section aria-label="Зведення" className="grid gap-4">
      {data.isYardEmpty ? <DashboardEmptyState /> : null}
      <SummaryList items={commonItems} />
      {managementItems.length > 0 ? (
        <SummaryList items={managementItems} />
      ) : null}
      {workItems.length > 0 ? <SummaryList items={workItems} /> : null}
      <Activity activity={data.lastActivity} title="Остання активність" />
      <Activity activity={data.lastMyActivity} title="Моя остання активність" />
    </section>
  )
}

function DashboardEmptyState() {
  return (
    <EmptyState
      description="Додайте перше авто або запчастину, щоб побачити робоче зведення."
      title="Почніть наповнювати розбірку"
    />
  )
}

function SummaryList({ items }: { items: readonly SummaryItem[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ label, value, accent }) => (
        <div
          className={cn(
            'rounded-panel border p-4',
            accent
              ? 'border-brand/30 bg-brand/[0.06]'
              : 'border-app-line bg-app-raised',
          )}
          key={label}
        >
          <dt className="text-app-dim text-[12.5px]">{label}</dt>
          <dd className="mt-1.5 text-[25px] leading-tight font-light tracking-[-0.02em] tabular-nums text-white">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Activity({
  activity,
  title,
}: {
  activity: LastActivity | null
  title: string
}) {
  if (activity === null) return null

  return (
    <section
      aria-label={title}
      className="border-app-line rounded-panel bg-app-raised border p-4"
    >
      <h2 className="text-sm font-medium text-white">{title}</h2>
      <p className="text-app-muted mt-2 text-sm">
        {activity.type} · {activity.userName} · {formatDate(activity.timestamp)}
      </p>
    </section>
  )
}

function item(label: string, value: number | null): SummaryItem | null {
  return value === null ? null : { label, value: numberFormatter.format(value) }
}

function moneyItem(
  label: string,
  value: number | null,
  currency: string,
): SummaryItem | null {
  return value === null
    ? null
    : { label, value: currencyFormatter(currency).format(value) }
}

/**
 * The server tags today's revenue with its own currency, so take what it sent
 * rather than looking for one code: a yard trading in dollars used to see this
 * figure disappear entirely.
 */
function revenueItem(data: DashboardData): SummaryItem | null {
  const entry = data.revenue?.today[0]
  if (entry === undefined) return null
  return moneyItem('Виручка сьогодні', entry.amount, entry.currency)
}

function compact(items: readonly (SummaryItem | null)[]): SummaryItem[] {
  return items.filter((item): item is SummaryItem => item !== null)
}

function formatDate(timestamp: string): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.valueOf()) ? '—' : dateFormatter.format(date)
}
