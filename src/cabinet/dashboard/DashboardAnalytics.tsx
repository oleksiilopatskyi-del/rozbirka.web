import type {
  DashboardAnalytics as DashboardAnalyticsData,
  DashboardPeriod,
} from '@/api/dashboard-contract'
import type { DashboardLoadable } from './use-dashboard-data'
import { DashboardErrorState } from './DashboardErrorState'

const periodLabels: Readonly<Record<DashboardPeriod, string>> = {
  day: 'День',
  week: 'Тиждень',
  month: 'Місяць',
}

const numberFormatter = new Intl.NumberFormat('uk-UA', {
  maximumFractionDigits: 1,
})

interface DashboardAnalyticsProps {
  loadable: DashboardLoadable<DashboardAnalyticsData>
  period: DashboardPeriod
  onPeriodChange: (period: DashboardPeriod) => void
  retry: () => Promise<void>
  billingPath?: string | null
}

export function DashboardAnalytics({
  loadable,
  period,
  onPeriodChange,
  retry,
  billingPath = null,
}: DashboardAnalyticsProps) {
  return (
    <section aria-label="Аналітика" className="grid gap-5">
      <div
        aria-label="Період аналітики"
        className="flex flex-wrap gap-2"
        role="group"
      >
        {(Object.keys(periodLabels) as DashboardPeriod[]).map((value) => (
          <button
            aria-pressed={period === value}
            className="min-h-11 rounded-full border border-white/[0.12] px-3 text-sm text-white"
            key={value}
            onClick={() => onPeriodChange(value)}
            type="button"
          >
            {periodLabels[value]}
          </button>
        ))}
      </div>
      {loadable.status === 'ready' ? (
        <AnalyticsContent data={loadable.data} />
      ) : null}
      {loadable.status === 'loading' ? <AnalyticsLoading /> : null}
      {loadable.status === 'error' ? (
        <DashboardErrorState
          ariaLabel="Аналітика"
          billingPath={billingPath}
          genericMessage="Не вдалося завантажити аналітику."
          problem={loadable.error}
          retry={retry}
        />
      ) : null}
    </section>
  )
}

function AnalyticsContent({ data }: { data: DashboardAnalyticsData }) {
  return (
    <div className="grid gap-5">
      <section className="rounded-2xl border border-white/[0.06] p-4">
        <h2 className="text-base font-medium text-white">Виручка</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {Object.entries(data.revenue.totals).map(([currency, total]) => (
            <div key={currency}>
              <dt className="text-sm text-neutral-400">{currency}</dt>
              <dd className="mt-1 text-2xl font-light text-white">
                {numberFormatter.format(total)}
              </dd>
            </div>
          ))}
        </dl>
        <Trend
          label="Зміна виручки"
          value={data.revenue.trendPercent}
          suffix="%"
        />
        <MiniChart series={data.revenue.series} />
      </section>
      <div className="grid gap-5 sm:grid-cols-2">
        <CounterCard
          delta={data.partsSold.delta}
          label="Продано запчастин"
          series={data.partsSold.series}
          total={data.partsSold.total}
        />
        <CounterCard
          delta={data.activeOrders.delta}
          label="Активних замовлень"
          series={data.activeOrders.series}
          total={data.activeOrders.total}
        />
      </div>
      {data.topPart === null ? null : <TopPart data={data.topPart} />}
    </div>
  )
}

function CounterCard({
  delta,
  label,
  series,
  total,
}: {
  delta: number
  label: string
  series: number[]
  total: number
}) {
  return (
    <section className="rounded-2xl border border-white/[0.06] p-4">
      <h2 className="text-base font-medium text-white">{label}</h2>
      <p className="mt-3 text-2xl font-light text-white">
        {numberFormatter.format(total)}
      </p>
      <Trend label="Зміна" value={delta} />
      <MiniChart series={series} />
    </section>
  )
}

function TopPart({
  data,
}: {
  data: NonNullable<DashboardAnalyticsData['topPart']>
}) {
  return (
    <section className="rounded-2xl border border-white/[0.06] p-4">
      <h2 className="text-base font-medium text-white">Найкраща запчастина</h2>
      <p className="mt-2 text-lg text-white">{data.name}</p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-neutral-400">Продажів</dt>
          <dd className="mt-1 text-xl font-light text-white">
            {numberFormatter.format(data.salesCount)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-neutral-400">Виручка USD</dt>
          <dd className="mt-1 text-xl font-light text-white">
            {numberFormatter.format(data.revenueUsd)}
          </dd>
        </div>
      </dl>
      <MiniChart series={data.salesSeries} />
    </section>
  )
}

function Trend({
  label,
  value,
  suffix = '',
}: {
  label: string
  value: number
  suffix?: string
}) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return (
    <p className="mt-2 text-sm text-neutral-400">
      {label}:{' '}
      <span className="text-white">{`${sign}${numberFormatter.format(Math.abs(value))}${suffix}`}</span>
    </p>
  )
}

function MiniChart({ series }: { series: number[] }) {
  const maximum = Math.max(0, ...series.map((value) => Math.abs(value)))
  return (
    <div
      aria-hidden="true"
      aria-label="Декоративна діаграма"
      className="mt-4 flex h-20 items-end gap-1"
    >
      {series.map((value, index) => (
        <span
          className="min-w-1 flex-1 rounded-t bg-brand/70"
          data-testid="analytics-bar"
          key={`${index}-${value}`}
          style={{
            height: `${maximum === 0 ? 0 : (Math.abs(value) / maximum) * 100}%`,
          }}
        />
      ))}
    </div>
  )
}

function AnalyticsLoading() {
  return (
    <section
      aria-label="Аналітика"
      className="rounded-2xl border border-white/[0.06] p-4"
      role="status"
    >
      <p className="text-sm text-neutral-400">Завантажуємо аналітику…</p>
      <span
        aria-hidden="true"
        className="mt-3 block h-20 animate-pulse rounded bg-white/[0.08]"
      />
    </section>
  )
}
