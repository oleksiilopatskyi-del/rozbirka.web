import type { KeyboardEvent } from 'react'
import {
  Amount,
  Fact,
  FactList,
  Panel,
  Quantity,
  SectionPanel,
  Skeleton,
} from '@/components/app'
import { cn } from '@/lib/utils'
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

const figureClass =
  'text-[25px] leading-tight font-light tracking-[-0.02em] text-white'

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
    <section aria-label="Аналітика" className="grid min-w-0 gap-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">Аналітика</h2>
          <p className="text-app-dim text-[12.5px]">
            Продажі та замовлення за обраний період.
          </p>
        </div>
        <PeriodSwitch onPeriodChange={onPeriodChange} period={period} />
      </div>
      {loadable.status === 'ready' ? (
        <AnalyticsContent data={loadable.data} />
      ) : null}
      {loadable.status === 'loading' ? <AnalyticsLoading /> : null}
      {loadable.status === 'error' ? (
        <DashboardErrorState
          ariaLabel="Аналітика"
          billingPath={billingPath}
          genericMessage="Не вдалося завантажити аналітику. Перевірте з’єднання та спробуйте ще раз."
          problem={loadable.error}
          retry={retry}
        />
      ) : null}
    </section>
  )
}

/**
 * An exclusive choice of period. Kept as toggle buttons rather than the kit
 * `Segmented` radios because the shell and browser suites pin `aria-pressed`
 * and Tab reachability of every option; arrow keys move focus here so the
 * group still behaves like one control.
 */
function PeriodSwitch({
  period,
  onPeriodChange,
}: {
  period: DashboardPeriod
  onPeriodChange: (period: DashboardPeriod) => void
}) {
  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
    if (step === 0) return

    const options = [...event.currentTarget.querySelectorAll('button')]
    const current = options.indexOf(document.activeElement as HTMLButtonElement)
    if (current === -1) return

    event.preventDefault()
    options[(current + step + options.length) % options.length]?.focus()
  }

  return (
    <div
      aria-label="Період аналітики"
      className="bg-app-input border-app-line-2 rounded-control flex min-w-0 flex-wrap gap-1 border p-1"
      onKeyDown={moveFocus}
      role="group"
    >
      {(Object.keys(periodLabels) as DashboardPeriod[]).map((value) => (
        <button
          aria-pressed={period === value}
          className={cn(
            'rounded-control flex min-h-11 flex-1 items-center justify-center px-3 text-[12.5px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/40',
            period === value
              ? 'bg-white/[0.09] font-medium text-white'
              : 'text-app-muted hover:bg-white/[0.04]',
          )}
          key={value}
          onClick={() => onPeriodChange(value)}
          type="button"
        >
          {periodLabels[value]}
        </button>
      ))}
    </div>
  )
}

function AnalyticsContent({ data }: { data: DashboardAnalyticsData }) {
  const totals = Object.entries(data.revenue.totals)

  return (
    <div className="grid min-w-0 gap-4">
      <SectionPanel
        description="Скільки отримано з продажів за обраний період."
        title="Виручка"
      >
        {totals.length === 0 ? (
          <p className="text-app-muted text-sm">
            За обраний період продажів не було.
          </p>
        ) : (
          <FactList columns={2}>
            {totals.map(([currency, total]) => (
              <Fact key={currency} label={`Виручка, ${currency}`}>
                <Amount className={figureClass} currency={null} value={total} />
              </Fact>
            ))}
          </FactList>
        )}
        <Delta suffix="%" value={data.revenue.trendPercent} />
        <MiniChart series={data.revenue.series} />
      </SectionPanel>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <CounterPanel
          delta={data.partsSold.delta}
          description="Скільки запчастин продано за обраний період."
          series={data.partsSold.series}
          title="Продано запчастин"
          total={data.partsSold.total}
        />
        <CounterPanel
          delta={data.activeOrders.delta}
          description="Скільки замовлень зараз у роботі."
          series={data.activeOrders.series}
          title="Активні замовлення"
          total={data.activeOrders.total}
        />
      </div>
      {data.topPart === null ? null : <TopPart data={data.topPart} />}
    </div>
  )
}

function CounterPanel({
  delta,
  description,
  series,
  title,
  total,
}: {
  delta: number
  description: string
  series: number[]
  title: string
  total: number
}) {
  return (
    <SectionPanel description={description} title={title}>
      <p className={figureClass}>
        <Amount currency={null} value={total} />
      </p>
      <Delta value={delta} />
      <MiniChart series={series} />
    </SectionPanel>
  )
}

function TopPart({
  data,
}: {
  data: NonNullable<DashboardAnalyticsData['topPart']>
}) {
  return (
    <SectionPanel
      description="Запчастина з найбільшою виручкою за обраний період."
      title="Найкраща запчастина"
    >
      <p className="text-base break-words text-white">{data.name}</p>
      <FactList columns={2}>
        <Fact label="Продано за період">
          <Quantity unit="шт." value={data.salesCount} />
        </Fact>
        <Fact label="Виручка за період">
          <Amount currency="USD" value={data.revenueUsd} />
        </Fact>
      </FactList>
      <MiniChart series={data.salesSeries} />
    </SectionPanel>
  )
}

/**
 * A change against the previous period. Direction is carried by the sign and
 * by the sentence, so the colour is confirmation and never the only cue.
 */
function Delta({ value, suffix = '' }: { value: number; suffix?: string }) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  const figure = `${sign}${numberFormatter.format(Math.abs(value))}${suffix}`
  const wording =
    value > 0
      ? 'більше, ніж у попередній період'
      : value < 0
        ? 'менше, ніж у попередній період'
        : '— без змін проти попереднього періоду'

  return (
    <p className="text-app-dim text-[12.5px]">
      <span
        className={cn(
          'font-medium tabular-nums',
          value > 0 && 'text-state-ok',
          value < 0 && 'text-state-danger',
          value === 0 && 'text-app-muted',
        )}
      >
        {figure}
      </span>{' '}
      {wording}
    </p>
  )
}

function MiniChart({ series }: { series: number[] }) {
  const maximum = Math.max(0, ...series.map((value) => Math.abs(value)))
  return (
    <div
      aria-hidden="true"
      aria-label="Декоративна діаграма"
      className="mt-1 flex h-20 min-w-0 items-end gap-1"
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
    <Panel aria-label="Аналітика" role="status">
      <p className="text-app-muted text-sm">Завантажуємо аналітику…</p>
      <Skeleton className="mt-3 h-6 w-32" />
      <Skeleton className="mt-2 h-20" />
    </Panel>
  )
}
