import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  billingApi,
  resolveProviderManagement,
  type ProviderAwareSubscriptionDto,
} from '@/api/billing'
import { normalizeApiProblem } from '@/api/errors'
import type { PublicPlanDto } from '@/api/types'
import { readPlanCode } from '@/lib/plan-selection'
import { cn } from '@/lib/utils'
import { ModuleAccessDeniedError } from '../policy'
import { tenantRequestScope } from '../tenant-request-scope'
import {
  BillingHeader,
  BillingMutationGate,
  EmptyBillingPanel,
  formatBillingAmount,
  useBillingMutation,
} from './billing-layout'

type PlansState =
  | { kind: 'loading'; generation: number | undefined; attempt: number }
  | { kind: 'empty'; generation: number | undefined; attempt: number }
  | {
      kind: 'ready'
      generation: number | undefined
      attempt: number
      plans: PublicPlanDto[]
    }
  | {
      kind: 'error'
      generation: number | undefined
      attempt: number
      message: string
    }

type CheckoutState =
  | { kind: 'idle' }
  | { kind: 'pending'; generation: number }
  | { kind: 'mutation-error'; generation: number; message: string }

export function PlansScreen() {
  const [searchParams] = useSearchParams()
  const { cabinet, controlDecision, requireLatestMutation } =
    useBillingMutation('plans')
  const generation = cabinet.snapshot?.generation
  const [plansState, setPlansState] = useState<PlansState>({
    kind: 'loading',
    generation,
    attempt: 0,
  })
  const [checkoutState, setCheckoutState] = useState<CheckoutState>({
    kind: 'idle',
  })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const latestSnapshotRef = useRef(cabinet.snapshot)
  const selectedPlanCode = readPlanCode(`?${searchParams.toString()}`)

  useEffect(() => {
    latestSnapshotRef.current = cabinet.snapshot
  }, [cabinet.snapshot])

  useEffect(() => {
    const signal = tenantRequestScope.signal
    let current = true
    void billingApi
      .getPlans({ signal })
      .then((loaded) => {
        if (!current || signal.aborted) return
        setPlansState(
          loaded.length > 0
            ? {
                kind: 'ready',
                generation,
                attempt: loadAttempt,
                plans: loaded,
              }
            : { kind: 'empty', generation, attempt: loadAttempt },
        )
      })
      .catch((error: unknown) => {
        if (!current || signal.aborted) return
        setPlansState({
          kind: 'error',
          generation,
          attempt: loadAttempt,
          message: plansFailureMessage(error),
        })
      })
    return () => {
      current = false
    }
  }, [generation, loadAttempt])

  const currentPlansState =
    plansState.generation === generation && plansState.attempt === loadAttempt
      ? plansState
      : ({ kind: 'loading', generation, attempt: loadAttempt } as const)

  const subscribe = async (planCode: string) => {
    let scope: ReturnType<typeof requireLatestMutation> | null = null
    try {
      scope = requireLatestMutation()
      if (!hasMonoManagement(latestSnapshotRef.current?.subscription)) {
        setCheckoutState({
          kind: 'mutation-error',
          generation: scope.generation,
          message: 'Керування підпискою недоступне.',
        })
        return
      }
      setCheckoutState({ kind: 'pending', generation: scope.generation })
      const { checkoutUrl } = await billingApi.subscribe(
        { planCode },
        { signal: scope.signal },
      )
      if (isCurrentScope(scope, latestSnapshotRef.current)) {
        window.location.assign(checkoutUrl)
      }
    } catch (error) {
      if (scope && !isCurrentScope(scope, latestSnapshotRef.current)) return
      setCheckoutState({
        kind: 'mutation-error',
        generation: scope?.generation ?? generation ?? -1,
        message: checkoutFailureMessage(error),
      })
    }
  }

  if (currentPlansState.kind === 'loading') {
    return (
      <p role="status" className="text-[14px] text-neutral-400">
        Завантаження…
      </p>
    )
  }
  if (currentPlansState.kind === 'error') {
    return (
      <BillingLoadError
        message={currentPlansState.message}
        onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
      />
    )
  }
  if (currentPlansState.kind === 'empty') return <EmptyBillingPanel />

  const currentCode = cabinet.snapshot?.subscription?.planCode
  const providerSubscription = cabinet.snapshot
    ?.subscription as ProviderAwareSubscriptionDto | null
  const management = providerSubscription
    ? resolveProviderManagement(providerSubscription)
    : { kind: 'unavailable' as const }
  const recommendedCode = 'pro_monthly'
  const checkoutForGeneration =
    checkoutState.kind !== 'idle' && checkoutState.generation === generation
      ? checkoutState
      : { kind: 'idle' as const }
  const busy = checkoutForGeneration.kind === 'pending'

  return (
    <div className="flex flex-col gap-8">
      <BillingHeader
        title="Тарифи"
        subtitle="Обери план, що підходить твоєму бізнесу"
      />
      {checkoutForGeneration.kind === 'mutation-error' && (
        <p
          role="alert"
          className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-5 py-4 text-[14px] text-red-200"
        >
          {checkoutForGeneration.message}
        </p>
      )}
      {management.kind === 'provider' && (
        <p className="rounded-2xl border border-white/[0.1] px-5 py-4 text-[14px] text-neutral-300">
          Цією підпискою керує {management.label}. Змінюйте або скасовуйте її в
          налаштуваннях магазину.
        </p>
      )}
      {management.kind === 'unavailable' && (
        <p className="rounded-2xl border border-white/[0.1] px-5 py-4 text-[14px] text-neutral-300">
          Керування підпискою недоступне. Оновіть сторінку або зверніться до
          підтримки.
        </p>
      )}
      <ul role="list" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {currentPlansState.plans.map((plan) => {
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
              ) : management.kind === 'mono' ? (
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
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function BillingLoadError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-4">
      <p className="text-[14px] text-red-200">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="bg-brand text-brand-foreground inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-5 text-[14px]"
      >
        Спробувати ще раз
      </button>
    </div>
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

function plansFailureMessage(error: unknown): string {
  const problem = normalizeApiProblem(error)
  if (problem.kind === 'network' || problem.kind === 'timeout') {
    return 'Не вдалося завантажити тарифи: немає з’єднання з мережею.'
  }
  if (problem.kind === 'forbidden') {
    return 'У вас немає доступу до тарифів цієї розбірки.'
  }
  return 'Не вдалося завантажити тарифи. Спробуйте ще раз.'
}

function checkoutFailureMessage(error: unknown): string {
  if (error instanceof ModuleAccessDeniedError) {
    return 'Дія більше недоступна: права або стан підписки змінилися.'
  }
  const problem = normalizeApiProblem(error)
  if (problem.kind === 'forbidden') {
    return 'У вас більше немає права змінювати підписку.'
  }
  if (problem.kind === 'conflict') {
    return 'Підписка вже змінилася. Оновіть сторінку та спробуйте ще раз.'
  }
  if (problem.kind === 'network' || problem.kind === 'timeout') {
    return 'Не вдалося розпочати оплату: немає з’єднання з мережею.'
  }
  return 'Не вдалося розпочати оплату. Спробуйте ще раз.'
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

function PlanLimit({ label, value }: { label: string; value: number | null }) {
  return (
    <li className="flex justify-between gap-2 opacity-80">
      <span>{label}</span>
      <span className="tabular-nums">{value ?? '∞'}</span>
    </li>
  )
}
