import { ArrowUpRight, Check } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'
import { Section } from '@/components/layout/section'
import { PageContainer } from '@/components/layout/page-container'

type PlanVariant = 'lite' | 'pro' | 'enterprise'

interface Plan {
  name: string
  price: string
  period: string
  /** Sub-line under the price (e.g. trial note). Optional. */
  note?: string
  description: string
  perks: string[]
  ctaLabel: string
  variant: PlanVariant
}

// Mirrors rozbirka.core's BillingPlanCatalog. Could be wired to
// GET /billing/plans later; pricing rarely changes so static is fine.
const plans: Plan[] = [
  {
    name: 'Lite',
    price: '$19',
    period: 'місяць',
    description: 'Старт для маленької розбірки',
    perks: ['5 авто', '300 запчастин', '1 користувач, 1 каса'],
    ctaLabel: 'Обрати',
    variant: 'lite',
  },
  {
    name: 'Pro',
    price: '$59',
    period: 'місяць',
    note: '7 днів безкоштовно',
    description: 'Все необхідне щоб масштабувати продажі',
    perks: [
      '50 авто, 5 000 запчастин',
      '10 користувачів, 3 каси',
      'Звіти, експорт, аналітика',
    ],
    ctaLabel: 'Почати 7 днів безкоштовно',
    variant: 'pro',
  },
  {
    name: 'Enterprise',
    price: '$299',
    period: 'місяць',
    description: 'Для мережі розбірок без обмежень',
    perks: [
      'Без лімітів на авто та запчастини',
      'API і мульти-локація',
      'Пріоритетна підтримка',
    ],
    ctaLabel: 'Обрати',
    variant: 'enterprise',
  },
]

const variantStyles: Record<
  PlanVariant,
  { card: string; pill: string; description: string; cta: string; perk: string }
> = {
  lite: {
    card: 'bg-surface-1 ring-1 ring-white/[0.05] text-white',
    pill: 'bg-white/[0.06] text-white ring-1 ring-white/10',
    description: 'text-neutral-500',
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
    description: 'text-neutral-500',
    cta: 'text-white',
    perk: 'text-neutral-300',
  },
}

export function Pricing() {
  return (
    <Section id="pricing" className="py-16 lg:py-24">
      <PageContainer width="md">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-12 text-[40px] leading-[1] font-light tracking-[-0.02em] lg:mb-16 lg:text-[56px]">
            Тарифні плани
          </h2>
          <ul
            role="list"
            className="grid grid-cols-1 gap-4 md:grid-cols-3"
          >
            {plans.map((plan) => (
              <PlanCard key={plan.name} plan={plan} />
            ))}
          </ul>
        </div>
      </PageContainer>
    </Section>
  )
}

function PlanCard({ plan }: { plan: Plan }) {
  const styles = variantStyles[plan.variant]
  const isPro = plan.variant === 'pro'

  return (
    <li
      className={cn(
        'group rounded-(--radius-card) relative flex min-h-[440px] flex-col gap-6 p-8 transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-2xl motion-reduce:transition-none motion-reduce:hover:translate-y-0 lg:p-10',
        styles.card,
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
        <p className="flex items-baseline gap-2 text-[64px] leading-[0.9] font-light tracking-[-0.04em] lg:text-[80px]">
          <span>{plan.price}</span>
          <span className="text-[14px] font-normal opacity-70">
            /{plan.period}
          </span>
        </p>
        {plan.note && (
          <p className="text-[13px] font-medium opacity-80">{plan.note}</p>
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
        to="/login"
        className={cn(
          'mt-auto inline-flex items-center gap-2 text-[13px] font-normal tracking-[0.02em] uppercase transition-opacity hover:opacity-70',
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
