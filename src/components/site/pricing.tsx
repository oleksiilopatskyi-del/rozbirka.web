import { useEffect, useState } from 'react'
import { ArrowUpRight, Check } from 'lucide-react'
import { Link } from 'react-router'
import { billingApi } from '@/api/billing'
import { useAuth } from '@/auth/AuthContext'
import {
  FALLBACK_LANDING_PLANS,
  resolveLandingPlans,
  type LandingPlan,
} from '@/lib/landing-plans'
import { cn } from '@/lib/utils'
import { accountPathForPlan, loginPathForPlan } from '@/lib/plan-selection'
import { Section } from '@/components/layout/section'
import { PageContainer } from '@/components/layout/page-container'

const variantStyles: Record<
  LandingPlan['variant'],
  { card: string; pill: string; description: string; cta: string; perk: string }
> = {
  lite: {
    card: 'bg-surface-1 ring-1 ring-white/[0.05] text-white',
    pill: 'bg-white/[0.06] text-white ring-1 ring-white/10',
    description: 'text-neutral-400',
    cta: 'text-white',
    perk: 'text-neutral-300',
  },
  pro: {
    card: 'bg-brand text-brand-foreground',
    pill: 'bg-black/15 text-black ring-1 ring-black/10',
    description: 'text-black/70',
    cta: 'text-black',
    perk: 'text-black/80',
  },
  enterprise: {
    card: 'bg-surface-1 ring-1 ring-white/[0.05] text-white',
    pill: 'bg-white/[0.06] text-white ring-1 ring-white/10',
    description: 'text-neutral-400',
    cta: 'text-white',
    perk: 'text-neutral-300',
  },
}

export function Pricing() {
  const { status } = useAuth()
  const [plans, setPlans] = useState(FALLBACK_LANDING_PLANS)

  useEffect(() => {
    let cancelled = false
    void billingApi
      .getPlans()
      .then((value) => {
        if (!cancelled) setPlans(resolveLandingPlans(value))
      })
      .catch(() => {
        if (!cancelled) setPlans(FALLBACK_LANDING_PLANS)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Section id="pricing" className="py-16 lg:py-24">
      <PageContainer width="md">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-12 text-[40px] leading-[1] font-light tracking-[-0.02em] lg:mb-16 lg:text-[56px]">
            Тарифні плани
          </h2>
          <ul
            role="list"
            className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
          >
            {plans.map((plan) => {
              const destination =
                status === 'authenticated'
                  ? accountPathForPlan(plan.code)
                  : loginPathForPlan(plan.code)

              return (
                <PlanCard
                  key={plan.name}
                  plan={plan}
                  destination={destination}
                />
              )
            })}
          </ul>
        </div>
      </PageContainer>
    </Section>
  )
}

function PlanCard({
  plan,
  destination,
}: {
  plan: LandingPlan
  destination: string
}) {
  const styles = variantStyles[plan.variant]
  const isPro = plan.variant === 'pro'
  const isEnterprise = plan.variant === 'enterprise'

  return (
    <li
      className={cn(
        'group rounded-(--radius-card) relative flex min-h-[440px] flex-col gap-6 p-8 transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-2xl motion-reduce:transition-none motion-reduce:hover:translate-y-0 lg:p-10',
        styles.card,
        isEnterprise &&
          'md:col-span-2 md:mx-auto md:w-[calc(50%-0.5rem)] lg:col-span-1 lg:mx-0 lg:w-auto',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'inline-flex w-fit items-center rounded-full px-3.5 py-1.5 text-[12px] tracking-[0.02em]',
            styles.pill,
          )}
        >
          {plan.name}
        </span>
        {isPro && (
          <span className="text-[11px] tracking-[0.1em] text-black/70 uppercase">
            Популярний
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="flex items-end gap-2 font-light tracking-[-0.04em]">
          <span className="text-[64px] leading-[0.9] lg:text-[80px]">
            {plan.price}
          </span>
          <span className="font-visuelt mb-[0.55em] self-end whitespace-nowrap text-[14px] leading-none font-normal tracking-normal opacity-70">
            / {plan.period}
          </span>
        </p>
        {isPro && (
          <p className="text-[13px] font-medium opacity-80">
            {plan.trialDays} днів безкоштовно
          </p>
        )}
      </div>

      <p className={cn('text-[13px] lg:text-[14px]', styles.description)}>
        {plan.description}
      </p>

      <ul role="list" className="flex flex-col gap-2.5">
        {plan.perks.map((perk) => (
          <li
            key={perk}
            className={cn(
              'flex items-start gap-2.5 text-[13px] leading-[1.4]',
              styles.perk,
            )}
          >
            <Check className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden />
            <span>{perk}</span>
          </li>
        ))}
      </ul>

      <Link
        to={destination}
        className={cn(
          'mt-auto inline-flex min-h-11 items-center gap-2 py-2 text-[13px] font-normal tracking-[0.02em] uppercase transition-opacity hover:opacity-70',
          styles.cta,
        )}
      >
        <span>{plan.ctaLabel}</span>
        <ArrowUpRight
          className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          aria-hidden
        />
      </Link>
    </li>
  )
}
