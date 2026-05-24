import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Section } from '@/components/layout/section'
import { PageContainer } from '@/components/layout/page-container'

type PlanVariant = 'free' | 'pro'

interface Plan {
  name: string
  price: string
  period: string
  description: string
  ctaLabel: string
  variant: PlanVariant
}

const plans: Plan[] = [
  {
    name: 'Безкоштовний',
    price: '$0',
    period: 'перший тиждень',
    description: 'Спробуйте можливості сервісу',
    ctaLabel: 'Спробувати тариф',
    variant: 'free',
  },
  {
    name: 'Profesional',
    price: '$59',
    period: 'місяць',
    description: 'Найпопулярніший вибір',
    ctaLabel: 'Спробувати тариф',
    variant: 'pro',
  },
]

const variantStyles: Record<
  PlanVariant,
  { card: string; pill: string; description: string; cta: string }
> = {
  free: {
    card: 'bg-surface-1 ring-1 ring-white/[0.05] text-white',
    pill: 'bg-white/[0.06] text-white ring-1 ring-white/10',
    description: 'text-neutral-500',
    cta: 'text-white',
  },
  pro: {
    card: 'bg-brand text-brand-foreground',
    pill: 'bg-black/15 text-black ring-1 ring-black/10',
    description: 'text-black/70',
    cta: 'text-black',
  },
}

export function Pricing() {
  return (
    <Section id="pricing" className="py-16 lg:py-24">
      <PageContainer width="md">
        <div className="mx-auto max-w-[1000px]">
          <h2 className="mb-12 text-[40px] leading-[1] font-light tracking-[-0.02em] lg:mb-16 lg:text-[56px]">
            Тарифні плани
          </h2>
          <ul role="list" className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
  return (
    <li
      className={cn(
        'group rounded-(--radius-card) relative flex min-h-[360px] flex-col items-center justify-center gap-7 p-10 text-center transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-2xl motion-reduce:transition-none motion-reduce:hover:translate-y-0 lg:p-12',
        styles.card,
      )}
    >
      <span
        className={cn(
          'absolute top-6 left-6 inline-flex w-fit items-center rounded-full px-4 py-2 text-[12px] tracking-[0.02em]',
          styles.pill,
        )}
      >
        {plan.name}
      </span>

      <div className="flex flex-col items-center gap-3">
        <p className="flex items-baseline gap-2 text-[80px] leading-[0.9] font-light tracking-[-0.04em] lg:text-[112px]">
          <span>{plan.price}</span>
        </p>
        <p className="text-[14px] opacity-70 lg:text-[15px]">
          /{plan.period}
        </p>
      </div>

      <p className={cn('text-[13px] lg:text-[14px]', styles.description)}>
        {plan.description}
      </p>

      <a
        href="#download"
        className={cn(
          'absolute right-6 bottom-6 inline-flex items-center gap-2 text-[13px] font-normal tracking-[0.02em] uppercase transition-opacity hover:opacity-70',
          styles.cta,
        )}
      >
        <span>{plan.ctaLabel}</span>
        <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
      </a>
    </li>
  )
}
