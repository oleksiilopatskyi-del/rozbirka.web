import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { billingApi } from '@/api/billing'
import type { PublicPlanDto } from '@/api/types'
import { readPlanCode } from '@/lib/plan-selection'
import { cn } from '@/lib/utils'
import { tenantRequestScope } from '../tenant-request-scope'
import {
  BillingHeader,
  BillingMutationGate,
  EmptyBillingPanel,
  formatBillingAmount,
  useBillingMutation,
} from './billing-layout'

export function PlansScreen() {
  const [searchParams] = useSearchParams()
  const { cabinet, controlDecision, requireLatestMutation } =
    useBillingMutation('plans')
  const [plans, setPlans] = useState<PublicPlanDto[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const generation = cabinet.snapshot?.generation
  const selectedPlanCode = readPlanCode(`?${searchParams.toString()}`)

  useEffect(() => {
    const signal = tenantRequestScope.signal
    void billingApi
      .getPlans({ signal })
      .then((loaded) => {
        if (!signal.aborted) setPlans(loaded)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!signal.aborted) setLoading(false)
      })
  }, [generation])

  const subscribe = async (planCode: string) => {
    setBusy(true)
    try {
      const scope = requireLatestMutation()
      const { checkoutUrl } = await billingApi.subscribe(
        { planCode },
        { signal: scope.signal },
      )
      if (!scope.signal.aborted) window.location.assign(checkoutUrl)
    } catch {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <p role="status" className="text-[14px] text-neutral-500">
        Завантаження…
      </p>
    )
  }
  if (plans.length === 0) return <EmptyBillingPanel />

  const currentCode = cabinet.snapshot?.subscription?.planCode
  const recommendedCode = 'pro_monthly'

  return (
    <div className="flex flex-col gap-8">
      <BillingHeader
        title="Тарифи"
        subtitle="Обери план, що підходить твоєму бізнесу"
      />
      <ul role="list" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.code === currentCode
          const isSelected = plan.code === selectedPlanCode
          const isRecommended = plan.code === recommendedCode
          return (
            <li
              key={plan.code}
              className={cn(
                'rounded-(--radius-card) flex flex-col gap-6 p-6 lg:p-8',
                isRecommended
                  ? 'bg-brand text-brand-foreground'
                  : 'bg-surface-1 text-white ring-1 ring-white/[0.05]',
                isSelected && 'ring-2 ring-brand',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'inline-flex w-fit items-center rounded-full px-3 py-1.5 text-[11px] font-medium tracking-[0.05em] uppercase',
                    isRecommended ? 'bg-black/15' : 'bg-white/[0.06]',
                  )}
                >
                  {plan.name}
                </span>
                {isSelected ? (
                  <span className="text-[11px] uppercase tracking-[0.05em] opacity-70">
                    Обрано
                  </span>
                ) : isCurrent ? (
                  <span className="text-[11px] uppercase tracking-[0.05em] opacity-70">
                    Поточний
                  </span>
                ) : null}
              </div>
              <p className="flex items-baseline gap-1 text-[44px] leading-[0.9] font-light tracking-[-0.03em]">
                <span>{formatBillingAmount(plan.amount, plan.currency)}</span>
                <span className="text-[13px] font-normal opacity-70">/міс</span>
              </p>
              <ul role="list" className="flex flex-col gap-2 text-[13px]">
                <PlanLimit label="Авто" value={plan.limits.cars} />
                <PlanLimit label="Партії" value={plan.limits.intakes} />
                <PlanLimit label="Запчастини" value={plan.limits.parts} />
                <PlanLimit label="Команда" value={plan.limits.users} />
                <PlanLimit label="Каси" value={plan.limits.cashRegisters} />
              </ul>
              {isCurrent ? (
                <button
                  type="button"
                  disabled
                  className="mt-auto inline-flex h-12 items-center justify-center rounded-full bg-white/[0.06] text-[14px] text-neutral-400 opacity-50"
                >
                  Поточний тариф
                </button>
              ) : (
                <BillingMutationGate decision={controlDecision}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void subscribe(plan.code)}
                    className={cn(
                      'mt-auto inline-flex h-12 w-full items-center justify-center rounded-full text-[14px] transition-colors disabled:opacity-50',
                      isRecommended
                        ? 'bg-black text-white hover:bg-black/80'
                        : 'bg-white text-black hover:bg-white/90',
                    )}
                  >
                    Обрати
                  </button>
                </BillingMutationGate>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function PlanLimit({ label, value }: { label: string; value: number | null }) {
  return (
    <li className="flex justify-between gap-2 opacity-80">
      <span>{label}</span>
      <span className="tabular-nums">{value ?? '∞'}</span>
    </li>
  )
}
