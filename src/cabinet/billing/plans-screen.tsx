import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import {
  Amount,
  Button,
  ErrorState,
  Notice,
  PageBody,
  PageHeader,
  Quantity,
  SkeletonRows,
  StatusPill,
  useOperation,
} from '@/components/app'
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
  BILLING_EYEBROW,
  BILLING_MANAGEMENT_UNAVAILABLE,
  BillingManagementUnavailableError,
  BillingMutationGate,
  BillingUnavailableNotice,
  EmptyBillingPanel,
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

/** A result that arrived for a tenant we have already left changes nothing. */
type MutationOutcome = 'applied' | 'stale'

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
  const [loadAttempt, setLoadAttempt] = useState(0)
  const latestSnapshotRef = useRef(cabinet.snapshot)
  const planCodeRef = useRef<string | null>(null)
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

  const checkout = useOperation<MutationOutcome>(
    async () => {
      const planCode = planCodeRef.current
      const scope = requireLatestMutation()
      if (
        planCode === null ||
        !hasMonoManagement(latestSnapshotRef.current?.subscription)
      ) {
        throw new BillingManagementUnavailableError()
      }
      let checkoutUrl: string
      try {
        ;({ checkoutUrl } = await billingApi.subscribe(
          { planCode },
          { signal: scope.signal },
        ))
      } catch (error) {
        if (!isCurrentScope(scope, latestSnapshotRef.current)) return 'stale'
        throw error
      }
      if (!isCurrentScope(scope, latestSnapshotRef.current)) return 'stale'
      window.location.assign(checkoutUrl)
      return 'applied'
    },
    // No success toast: a checkout leaves the app for the Mono pay page.
    { errorMessage: checkoutFailureMessage },
  )

  const resetCheckout = checkout.reset
  useEffect(() => {
    // A failure describes one snapshot of access. When that snapshot is
    // replaced, so is the message.
    resetCheckout()
  }, [generation, resetCheckout])

  const currentPlansState =
    plansState.generation === generation && plansState.attempt === loadAttempt
      ? plansState
      : ({ kind: 'loading', generation, attempt: loadAttempt } as const)

  if (currentPlansState.kind === 'loading') {
    return (
      <PlansFrame>
        <SkeletonRows columns={3} label="Завантажуємо тарифи…" rows={3} />
      </PlansFrame>
    )
  }
  if (currentPlansState.kind === 'error') {
    return (
      <PlansFrame>
        <ErrorState
          description={currentPlansState.message}
          onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
          title="Тарифи не завантажилися"
        />
      </PlansFrame>
    )
  }
  if (currentPlansState.kind === 'empty') {
    return (
      <PlansFrame>
        <EmptyBillingPanel />
      </PlansFrame>
    )
  }

  const currentCode = cabinet.snapshot?.subscription?.planCode
  const providerSubscription = cabinet.snapshot
    ?.subscription as ProviderAwareSubscriptionDto | null
  const management = providerSubscription
    ? resolveProviderManagement(providerSubscription)
    : { kind: 'unavailable' as const }
  const recommendedCode = 'pro_monthly'

  return (
    <PlansFrame>
      {checkout.error === null ? null : (
        <Notice tone="danger">{checkout.error}</Notice>
      )}
      {management.kind === 'provider' && (
        <Notice tone="info">
          Цією підпискою керує {management.label}. Змінюйте або скасовуйте її в
          налаштуваннях магазину.
        </Notice>
      )}
      {management.kind === 'unavailable' && <BillingUnavailableNotice />}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list">
        {currentPlansState.plans.map((plan) => {
          const isCurrent = plan.code === currentCode
          const isSelected = plan.code === selectedPlanCode
          return (
            <li
              className={cn(
                'border-app-line rounded-panel bg-app-raised flex min-w-0 flex-col gap-3 border p-4',
                plan.code === recommendedCode && 'border-brand/30',
                isSelected && 'ring-brand ring-1',
              )}
              key={plan.code}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-white">
                  {plan.name}
                </h2>
                {isSelected ? (
                  <StatusPill tone="info">Обрано</StatusPill>
                ) : isCurrent ? (
                  <StatusPill tone="ok">Поточний тариф</StatusPill>
                ) : null}
              </div>
              <p className="flex flex-wrap items-baseline gap-x-1.5">
                <Amount
                  className="text-[25px] leading-tight font-light tracking-[-0.02em] text-white"
                  currency={plan.currency}
                  value={plan.amount}
                />
                <span className="text-app-dim text-[12.5px]">/ місяць</span>
              </p>
              <dl className="border-app-line grid gap-1.5 border-t pt-3">
                <PlanLimit label="Авто" value={plan.limits.cars} />
                <PlanLimit label="Партії" value={plan.limits.intakes} />
                <PlanLimit label="Запчастини" value={plan.limits.parts} />
                <PlanLimit label="Команда" value={plan.limits.users} />
                <PlanLimit label="Каси" value={plan.limits.cashRegisters} />
              </dl>
              <div className="mt-auto pt-1">
                {isCurrent ? (
                  <p className="text-app-dim text-[12.5px]">
                    Цей тариф уже діє.
                  </p>
                ) : management.kind === 'mono' ? (
                  <BillingMutationGate decision={controlDecision}>
                    <Button
                      onClick={() => {
                        planCodeRef.current = plan.code
                        checkout.run()
                      }}
                      size="wide"
                      variant="primary"
                      {...checkout.triggerProps}
                    >
                      Обрати
                    </Button>
                  </BillingMutationGate>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </PlansFrame>
  )
}

function PlansFrame({ children }: { children: ReactNode }) {
  return (
    <PageBody>
      <PageHeader eyebrow={BILLING_EYEBROW} title="Тарифи" />
      {children}
    </PageBody>
  )
}

function PlanLimit({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-app-dim text-[12.5px]">{label}</dt>
      <dd className="text-app-muted text-[12.5px]">
        <Quantity fallback="∞" value={value} />
      </dd>
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
    return 'Не вдалося завантажити тарифи: немає з’єднання з мережею. Перевірте інтернет і спробуйте ще раз.'
  }
  if (problem.kind === 'forbidden') {
    return 'У вас немає доступу до тарифів цієї розбірки. Попросіть власника надати доступ до білінгу.'
  }
  return 'Не вдалося завантажити тарифи. Спробуйте ще раз.'
}

function checkoutFailureMessage(error: unknown): string {
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
    return 'Не вдалося розпочати оплату: немає з’єднання з мережею. Перевірте інтернет і спробуйте ще раз.'
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
