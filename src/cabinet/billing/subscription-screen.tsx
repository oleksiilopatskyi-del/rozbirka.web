import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ExternalLink } from 'lucide-react'
import {
  Amount,
  Button,
  ConfirmDialog,
  DateValue,
  Fact,
  FactList,
  Notice,
  PageBody,
  PageHeader,
  PanelFooter,
  Quantity,
  SectionPanel,
  StatusPill,
  useOperation,
  useToast,
  type StatusTone,
} from '@/components/app'
import {
  billingApi,
  resolveProviderManagement,
  type ProviderAwareSubscriptionDto,
} from '@/api/billing'
import { normalizeApiProblem } from '@/api/errors'
import type { BillingState, LimitUsageDto, SubscriptionDto } from '@/api/types'
import type {
  TenantAccessSnapshot,
  TenantSubscriptionSnapshot,
} from '../access-types'
import { cn } from '@/lib/utils'
import { cabinetPath } from '../cabinet-paths'
import { ModuleAccessDeniedError } from '../policy'
import {
  BILLING_EYEBROW,
  BILLING_MANAGEMENT_UNAVAILABLE,
  BillingManagementUnavailableError,
  BillingMutationGate,
  BillingUnavailableNotice,
  EmptyBillingPanel,
  useBillingMutation,
} from './billing-layout'

type SubscriptionMutation = 'checkout' | 'cancel'

/** A result that arrived for a tenant we have already left changes nothing. */
type MutationOutcome = 'applied' | 'stale'

export function SubscriptionScreen() {
  const navigate = useNavigate()
  const toast = useToast()
  const { cabinet, controlDecision, requireLatestMutation } =
    useBillingMutation('billing')
  const snapshotSubscription = cabinet.snapshot?.subscription ?? null
  const generation = cabinet.snapshot?.generation
  const latestSnapshotRef = useRef(cabinet.snapshot)
  const cancelStageRef = useRef<'cancel' | 'refresh'>('cancel')
  const [refreshedSubscription, setRefreshedSubscription] = useState<{
    generation: number
    value: SubscriptionDto
  } | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const subscription =
    refreshedSubscription !== null &&
    refreshedSubscription.generation === generation
      ? refreshedSubscription.value
      : snapshotSubscription

  useEffect(() => {
    latestSnapshotRef.current = cabinet.snapshot
  }, [cabinet.snapshot])

  const checkout = useOperation<MutationOutcome>(
    async () => {
      const scope = requireLatestMutation()
      if (!hasMonoManagement(latestSnapshotRef.current?.subscription)) {
        throw new BillingManagementUnavailableError()
      }
      let checkoutUrl: string
      try {
        ;({ checkoutUrl } = await billingApi.subscribe(undefined, {
          signal: scope.signal,
        }))
      } catch (error) {
        if (!isCurrentScope(scope, latestSnapshotRef.current)) return 'stale'
        throw error
      }
      if (!isCurrentScope(scope, latestSnapshotRef.current)) return 'stale'
      window.location.assign(checkoutUrl)
      return 'applied'
    },
    // No success toast: a checkout leaves the app for the Mono pay page.
    { errorMessage: (error) => subscriptionFailureMessage('checkout', error) },
  )

  const cancelSubscription = useOperation<MutationOutcome>(
    async () => {
      cancelStageRef.current = 'cancel'
      const scope = requireLatestMutation()
      if (!hasMonoManagement(latestSnapshotRef.current?.subscription)) {
        throw new BillingManagementUnavailableError()
      }
      try {
        await billingApi.cancel(undefined, { signal: scope.signal })
      } catch (error) {
        if (!isCurrentScope(scope, latestSnapshotRef.current)) return 'stale'
        throw error
      }
      if (!isCurrentScope(scope, latestSnapshotRef.current)) return 'stale'
      cancelStageRef.current = 'refresh'
      let refreshed: SubscriptionDto
      try {
        refreshed = await billingApi.getSubscription({ signal: scope.signal })
      } catch (error) {
        if (!isCurrentScope(scope, latestSnapshotRef.current)) return 'stale'
        throw error
      }
      if (!isCurrentScope(scope, latestSnapshotRef.current)) return 'stale'
      setRefreshedSubscription({
        generation: scope.generation,
        value: refreshed,
      })
      return 'applied'
    },
    {
      errorMessage: (error) =>
        cancelStageRef.current === 'refresh'
          ? 'Підписку скасовано, але не вдалося оновити її стан. Оновіть сторінку, щоб побачити актуальний статус.'
          : subscriptionFailureMessage('cancel', error),
      onSuccess: (outcome) => {
        setConfirmingCancel(false)
        if (outcome === 'applied') {
          toast.show({
            message:
              'Підписку скасовано. Доступ діє до кінця сплаченого періоду.',
            tone: 'ok',
          })
        }
      },
    },
  )

  const resetCheckout = checkout.reset
  const resetCancel = cancelSubscription.reset
  useEffect(() => {
    // A failure describes one snapshot of access. When that snapshot is
    // replaced, so is the message.
    resetCheckout()
    resetCancel()
  }, [generation, resetCancel, resetCheckout])

  if (!subscription || !cabinet.targetTenant) return <EmptyBillingPanel />

  const goToPlans = () =>
    void navigate(cabinetPath(cabinet.targetTenant!.slug, 'plans'))

  return (
    <SubscriptionPanel
      busy={checkout.pending || cancelSubscription.pending}
      cancelError={cancelSubscription.error}
      cancelPending={cancelSubscription.pending}
      confirmingCancel={confirmingCancel}
      manageDecision={controlDecision}
      mutationError={
        confirmingCancel
          ? checkout.error
          : (checkout.error ?? cancelSubscription.error)
      }
      onCancelDismiss={() => setConfirmingCancel(false)}
      onCancelConfirm={cancelSubscription.run}
      onCancelRequest={() => setConfirmingCancel(true)}
      onSeePlans={goToPlans}
      onSubscribe={checkout.run}
      subscription={subscription}
    />
  )
}

function SubscriptionPanel({
  subscription,
  busy,
  cancelError,
  cancelPending,
  confirmingCancel,
  mutationError,
  manageDecision,
  onCancelConfirm,
  onCancelDismiss,
  onCancelRequest,
  onSeePlans,
  onSubscribe,
}: {
  subscription: NonNullable<TenantAccessSnapshot['subscription']>
  busy: boolean
  cancelError: string | null
  cancelPending: boolean
  confirmingCancel: boolean
  mutationError: string | null
  manageDecision: ReturnType<typeof useBillingMutation>['controlDecision']
  onCancelConfirm: () => void
  onCancelDismiss: () => void
  onCancelRequest: () => void
  onSeePlans: () => void
  onSubscribe: () => void
}) {
  const accessEnded = subscription.state === 'blocked'
  const providerSubscription = subscription as ProviderAwareSubscriptionDto
  const management = resolveProviderManagement(providerSubscription)
  const state = stateMeta[subscription.state]
  const planLabel = accessEnded
    ? 'Доступ закрито'
    : subscription.state === 'trial'
      ? (subscription.planName ?? 'Пробний доступ')
      : (subscription.planName ?? 'Без тарифу')
  const canReactivate =
    subscription.canReactivate && subscription.state !== 'blocked'
  // An empty action bar is a line across the panel that promises nothing.
  const hasActions =
    management.kind === 'provider' || management.kind === 'mono'

  return (
    <PageBody width="narrow">
      <PageHeader eyebrow={BILLING_EYEBROW} title="Підписка" />
      {mutationError === null ? null : (
        <Notice tone="danger">{mutationError}</Notice>
      )}
      <SectionPanel
        aside={<StatusPill tone={state.tone}>{state.label}</StatusPill>}
        description="Стан доступу, дата наступного списання і картка, з якої він оплачується."
        footer={
          hasActions ? (
            <PanelFooter>
              {management.kind === 'provider' && (
                <Button asChild variant="primary">
                  <a
                    href={management.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Керувати в {management.label}
                    <ExternalLink aria-hidden />
                  </a>
                </Button>
              )}
              {management.kind === 'mono' && subscription.canCancel && (
                <BillingMutationGate decision={manageDecision}>
                  <Button
                    disabled={busy}
                    onClick={onCancelRequest}
                    variant="danger"
                  >
                    Скасувати підписку
                  </Button>
                </BillingMutationGate>
              )}
              {management.kind === 'mono' && (
                <Button
                  onClick={onSeePlans}
                  variant={accessEnded || !canReactivate ? 'primary' : 'ghost'}
                >
                  {accessEnded ? 'Оформити підписку' : 'Дивитись тарифи'}
                </Button>
              )}
              {management.kind === 'mono' && canReactivate && (
                <BillingMutationGate decision={manageDecision}>
                  <Button
                    aria-busy={busy}
                    disabled={busy}
                    onClick={onSubscribe}
                    variant="primary"
                  >
                    Поновити підписку
                  </Button>
                </BillingMutationGate>
              )}
            </PanelFooter>
          ) : undefined
        }
        title="Поточний тариф"
      >
        <FactList columns={2}>
          <Fact label="Тариф">{planLabel}</Fact>
          <Fact label={periodLabel(subscription)}>
            {periodValue(subscription)}
          </Fact>
          <Fact label="Вартість">{priceValue(subscription, accessEnded)}</Fact>
          <Fact label="Картка">{cardValue(subscription)}</Fact>
        </FactList>
        {accessEnded && (
          <Notice tone="warn">
            Пробний період завершився, доступ закрито. Оформіть підписку — дані
            розбірки лишаються на місці й повернуться разом із доступом.
          </Notice>
        )}
        {management.kind === 'unavailable' && <BillingUnavailableNotice />}
      </SectionPanel>
      <UsageSection onUpgrade={onSeePlans} usage={subscription.usage} />
      <ConfirmDialog
        cancelLabel="Залишити підписку"
        confirmLabel="Так, скасувати підписку"
        consequence="Списань більше не буде, доступ до кабінету діятиме до кінця сплаченого періоду, а далі закриється. Оформити підписку знову можна будь-коли."
        error={cancelError}
        onConfirm={onCancelConfirm}
        onOpenChange={(open) => {
          if (!open) onCancelDismiss()
        }}
        open={confirmingCancel}
        pending={cancelPending}
        title="Скасувати підписку?"
      />
    </PageBody>
  )
}

const stateMeta: Record<BillingState, { label: string; tone: StatusTone }> = {
  none: { label: 'Початок', tone: 'neutral' },
  trial: { label: 'Пробний період', tone: 'info' },
  active: { label: 'Активна', tone: 'ok' },
  pastDue: { label: 'Прострочена', tone: 'warn' },
  cancelled: { label: 'Скасована', tone: 'neutral' },
  blocked: { label: 'Доступ закрито', tone: 'danger' },
}

function periodLabel(subscription: TenantSubscriptionSnapshot): string {
  switch (subscription.state) {
    case 'trial':
      return 'Залишилось пробного періоду'
    case 'active':
    case 'pastDue':
      return 'Наступне списання'
    case 'cancelled':
      return 'Доступ діє до'
    default:
      return 'Поточний період'
  }
}

function periodValue(subscription: TenantSubscriptionSnapshot) {
  if (subscription.state === 'trial') {
    const days = subscription.trialDaysRemaining ?? 0
    return <Quantity unit={dayWord(days)} value={days} />
  }
  const date = subscription.nextChargeAt ?? subscription.currentPeriodEnd
  return <DateValue value={date} withTime={false} />
}

function priceValue(
  subscription: TenantSubscriptionSnapshot,
  accessEnded: boolean,
) {
  if (subscription.state === 'trial') return '14 днів безкоштовно'
  if (accessEnded || typeof subscription.amount !== 'number') return '—'
  return (
    <>
      <Amount currency={subscription.currency} value={subscription.amount} /> /
      місяць
    </>
  )
}

function cardValue(subscription: TenantSubscriptionSnapshot) {
  if (!subscription.cardLast4) return 'Ще не привʼязана'
  return (
    <span className="tabular-nums">
      {(subscription.cardBrand ?? 'Card').toUpperCase()} ••••{' '}
      {subscription.cardLast4}
    </span>
  )
}

function hasMonoManagement(subscription: unknown) {
  return (
    subscription !== null &&
    subscription !== undefined &&
    resolveProviderManagement(
      subscription as Pick<
        ProviderAwareSubscriptionDto,
        'source' | 'manageVia'
      >,
    ).kind === 'mono'
  )
}

function UsageSection({
  usage,
  onUpgrade,
}: {
  usage: TenantSubscriptionSnapshot['usage']
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
    <SectionPanel
      description="Скільки з лімітів тарифу вже зайнято."
      title="Використання"
    >
      {overItems.length > 0 && (
        <Notice
          action={
            <Button onClick={onUpgrade} variant="primary">
              Підвищити тариф
            </Button>
          }
          tone="warn"
        >
          Перевищено ліміт тарифу:{' '}
          {overItems
            .map(
              (item) =>
                `${item.label} ${item.data.used}/${item.data.max ?? '∞'}`,
            )
            .join(', ')}
          . Наявні дані лишаються доступними, але додавати нові не вийде, поки
          не повернетесь у межі.
        </Notice>
      )}
      <ul className="grid gap-2 sm:grid-cols-2" role="list">
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
              className="border-app-line rounded-control grid gap-2 border px-3 py-2.5"
              key={item.label}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-app-dim text-[12.5px]">{item.label}</span>
                <span
                  className={cn(
                    'text-[12.5px] tabular-nums',
                    over ? 'text-state-warn' : 'text-app-muted',
                  )}
                >
                  {item.data.used} / {item.data.max ?? '∞'}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={cn(
                    'h-full transition-all duration-500',
                    item.data.max === null
                      ? 'bg-brand/40'
                      : ratio >= 1
                        ? 'bg-state-danger'
                        : ratio >= 0.8
                          ? 'bg-state-warn'
                          : 'bg-brand',
                  )}
                  style={{ width: `${ratio * 100}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </SectionPanel>
  )
}

function subscriptionFailureMessage(
  mutation: SubscriptionMutation,
  error: unknown,
): string {
  if (error instanceof BillingManagementUnavailableError) {
    return BILLING_MANAGEMENT_UNAVAILABLE
  }
  if (error instanceof ModuleAccessDeniedError) {
    return 'Дія більше недоступна: права або стан підписки змінилися. Оновіть сторінку.'
  }
  const problem = normalizeApiProblem(error)
  if (problem.kind === 'forbidden') {
    return 'У вас більше немає права змінювати підписку. Попросіть власника розбірки надати доступ до білінгу.'
  }
  if (problem.kind === 'conflict') {
    return 'Підписка вже змінилася. Оновіть сторінку та спробуйте ще раз.'
  }
  if (problem.kind === 'network' || problem.kind === 'timeout') {
    return mutation === 'cancel'
      ? 'Не вдалося скасувати підписку: немає з’єднання з мережею. Перевірте інтернет і спробуйте ще раз.'
      : 'Не вдалося розпочати оплату: немає з’єднання з мережею. Перевірте інтернет і спробуйте ще раз.'
  }
  return mutation === 'cancel'
    ? 'Не вдалося скасувати підписку. Спробуйте ще раз.'
    : 'Не вдалося розпочати оплату. Спробуйте ще раз.'
}

function isCurrentScope(
  scope: ReturnType<
    ReturnType<typeof useBillingMutation>['requireLatestMutation']
  >,
  snapshot: ReturnType<typeof useBillingMutation>['cabinet']['snapshot'],
): boolean {
  return (
    !scope.signal.aborted &&
    snapshot?.tenantId === scope.tenantId &&
    snapshot.generation === scope.generation
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
