import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CreditCard } from 'lucide-react'
import {
  Amount,
  Button,
  DataTable,
  DateValue,
  EmptyState,
  ErrorState,
  Notice,
  PageBody,
  PageHeader,
  SectionPanel,
  SkeletonRows,
  StatusPill,
  useOperation,
  useToast,
  type DataColumn,
  type StatusTone,
} from '@/components/app'
import {
  billingApi,
  resolveProviderManagement,
  type ProviderAwareSubscriptionDto,
} from '@/api/billing'
import { normalizeApiProblem } from '@/api/errors'
import type {
  PagedResult,
  PaymentDto,
  PaymentStatus,
  SubscriptionDto,
} from '@/api/types'
import { ModuleAccessDeniedError } from '../policy'
import { tenantRequestScope } from '../tenant-request-scope'
import {
  BILLING_EYEBROW,
  BILLING_MANAGEMENT_UNAVAILABLE,
  BillingManagementUnavailableError,
  BillingMutationGate,
  BillingSection,
  useBillingMutation,
} from './billing-layout'

type PaymentsState =
  | { kind: 'loading'; generation: number | undefined; attempt: number }
  | { kind: 'empty'; generation: number | undefined; attempt: number }
  | {
      kind: 'ready'
      generation: number | undefined
      attempt: number
      page: PagedResult<PaymentDto>
    }
  | {
      kind: 'error'
      generation: number | undefined
      attempt: number
      message: string
    }

/** A result that arrived for a tenant we have already left changes nothing. */
type MutationOutcome = 'applied' | 'stale'

type PaymentSubscription = Readonly<
  Pick<SubscriptionDto, 'cardBrand' | 'cardLast4'>
> &
  Partial<Pick<ProviderAwareSubscriptionDto, 'source' | 'manageVia'>>

export function PaymentsScreen() {
  const toast = useToast()
  const { cabinet, controlDecision, requireLatestMutation } =
    useBillingMutation('payments')
  const generation = cabinet.snapshot?.generation
  const [paymentsState, setPaymentsState] = useState<PaymentsState>({
    kind: 'loading',
    generation,
    attempt: 0,
  })
  const [guardError, setGuardError] = useState<{
    generation: number | undefined
    message: string
  } | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const latestSnapshotRef = useRef(cabinet.snapshot)
  const paymentIdRef = useRef<string | null>(null)
  const cancelStageRef = useRef<'cancel' | 'reload'>('cancel')

  useEffect(() => {
    latestSnapshotRef.current = cabinet.snapshot
  }, [cabinet.snapshot])

  useEffect(() => {
    const signal = tenantRequestScope.signal
    let current = true
    void billingApi
      .getPayments(1, 10, { signal })
      .then((loaded) => {
        if (!current || signal.aborted) return
        setPaymentsState(paymentsStateFrom(loaded, generation, loadAttempt))
      })
      .catch((error: unknown) => {
        if (!current || signal.aborted) return
        setPaymentsState({
          kind: 'error',
          generation,
          attempt: loadAttempt,
          message: paymentsFailureMessage(error),
        })
      })
    return () => {
      current = false
    }
  }, [generation, loadAttempt])

  const cancelPayment = useOperation<MutationOutcome>(
    async () => {
      cancelStageRef.current = 'cancel'
      const paymentId = paymentIdRef.current
      const scope = requireLatestMutation()
      if (
        paymentId === null ||
        !hasMonoManagement(latestSnapshotRef.current?.subscription)
      ) {
        throw new BillingManagementUnavailableError()
      }
      try {
        await billingApi.cancelPayment(paymentId, { signal: scope.signal })
      } catch (error) {
        if (!isCurrentScope(scope, latestSnapshotRef.current)) return 'stale'
        throw error
      }
      if (!isCurrentScope(scope, latestSnapshotRef.current)) return 'stale'
      cancelStageRef.current = 'reload'
      let loaded: PagedResult<PaymentDto>
      try {
        loaded = await billingApi.getPayments(1, 10, { signal: scope.signal })
      } catch (error) {
        if (!isCurrentScope(scope, latestSnapshotRef.current)) return 'stale'
        throw error
      }
      if (!isCurrentScope(scope, latestSnapshotRef.current)) return 'stale'
      setPaymentsState(paymentsStateFrom(loaded, generation, loadAttempt))
      return 'applied'
    },
    {
      errorMessage: (error) =>
        cancelStageRef.current === 'reload'
          ? 'Платіж скасовано, але не вдалося оновити список. Оновіть сторінку, щоб побачити актуальні платежі.'
          : paymentCancellationFailureMessage(error),
      onSuccess: (outcome) => {
        setCancellingId(null)
        if (outcome === 'applied') {
          toast.show({ message: 'Платіж скасовано.', tone: 'ok' })
        }
      },
      onError: () => setCancellingId(null),
    },
  )

  const resetCancel = cancelPayment.reset
  useEffect(() => {
    // A failure describes one snapshot of access. When that snapshot is
    // replaced, so is the message.
    resetCancel()
  }, [generation, resetCancel])

  const currentPaymentsState =
    paymentsState.generation === generation &&
    paymentsState.attempt === loadAttempt
      ? paymentsState
      : ({ kind: 'loading', generation, attempt: loadAttempt } as const)

  const paymentMethod = (
    <PaymentMethod subscription={cabinet.snapshot?.subscription ?? null} />
  )
  const canManageMonoPayments = hasMonoManagement(
    cabinet.snapshot?.subscription ?? null,
  )
  const mutationError =
    (guardError !== null && guardError.generation === generation
      ? guardError.message
      : null) ?? cancelPayment.error

  if (currentPaymentsState.kind === 'loading') {
    return (
      <PaymentsFrame>
        {paymentMethod}
        <BillingSection description="Історія платежів і чеки" title="Білінг">
          <SkeletonRows columns={4} label="Завантажуємо платежі…" rows={3} />
        </BillingSection>
      </PaymentsFrame>
    )
  }

  if (currentPaymentsState.kind === 'error') {
    return (
      <PaymentsFrame>
        {paymentMethod}
        <BillingSection description="Історія платежів і чеки" title="Білінг">
          <ErrorState
            description={currentPaymentsState.message}
            onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
            title="Платежі не завантажилися"
          />
        </BillingSection>
      </PaymentsFrame>
    )
  }

  const items =
    currentPaymentsState.kind === 'ready' ? currentPaymentsState.page.items : []
  const guardCheckout = (event: { preventDefault: () => void }) => {
    try {
      requireLatestMutation()
      if (!hasMonoManagement(latestSnapshotRef.current?.subscription)) {
        event.preventDefault()
        resetCancel()
        setGuardError({ generation, message: BILLING_MANAGEMENT_UNAVAILABLE })
      }
    } catch {
      event.preventDefault()
    }
  }
  const startCancel = (paymentId: string) => {
    setGuardError(null)
    setCancellingId(paymentId)
    paymentIdRef.current = paymentId
    cancelPayment.run()
  }
  const actionable = items.some(
    (item) => canManageMonoPayments && item.status === 'pending',
  )

  const columns: DataColumn<PaymentDto>[] = [
    {
      key: 'date',
      label: 'Дата',
      variant: 'primary',
      cell: (item) => (
        <span className="grid gap-0.5">
          <DateValue value={item.createdAt} withTime={false} />
          <span className="text-app-dim text-[11.5px]">
            {paymentTypeLabel(item.type)}
          </span>
        </span>
      ),
    },
    {
      key: 'amount',
      label: 'Сума',
      align: 'end',
      cell: (item) => <Amount currency={item.currency} value={item.amount} />,
    },
    {
      key: 'status',
      label: 'Статус',
      cell: (item) => {
        const status = paymentStatusMeta[item.status]
        return <StatusPill tone={status.tone}>{status.label}</StatusPill>
      },
    },
    {
      key: 'receipt',
      label: 'Чек',
      cell: (item) =>
        item.providerInvoiceId ? (
          <span className="font-mono text-[11.5px] break-all">
            {item.providerInvoiceId}
          </span>
        ) : (
          '—'
        ),
    },
    ...(actionable
      ? [
          {
            key: 'actions',
            label: 'Дії',
            align: 'end' as const,
            headerHidden: true,
            cell: (item: PaymentDto) =>
              canManageMonoPayments && item.status === 'pending' ? (
                <span className="flex min-w-0 flex-wrap justify-end gap-2">
                  {item.checkoutUrl && (
                    <BillingMutationGate decision={controlDecision}>
                      <Button asChild variant="ghost">
                        <a
                          href={item.checkoutUrl}
                          onClick={guardCheckout}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          Продовжити оплату
                        </a>
                      </Button>
                    </BillingMutationGate>
                  )}
                  <BillingMutationGate decision={controlDecision}>
                    <Button
                      {...cancelPayment.triggerProps}
                      aria-busy={cancellingId === item.id}
                      onClick={() => startCancel(item.id)}
                      variant="danger"
                    >
                      Скасувати
                    </Button>
                  </BillingMutationGate>
                </span>
              ) : null,
          },
        ]
      : []),
  ]

  return (
    <PaymentsFrame>
      {paymentMethod}
      <BillingSection description="Історія платежів і чеки" title="Білінг">
        {mutationError === null ? null : (
          <Notice tone="danger">{mutationError}</Notice>
        )}
        <DataTable
          caption="Історія платежів"
          columns={columns}
          empty={
            <EmptyState
              description="Платежів ще не було."
              title="Історія платежів порожня"
            />
          }
          rowKey={(item) => item.id}
          rows={items}
        />
      </BillingSection>
    </PaymentsFrame>
  )
}

function PaymentsFrame({ children }: { children: ReactNode }) {
  return (
    <PageBody>
      <PageHeader eyebrow={BILLING_EYEBROW} title="Оплата" />
      {children}
    </PageBody>
  )
}

function paymentsStateFrom(
  loaded: PagedResult<PaymentDto>,
  generation: number | undefined,
  attempt: number,
): PaymentsState {
  return loaded.items.length > 0
    ? { kind: 'ready', generation, attempt, page: loaded }
    : { kind: 'empty', generation, attempt }
}

function paymentsFailureMessage(error: unknown): string {
  const problem = normalizeApiProblem(error)
  if (problem.kind === 'network' || problem.kind === 'timeout') {
    return 'Не вдалося завантажити платежі: немає з’єднання з мережею. Перевірте інтернет і спробуйте ще раз.'
  }
  if (problem.kind === 'forbidden') {
    return 'У вас немає доступу до платежів цієї розбірки. Попросіть власника надати доступ до білінгу.'
  }
  return 'Не вдалося завантажити платежі. Спробуйте ще раз.'
}

function paymentCancellationFailureMessage(error: unknown): string {
  if (error instanceof BillingManagementUnavailableError) {
    return BILLING_MANAGEMENT_UNAVAILABLE
  }
  if (error instanceof ModuleAccessDeniedError) {
    return 'Дія більше недоступна: права або стан підписки змінилися. Оновіть сторінку.'
  }
  const problem = normalizeApiProblem(error)
  if (problem.kind === 'forbidden') {
    return 'У вас більше немає права скасувати цей платіж. Попросіть власника розбірки надати доступ до білінгу.'
  }
  if (problem.kind === 'conflict') {
    return 'Статус платежу вже змінився. Оновіть список платежів.'
  }
  if (problem.kind === 'network' || problem.kind === 'timeout') {
    return 'Не вдалося скасувати платіж: немає з’єднання з мережею. Перевірте інтернет і спробуйте ще раз.'
  }
  return 'Не вдалося скасувати платіж. Спробуйте ще раз.'
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

function PaymentMethod({
  subscription,
}: {
  subscription: PaymentSubscription | null
}) {
  const management = subscription
    ? resolveProviderManagement(
        subscription as unknown as Pick<
          ProviderAwareSubscriptionDto,
          'source' | 'manageVia'
        >,
      )
    : { kind: 'unavailable' as const }
  const hasCard = Boolean(subscription?.cardLast4)

  return (
    <SectionPanel
      description="Карта, з якої списується підписка"
      title="Спосіб оплати"
    >
      {management.kind === 'provider' ? (
        <p className="text-app-muted text-sm">
          Спосіб оплати керується {management.label}. Змініть картку в
          налаштуваннях магазину.
        </p>
      ) : management.kind === 'unavailable' ? (
        <p className="text-app-muted text-sm">
          Інформація про спосіб оплати наразі недоступна. Оновіть сторінку.
        </p>
      ) : hasCard ? (
        <div className="flex items-center gap-3">
          <span className="bg-brand/[0.12] text-brand grid size-11 shrink-0 place-items-center rounded-xl">
            <CreditCard aria-hidden className="size-5" />
          </span>
          <span className="grid min-w-0 gap-0.5">
            <span className="text-sm font-medium tabular-nums text-white">
              {(subscription?.cardBrand ?? 'Card').toUpperCase()} ••••{' '}
              {subscription?.cardLast4}
            </span>
            <span className="text-app-dim text-[12.5px]">
              Авторизована для регулярних списань
            </span>
          </span>
        </div>
      ) : (
        <p className="text-app-muted text-sm">
          Картка ще не привʼязана. Активуйте підписку — і карту запитає Monobank
          під час оплати.
        </p>
      )}
    </SectionPanel>
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

const paymentStatusMeta: Record<
  PaymentStatus,
  { label: string; tone: StatusTone }
> = {
  success: { label: 'Оплачено', tone: 'ok' },
  pending: { label: 'Очікує', tone: 'warn' },
  failed: { label: 'Помилка', tone: 'danger' },
  reversed: { label: 'Повернено', tone: 'neutral' },
  cancelled: { label: 'Скасовано', tone: 'neutral' },
}

function paymentTypeLabel(type: PaymentDto['type']): string {
  switch (type) {
    case 'checkout':
      return 'Перший платіж'
    case 'recurring':
      return 'Регулярне списання'
    case 'verification':
      return 'Верифікація'
    default:
      return type
  }
}
