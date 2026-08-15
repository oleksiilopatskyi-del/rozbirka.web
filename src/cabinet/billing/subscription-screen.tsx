import { useState } from 'react'
import { useNavigate } from 'react-router'
import { billingApi } from '@/api/billing'
import type { BillingState, LimitUsageDto, SubscriptionDto } from '@/api/types'
import type { TenantAccessSnapshot } from '../access-types'
import { cn } from '@/lib/utils'
import { cabinetPath } from '../cabinet-paths'
import {
  BillingHeader,
  BillingMutationGate,
  EmptyBillingPanel,
  formatBillingAmount,
  formatBillingDate,
  useBillingMutation,
} from './billing-layout'

export function SubscriptionScreen() {
  const navigate = useNavigate()
  const { cabinet, controlDecision, requireLatestMutation } =
    useBillingMutation('billing')
  const snapshotSubscription = cabinet.snapshot?.subscription ?? null
  const [subscription, setSubscription] = useState(snapshotSubscription)
  const [busy, setBusy] = useState(false)

  if (!subscription || !cabinet.targetTenant) return <EmptyBillingPanel />

  const goToPlans = () =>
    void navigate(cabinetPath(cabinet.targetTenant!.slug, 'plans'))

  const subscribe = async () => {
    setBusy(true)
    try {
      const scope = requireLatestMutation()
      const { checkoutUrl } = await billingApi.subscribe(undefined, {
        signal: scope.signal,
      })
      if (!scope.signal.aborted) window.location.assign(checkoutUrl)
    } catch {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (!confirm('Скасувати підписку?')) return
    setBusy(true)
    try {
      const scope = requireLatestMutation()
      await billingApi.cancel(undefined, { signal: scope.signal })
      if (scope.signal.aborted) return
      const refreshed = await billingApi.getSubscription({
        signal: scope.signal,
      })
      if (
        !scope.signal.aborted &&
        cabinet.snapshot?.tenantId === scope.tenantId &&
        cabinet.snapshot.generation === scope.generation
      ) {
        setSubscription(refreshed)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <SubscriptionPanel
      subscription={subscription}
      busy={busy}
      manageDecision={controlDecision}
      onSubscribe={() => void subscribe()}
      onCancel={() => void cancel()}
      onSeePlans={goToPlans}
    />
  )
}

function SubscriptionPanel({
  subscription,
  busy,
  manageDecision,
  onSubscribe,
  onCancel,
  onSeePlans,
}: {
  subscription: NonNullable<TenantAccessSnapshot['subscription']>
  busy: boolean
  manageDecision: ReturnType<typeof useBillingMutation>['controlDecision']
  onSubscribe: () => void
  onCancel: () => void
  onSeePlans: () => void
}) {
  const accessEnded = subscription.state === 'blocked'
  const stateMeta: Record<BillingState, { label: string }> = {
    none: { label: 'Початок' },
    trial: { label: 'Пробний період' },
    active: { label: 'Активна' },
    pastDue: { label: 'Прострочена' },
    cancelled: { label: 'Скасована' },
    blocked: { label: 'Доступ закрито' },
  }
  const planLabel = accessEnded
    ? 'Доступ закрито'
    : subscription.state === 'trial'
      ? (subscription.planName ?? 'Пробний доступ')
      : (subscription.planName ?? 'Без тарифу')
  const primaryLabel =
    subscription.state === 'trial'
      ? 'Залишилось днів пробного періоду'
      : subscription.state === 'active' || subscription.state === 'pastDue'
        ? 'Наступне списання'
        : subscription.state === 'cancelled'
          ? 'Доступ діє до'
          : 'Поточний період'
  const primaryValue =
    subscription.state === 'trial'
      ? `${subscription.trialDaysRemaining ?? 0} ${dayWord(subscription.trialDaysRemaining ?? 0)}`
      : subscription.nextChargeAt
        ? formatBillingDate(subscription.nextChargeAt)
        : subscription.currentPeriodEnd
          ? formatBillingDate(subscription.currentPeriodEnd)
          : '—'

  return (
    <div className="flex flex-col gap-8">
      <BillingHeader
        title="Підписка"
        subtitle="Керуй своїм планом та статусом доступу"
      />
      <div className="bg-brand text-brand-foreground rounded-(--radius-card) flex flex-col gap-8 p-8 lg:p-10">
        <div className="flex flex-col gap-3">
          <span className="inline-flex w-fit items-center rounded-full bg-black/15 px-3 py-1.5 text-[11px] font-medium tracking-[0.05em] uppercase">
            {stateMeta[subscription.state].label}
          </span>
          <p className="text-[48px] leading-[1] font-light tracking-[-0.03em] lg:text-[64px]">
            {planLabel}
          </p>
          {subscription.state === 'trial' ? (
            <p className="text-[15px] opacity-75">14 днів безкоштовно</p>
          ) : (
            !accessEnded &&
            typeof subscription.amount === 'number' && (
              <p className="text-[15px] opacity-75">
                {formatBillingAmount(
                  subscription.amount,
                  subscription.currency ?? 'USD',
                )}{' '}
                / місяць
              </p>
            )
          )}
        </div>

        {accessEnded ? (
          <div className="rounded-2xl bg-black/15 px-5 py-4">
            <p className="text-[14px] leading-[1.5]">
              Пробний період завершився. Щоб продовжити користуватись — оформіть
              підписку: оберіть тариф нижче.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="text-[14px] opacity-70">{primaryLabel}</p>
            <p className="text-[32px] font-light tabular-nums">
              {primaryValue}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {subscription.canReactivate && subscription.state !== 'blocked' && (
            <BillingMutationGate decision={manageDecision}>
              <button
                type="button"
                onClick={onSubscribe}
                disabled={busy}
                className="inline-flex h-14 w-fit items-center gap-3 rounded-full bg-black px-7 text-[15px] text-white transition-colors hover:bg-black/80 disabled:opacity-50"
              >
                Поновити підписку
              </button>
            </BillingMutationGate>
          )}
          {subscription.canCancel && (
            <BillingMutationGate decision={manageDecision}>
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="inline-flex h-14 w-fit items-center gap-3 rounded-full px-7 text-[15px] text-black ring-1 ring-black/30 transition-colors hover:bg-black/10 disabled:opacity-50"
              >
                Скасувати
              </button>
            </BillingMutationGate>
          )}
          <button
            type="button"
            onClick={onSeePlans}
            className={cn(
              'inline-flex h-14 w-fit items-center gap-3 rounded-full px-7 text-[15px] transition-colors',
              subscription.canReactivate && subscription.state !== 'blocked'
                ? 'text-black/80 hover:text-black'
                : 'bg-black text-white hover:bg-black/80',
            )}
          >
            {accessEnded ? 'Оформити підписку' : 'Дивитись тарифи'}
          </button>
        </div>
      </div>
      <UsageBlock usage={subscription.usage} onUpgrade={onSeePlans} />
    </div>
  )
}

function UsageBlock({
  usage,
  onUpgrade,
}: {
  usage: SubscriptionDto['usage']
  onUpgrade: () => void
}) {
  const items: { label: string; data: LimitUsageDto }[] = [
    { label: 'Авто', data: usage.cars },
    { label: 'Партії', data: usage.intakes },
    { label: 'Запчастини', data: usage.parts },
    { label: 'Команда', data: usage.users },
    { label: 'Каси', data: usage.cashRegisters },
  ]
  const overItems = items.filter(
    (item) => item.data.max !== null && item.data.used > item.data.max,
  )

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[18px] font-medium">Використання</h2>
      {overItems.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] leading-[1.5] text-amber-200/90">
            Перевищено ліміт тарифу:{' '}
            {overItems
              .map(
                (item) =>
                  `${item.label} ${item.data.used}/${item.data.max ?? '∞'}`,
              )
              .join(', ')}
            . Наявні дані лишаються доступними, але додавати нові не вийде, поки
            не повернетесь у межі.
          </p>
          <button
            type="button"
            onClick={onUpgrade}
            className="bg-brand hover:bg-brand-hover text-brand-foreground inline-flex h-10 shrink-0 items-center justify-center rounded-full px-5 text-[13px] transition-colors"
          >
            Підвищити тариф
          </button>
        </div>
      )}
      <ul role="list" className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((item) => {
          const over = item.data.max !== null && item.data.used > item.data.max
          const ratio =
            item.data.max === null
              ? 1
              : item.data.max === 0
                ? 0
                : Math.min(item.data.used / item.data.max, 1)
          return (
            <li
              key={item.label}
              className="bg-surface-1 flex flex-col gap-3 rounded-2xl p-5 ring-1 ring-white/[0.04]"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-neutral-400">
                  {item.label}
                </span>
                <span
                  className={cn(
                    'text-[13px] tabular-nums',
                    over ? 'text-amber-300' : 'text-neutral-300',
                  )}
                >
                  {item.data.used}
                  <span
                    className={over ? 'text-amber-300/60' : 'text-neutral-600'}
                  >
                    {' '}
                    / {item.data.max ?? '∞'}
                  </span>
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={cn(
                    'h-full transition-all duration-500',
                    item.data.max === null
                      ? 'bg-brand/40'
                      : ratio >= 1
                        ? 'bg-red-500'
                        : ratio >= 0.8
                          ? 'bg-amber-400'
                          : 'bg-brand',
                  )}
                  style={{ width: `${ratio * 100}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function dayWord(value: number): string {
  const last = value % 10
  const lastTwo = value % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'днів'
  if (last === 1) return 'день'
  if (last >= 2 && last <= 4) return 'дні'
  return 'днів'
}
