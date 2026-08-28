import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { useCabinet } from '../CabinetContext'
import { readDashboardPeriod, writeDashboardPeriod } from './dashboard-period'
import { useDashboardData, type DashboardLoadable } from './use-dashboard-data'
import type { DashboardData, DashboardPeriod } from '@/api/dashboard-contract'
import { DashboardAnalytics } from './DashboardAnalytics'
import { DashboardBillingBanner } from './DashboardBillingBanner'
import { DashboardDestinations } from './DashboardDestinations'
import { DashboardErrorState } from './DashboardErrorState'
import { DashboardSummary } from './DashboardSummary'
import { getDashboardBillingPath } from './dashboard-billing-access'

export function DashboardScreen() {
  const { targetTenant, snapshot } = useCabinet()
  const [searchParams, setSearchParams] = useSearchParams()
  const selection = readDashboardPeriod(searchParams)
  const dashboard = useDashboardData(selection.period)
  const tenantName = targetTenant?.name ?? 'вашій розбірці'
  const billingPath =
    snapshot !== null && targetTenant !== null
      ? getDashboardBillingPath(snapshot, targetTenant)
      : null

  useEffect(() => {
    if (!selection.normalize) return
    setSearchParams(writeDashboardPeriod(searchParams, selection.period), {
      replace: true,
    })
  }, [searchParams, selection, setSearchParams])

  const selectPeriod = (period: DashboardPeriod) => {
    setSearchParams(writeDashboardPeriod(searchParams, period), {
      replace: false,
    })
  }

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-8">
      <header className="grid gap-2">
        <p className="text-brand text-xs font-medium tracking-[0.18em] uppercase">
          Кабінет
        </p>
        <h1 className="text-3xl font-light tracking-tight text-white sm:text-4xl">
          Вітаємо в {tenantName}
        </h1>
        <p className="text-sm text-neutral-400">Ваш робочий простір готовий.</p>
      </header>
      <div
        aria-busy={dashboard.refreshing}
        aria-label="Панель зведення"
        className="bg-surface-1 min-w-0 rounded-3xl border border-white/[0.06] p-5 sm:p-6"
        role="region"
      >
        <div className="mt-5 grid gap-5">
          {snapshot !== null && targetTenant !== null ? (
            <DashboardBillingBanner snapshot={snapshot} tenant={targetTenant} />
          ) : null}
          <DashboardSummaryState
            billingPath={billingPath}
            loadable={dashboard.summary}
            retry={() => dashboard.retrySummary()}
          />
          <DashboardAnalytics
            billingPath={billingPath}
            loadable={dashboard.analytics}
            onPeriodChange={selectPeriod}
            period={selection.period}
            retry={() => dashboard.retryAnalytics()}
          />
          {snapshot !== null && targetTenant !== null ? (
            <DashboardDestinations snapshot={snapshot} tenant={targetTenant} />
          ) : null}
        </div>
        <button
          className="mt-4 min-h-11 rounded-full border border-white/[0.12] px-4 text-sm text-white disabled:opacity-60"
          disabled={dashboard.refreshing}
          onClick={() => void dashboard.refresh()}
          type="button"
        >
          {dashboard.refreshing ? 'Оновлюємо…' : 'Оновити дані'}
        </button>
      </div>
    </section>
  )
}

function DashboardSummaryState({
  billingPath,
  loadable,
  retry,
}: {
  billingPath: string | null
  loadable: DashboardLoadable<DashboardData>
  retry: () => Promise<void>
}) {
  if (loadable.status === 'ready') {
    return <DashboardSummary data={loadable.data} />
  }

  if (loadable.status === 'error') {
    return (
      <DashboardErrorState
        ariaLabel="Зведення"
        billingPath={billingPath}
        genericMessage="Не вдалося завантажити зведення."
        problem={loadable.error}
        retry={retry}
      />
    )
  }

  return (
    <section
      aria-label="Зведення"
      className="rounded-2xl border border-white/[0.06] p-4"
    >
      <div aria-label="Завантаження зведення" role="status">
        <span
          aria-hidden
          className="block h-5 w-32 animate-pulse rounded bg-white/[0.08]"
        />
        <span
          aria-hidden
          className="mt-3 block h-16 animate-pulse rounded bg-white/[0.08]"
        />
      </div>
    </section>
  )
}
