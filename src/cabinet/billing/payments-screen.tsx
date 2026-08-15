import { useEffect, useState } from 'react'
import { CreditCard } from 'lucide-react'
import { billingApi } from '@/api/billing'
import type {
  PagedResult,
  PaymentDto,
  PaymentStatus,
  SubscriptionDto,
} from '@/api/types'
import { cn } from '@/lib/utils'
import { tenantRequestScope } from '../tenant-request-scope'
import {
  BillingHeader,
  BillingMutationGate,
  formatBillingAmount,
  formatBillingDate,
  useBillingMutation,
} from './billing-layout'

export function PaymentsScreen() {
  const { cabinet, controlDecision, requireLatestMutation } =
    useBillingMutation('payments')
  const [payments, setPayments] = useState<PagedResult<PaymentDto> | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const generation = cabinet.snapshot?.generation

  const load = async (signal: AbortSignal) => {
    const loaded = await billingApi.getPayments(1, 10, { signal })
    if (!signal.aborted) setPayments(loaded)
  }

  useEffect(() => {
    const signal = tenantRequestScope.signal
    void billingApi
      .getPayments(1, 10, { signal })
      .then((loaded) => {
        if (!signal.aborted) setPayments(loaded)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!signal.aborted) setLoading(false)
      })
  }, [generation])

  const cancelPayment = async (paymentId: string) => {
    setCancellingId(paymentId)
    try {
      const scope = requireLatestMutation()
      await billingApi.cancelPayment(paymentId, { signal: scope.signal })
      if (!scope.signal.aborted) await load(scope.signal)
    } catch {
      // Backend already validated; surface nothing for now — toast can come later.
    } finally {
      setCancellingId(null)
    }
  }

  if (loading) {
    return (
      <p role="status" className="text-[14px] text-neutral-500">
        Завантаження…
      </p>
    )
  }

  const paymentMethod = (
    <PaymentMethod subscription={cabinet.snapshot?.subscription ?? null} />
  )

  if (!payments || payments.items.length === 0) {
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

  return (
    <div className="flex flex-col gap-12">
      {paymentMethod}
      <section>
        <BillingHeader title="Білінг" subtitle="Історія платежів і чеки" />
        <div className="bg-surface-1 rounded-(--radius-card) ring-1 ring-white/[0.04]">
          <ul role="list" className="divide-y divide-white/[0.04]">
            {payments.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-4 px-6 py-5 lg:px-8 lg:py-6"
              >
                <div className="flex flex-col gap-1">
                  <p className="text-[15px] font-medium tabular-nums">
                    {formatBillingAmount(item.amount, item.currency)}
                  </p>
                  <p className="text-[12px] text-neutral-500 tabular-nums">
                    {formatBillingDate(item.createdAt)} ·{' '}
                    {paymentTypeLabel(item.type)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {item.status === 'pending' && item.checkoutUrl && (
                    <BillingMutationGate decision={controlDecision}>
                      <a
                        href={item.checkoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => {
                          try {
                            requireLatestMutation()
                          } catch {
                            event.preventDefault()
                          }
                        }}
                        className="rounded-full bg-white/[0.06] px-3 py-1 text-[12px] font-medium text-white ring-1 ring-white/[0.08] transition hover:bg-white/[0.10]"
                      >
                        Продовжити оплату
                      </a>
                    </BillingMutationGate>
                  )}
                  {item.status === 'pending' && (
                    <BillingMutationGate decision={controlDecision}>
                      <button
                        type="button"
                        onClick={() => void cancelPayment(item.id)}
                        disabled={cancellingId === item.id}
                        className="rounded-full px-3 py-1 text-[12px] font-medium text-red-300 ring-1 ring-red-500/30 transition hover:bg-red-500/10 disabled:opacity-50"
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

function PaymentMethod({
  subscription,
}: {
  subscription: Pick<SubscriptionDto, 'cardBrand' | 'cardLast4'> | null
}) {
  const hasCard = Boolean(subscription?.cardLast4)
  return (
    <section>
      <BillingHeader
        title="Оплата"
        subtitle="Карта, з якої списується підписка"
      />
      <div className="bg-surface-1 rounded-(--radius-card) flex flex-col gap-6 p-8 ring-1 ring-white/[0.04] lg:p-10">
        {hasCard ? (
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
