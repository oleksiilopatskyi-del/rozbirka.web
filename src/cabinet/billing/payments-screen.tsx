import { useEffect, useRef, useState } from 'react'
import { CreditCard } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { ModuleAccessDeniedError } from '../policy'
import { tenantRequestScope } from '../tenant-request-scope'
import {
  BillingHeader,
  BillingMutationGate,
  formatBillingAmount,
  formatBillingDate,
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

type PaymentMutationState =
  | { kind: 'idle' }
  | { kind: 'pending'; generation: number; paymentId: string }
  | { kind: 'mutation-error'; generation: number; message: string }

type PaymentSubscription = Readonly<
  Pick<SubscriptionDto, 'cardBrand' | 'cardLast4'>
> &
  Partial<Pick<ProviderAwareSubscriptionDto, 'source' | 'manageVia'>>

export function PaymentsScreen() {
  const { cabinet, controlDecision, requireLatestMutation } =
    useBillingMutation('payments')
  const generation = cabinet.snapshot?.generation
  const [paymentsState, setPaymentsState] = useState<PaymentsState>({
    kind: 'loading',
    generation,
    attempt: 0,
  })
  const [mutationState, setMutationState] = useState<PaymentMutationState>({
    kind: 'idle',
  })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const latestSnapshotRef = useRef(cabinet.snapshot)

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

  const currentPaymentsState =
    paymentsState.generation === generation &&
    paymentsState.attempt === loadAttempt
      ? paymentsState
      : ({ kind: 'loading', generation, attempt: loadAttempt } as const)

  const cancelPayment = async (paymentId: string) => {
    let scope: ReturnType<typeof requireLatestMutation> | null = null
    let cancellationCompleted = false
    try {
      scope = requireLatestMutation()
      if (!hasMonoManagement(latestSnapshotRef.current?.subscription)) {
        setMutationState({
          kind: 'mutation-error',
          generation: scope.generation,
          message: 'Керування підпискою недоступне.',
        })
        return
      }
      setMutationState({
        kind: 'pending',
        generation: scope.generation,
        paymentId,
      })
      await billingApi.cancelPayment(paymentId, { signal: scope.signal })
      cancellationCompleted = true
      if (!isCurrentScope(scope, latestSnapshotRef.current)) return
      const loaded = await billingApi.getPayments(1, 10, {
        signal: scope.signal,
      })
      if (isCurrentScope(scope, latestSnapshotRef.current)) {
        setPaymentsState(paymentsStateFrom(loaded, generation, loadAttempt))
        setMutationState({ kind: 'idle' })
      }
    } catch (error) {
      if (scope && !isCurrentScope(scope, latestSnapshotRef.current)) return
      setMutationState({
        kind: 'mutation-error',
        generation: scope?.generation ?? generation ?? -1,
        message: cancellationCompleted
          ? 'Платіж скасовано, але не вдалося оновити список. Оновіть сторінку.'
          : paymentCancellationFailureMessage(error),
      })
    }
  }

  if (currentPaymentsState.kind === 'loading') {
    return (
      <p role="status" className="text-[14px] text-neutral-500">
        Завантаження…
      </p>
    )
  }

  const paymentMethod = (
    <PaymentMethod subscription={cabinet.snapshot?.subscription ?? null} />
  )
  const canManageMonoPayments = hasMonoManagement(
    cabinet.snapshot?.subscription ?? null,
  )

  if (currentPaymentsState.kind === 'error') {
    return (
      <div className="flex flex-col gap-12">
        {paymentMethod}
        <section>
          <BillingHeader title="Білінг" subtitle="Історія платежів і чеки" />
          <div role="alert" className="flex flex-col items-start gap-4">
            <p className="text-[14px] text-red-200">
              {currentPaymentsState.message}
            </p>
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="bg-brand text-brand-foreground inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-5 text-[14px]"
            >
              Спробувати ще раз
            </button>
          </div>
        </section>
      </div>
    )
  }

  if (currentPaymentsState.kind === 'empty') {
    return (
      <div className="flex flex-col gap-12">
        {paymentMethod}
        <section>
          <BillingHeader title="Білінг" subtitle="Історія платежів і чеки" />
          <p className="text-[14px] text-neutral-500">Платежів ще не було.</p>
        </section>
      </div>
    )
  }

  const mutationForGeneration =
    mutationState.kind !== 'idle' && mutationState.generation === generation
      ? mutationState
      : { kind: 'idle' as const }
  const cancellingId =
    mutationForGeneration.kind === 'pending'
      ? mutationForGeneration.paymentId
      : null

  return (
    <div className="flex flex-col gap-12">
      {paymentMethod}
      <section>
        <BillingHeader title="Білінг" subtitle="Історія платежів і чеки" />
        {mutationForGeneration.kind === 'mutation-error' && (
          <p
            role="alert"
            className="mb-5 rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-5 py-4 text-[14px] text-red-200"
          >
            {mutationForGeneration.message}
          </p>
        )}
        <div className="bg-surface-1 rounded-(--radius-card) ring-1 ring-white/[0.04]">
          <ul role="list" className="divide-y divide-white/[0.04]">
            {currentPaymentsState.page.items.map((item) => (
              <li
                key={item.id}
                className="flex min-w-0 flex-col items-stretch gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8 lg:py-6"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-[15px] font-medium tabular-nums">
                    {formatBillingAmount(item.amount, item.currency)}
                  </p>
                  <p className="min-w-0 text-[12px] break-words text-neutral-500 tabular-nums">
                    {formatBillingDate(item.createdAt)} ·{' '}
                    {paymentTypeLabel(item.type)}
                  </p>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
                  {canManageMonoPayments &&
                    item.status === 'pending' &&
                    item.checkoutUrl && (
                      <BillingMutationGate decision={controlDecision}>
                        <a
                          href={item.checkoutUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) => {
                            try {
                              requireLatestMutation()
                              if (
                                !hasMonoManagement(
                                  latestSnapshotRef.current?.subscription,
                                )
                              ) {
                                event.preventDefault()
                                setMutationState({
                                  kind: 'mutation-error',
                                  generation: generation ?? -1,
                                  message: 'Керування підпискою недоступне.',
                                })
                              }
                            } catch {
                              event.preventDefault()
                            }
                          }}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/[0.06] px-3 py-2 text-center text-[12px] font-medium text-white ring-1 ring-white/[0.08] transition hover:bg-white/[0.10]"
                        >
                          Продовжити оплату
                        </a>
                      </BillingMutationGate>
                    )}
                  {canManageMonoPayments && item.status === 'pending' && (
                    <BillingMutationGate decision={controlDecision}>
                      <button
                        type="button"
                        onClick={() => void cancelPayment(item.id)}
                        disabled={cancellingId === item.id}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 py-2 text-[12px] font-medium text-red-300 ring-1 ring-red-500/30 transition hover:bg-red-500/10 disabled:opacity-50"
                      >
                        {cancellingId === item.id ? 'Скасування…' : 'Скасувати'}
                      </button>
                    </BillingMutationGate>
                  )}
                  <PaymentStatusBadge status={item.status} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
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
    return 'Не вдалося завантажити платежі: немає з’єднання з мережею.'
  }
  if (problem.kind === 'forbidden') {
    return 'У вас немає доступу до платежів цієї розбірки.'
  }
  return 'Не вдалося завантажити платежі. Спробуйте ще раз.'
}

function paymentCancellationFailureMessage(error: unknown): string {
  if (error instanceof ModuleAccessDeniedError) {
    return 'Дія більше недоступна: права або стан підписки змінилися.'
  }
  const problem = normalizeApiProblem(error)
  if (problem.kind === 'forbidden') {
    return 'У вас більше немає права скасувати цей платіж.'
  }
  if (problem.kind === 'conflict') {
    return 'Статус платежу вже змінився. Оновіть список платежів.'
  }
  if (problem.kind === 'network' || problem.kind === 'timeout') {
    return 'Не вдалося скасувати платіж: немає з’єднання з мережею.'
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
    <section>
      <BillingHeader
        title="Оплата"
        subtitle="Карта, з якої списується підписка"
      />
      <div className="bg-surface-1 rounded-(--radius-card) flex flex-col gap-6 p-8 ring-1 ring-white/[0.04] lg:p-10">
        {management.kind === 'provider' ? (
          <p className="text-[14px] text-neutral-500">
            Спосіб оплати керується {management.label}.
          </p>
        ) : management.kind === 'unavailable' ? (
          <p className="text-[14px] text-neutral-500">
            Інформація про спосіб оплати наразі недоступна.
          </p>
        ) : hasCard ? (
          <div className="flex items-center gap-4">
            <div className="bg-brand/10 ring-brand/30 grid size-14 place-items-center rounded-2xl ring-1">
              <CreditCard className="text-brand size-6" aria-hidden />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-[20px] font-medium tabular-nums">
                {(subscription?.cardBrand ?? 'Card').toUpperCase()} ••••{' '}
                {subscription?.cardLast4}
              </p>
              <p className="text-[13px] text-neutral-500">
                Авторизована для регулярних списань
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[14px] text-neutral-500">
            Картка ще не привʼязана. Активуйте підписку — і карту запитає
            Monobank під час оплати.
          </p>
        )}
      </div>
    </section>
  )
}

function hasMonoManagement(subscription: unknown) {
  return (
    subscription !== null &&
    resolveProviderManagement(
      subscription as Pick<
        ProviderAwareSubscriptionDto,
        'source' | 'manageVia'
      >,
    ).kind === 'mono'
  )
}

function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, { label: string; cls: string }> = {
    success: {
      label: 'Оплачено',
      cls: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30',
    },
    pending: {
      label: 'Очікує',
      cls: 'bg-amber-500/10 text-amber-400 ring-amber-500/30',
    },
    failed: {
      label: 'Помилка',
      cls: 'bg-red-500/10 text-red-400 ring-red-500/30',
    },
    reversed: {
      label: 'Повернено',
      cls: 'bg-neutral-500/10 text-neutral-400 ring-neutral-500/30',
    },
    cancelled: {
      label: 'Скасовано',
      cls: 'bg-neutral-500/10 text-neutral-400 ring-neutral-500/30',
    },
  }
  const entry = map[status]
  return (
    <span
      className={cn('rounded-full px-3 py-1 text-[12px] ring-1', entry.cls)}
    >
      {entry.label}
    </span>
  )
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
