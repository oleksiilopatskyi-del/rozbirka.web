import type { DashboardData, LastActivity } from '@/api/dashboard-contract'

const numberFormatter = new Intl.NumberFormat('uk-UA')
const currencyFormatter = new Intl.NumberFormat('uk-UA', {
  style: 'currency',
  currency: 'UAH',
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
}

export function DashboardSummary({ data }: { data: DashboardData }) {
  const commonItems = compact([
    item('Продажів сьогодні', data.todaySalesCount),
    item('Доступних запчастин', data.availablePartsCount),
    item('Приймань', data.intakesCount),
    item('Нових запчастин сьогодні', data.todayNewPartsCount),
    revenueItem(data),
  ])
  const managementItems = compact([
    item('Активних авто', data.activeCarsCount),
    item('Немає в наявності', data.outOfStockPartsCount),
    item('Клієнтів', data.customersCount),
    hryvniaItem('Баланс', data.totalBalanceUah),
    item('Учасників команди', data.teamMembersCount),
    hryvniaItem('Інвестовано', data.totalInvested),
    hryvniaItem('Повернуто', data.totalRecouped),
  ])
  const workItems = compact([
    item('Авто в роботі', data.carsInWork),
    item('Продано запчастин', data.totalPartsSold),
    item('Продано мною сьогодні', data.myPartsToday),
  ])

  return (
    <section aria-label="Зведення" className="grid gap-5">
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
    <div className="rounded-2xl border border-brand/30 bg-brand/[0.06] p-5">
      <h2 className="text-base font-medium text-white">
        Почніть наповнювати розбірку
      </h2>
      <p className="mt-2 text-sm leading-6 text-neutral-400">
        Додайте перше авто або запчастину, щоб побачити робоче зведення.
      </p>
    </div>
  )
}

function SummaryList({ items }: { items: readonly SummaryItem[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ label, value }) => (
        <div className="rounded-2xl border border-white/[0.06] p-4" key={label}>
          <dt className="text-sm text-neutral-400">{label}</dt>
          <dd className="mt-2 text-2xl font-light text-white">{value}</dd>
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
      className="rounded-2xl border border-white/[0.06] p-4"
    >
      <h2 className="text-sm font-medium text-white">{title}</h2>
      <p className="mt-2 text-sm text-neutral-400">
        {activity.type} · {activity.userName} · {formatDate(activity.timestamp)}
      </p>
    </section>
  )
}

function item(label: string, value: number | null): SummaryItem | null {
  return value === null ? null : { label, value: numberFormatter.format(value) }
}

function hryvniaItem(label: string, value: number | null): SummaryItem | null {
  return value === null
    ? null
    : { label, value: currencyFormatter.format(value) }
}

function revenueItem(data: DashboardData): SummaryItem | null {
  const amount = data.revenue?.today.find(
    (entry) => entry.currency === 'UAH',
  )?.amount
  return amount === undefined ? null : hryvniaItem('Виручка сьогодні', amount)
}

function compact(items: readonly (SummaryItem | null)[]): SummaryItem[] {
  return items.filter((item): item is SummaryItem => item !== null)
}

function formatDate(timestamp: string): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.valueOf()) ? '—' : dateFormatter.format(date)
}
