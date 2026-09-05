import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { RefreshCw } from 'lucide-react'
import { Button, PageBody, PageHeader, Panel, Skeleton } from '@/components/app'
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
    <PageBody className="gap-6">
      <PageHeader
        actions={
          <Button
            disabled={dashboard.refreshing}
            onClick={() => void dashboard.refresh()}
          >
            <RefreshCw aria-hidden />
            {dashboard.refreshing ? 'Оновлюємо…' : 'Оновити дані'}
          </Button>
        }
        eyebrow="Огляд"
        title={`Вітаємо в ${tenantName}`}
      />
      <div
        aria-busy={dashboard.refreshing}
        aria-label="Панель зведення"
        className="min-w-0"
        role="region"
      >
        <div className="grid gap-4">
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
      </div>
    </PageBody>
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
    <Panel aria-label="Зведення">
      <div aria-label="Завантаження зведення" role="status">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-3 h-16" />
      </div>
    </Panel>
  )
}
