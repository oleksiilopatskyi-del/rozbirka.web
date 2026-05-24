import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  CreditCard,
  Crown,
  LogOut,
  Receipt,
  User as UserIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandLogo } from '@/components/site/brand-logo'
import { billingApi } from '@/api/billing'
import { useAuth } from '@/auth/AuthContext'
import type {
  BillingState,
  LimitUsageDto,
  PagedResult,
  PaymentDto,
  PaymentStatus,
  PublicPlanDto,
  SubscriptionDto,
  Tenant,
  User,
} from '@/api/types'

type Section = 'subscription' | 'plans' | 'payment' | 'billing'

interface NavEntry {
  id: Section
  label: string
  Icon: typeof UserIcon
}

const navEntries: NavEntry[] = [
  { id: 'subscription', label: 'Підписка', Icon: Crown },
  { id: 'plans', label: 'Тарифи', Icon: Receipt },
  { id: 'payment', label: 'Оплата', Icon: CreditCard },
  { id: 'billing', label: 'Білінг', Icon: Receipt },
]

export function AccountScreen() {
  const navigate = useNavigate()
  const auth = useAuth()
  const [section, setSection] = useState<Section>('subscription')
  const [subscription, setSubscription] = useState<SubscriptionDto | null>(null)
  const [plans, setPlans] = useState<PublicPlanDto[]>([])
  const [payments, setPayments] = useState<PagedResult<PaymentDto> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [sub, pay, planList] = await Promise.all([
        billingApi.getSubscription().catch(() => null),
        billingApi.getPayments(1, 10).catch(() => null),
        billingApi.getPlans().catch(() => []),
      ])
      if (cancelled) return
      setSubscription(sub)
      setPayments(pay)
      setPlans(planList)
      if (sub === null && pay === null) {
        setError('Не вдалось завантажити дані. Спробуйте оновити сторінку.')
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleLogout = async () => {
    await auth.signOut()
    navigate('/', { replace: true })
  }

  const refreshSubscription = async () => {
    const sub = await billingApi.getSubscription().catch(() => null)
    setSubscription(sub)
  }

  if (loading) {
    return (
      <div className="bg-background grid min-h-screen place-items-center text-neutral-500">
        <p className="text-[14px]">Завантаження…</p>
      </div>
    )
  }

  return (
    <div className="bg-background flex min-h-screen flex-col text-white lg:flex-row">
      <Sidebar
        active={section}
        onChange={setSection}
        user={auth.user}
        tenant={auth.tenant}
        onLogout={handleLogout}
      />

      <main className="flex-1 px-6 py-10 lg:px-12 lg:py-14">
        <div className="mx-auto max-w-[760px]">
          {error && (
            <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-4 text-[14px] text-red-300">
              {error}
            </div>
          )}
          {section === 'subscription' && (
            <SubscriptionPanel
              subscription={subscription}
              onRefresh={refreshSubscription}
              onSeePlans={() => setSection('plans')}
            />
          )}
          {section === 'plans' && (
            <PlansPanel plans={plans} subscription={subscription} />
          )}
          {section === 'payment' && (
            <PaymentPanel subscription={subscription} />
          )}
          {section === 'billing' && <BillingPanel payments={payments} />}
        </div>
      </main>
    </div>
  )
}

function Sidebar({
  active,
  onChange,
  user,
  tenant,
  onLogout,
}: {
  active: Section
  onChange: (s: Section) => void
  user: User | null
  tenant: Tenant | null
  onLogout: () => void
}) {
  return (
    <aside className="bg-surface-1 flex flex-col gap-10 border-r border-white/[0.06] p-6 lg:w-[280px] lg:p-8">
      <BrandLogo />

      <nav aria-label="Налаштування акаунту">
        <ul role="list" className="flex flex-row gap-1 lg:flex-col lg:gap-1">
          {navEntries.map((entry) => {
            const isActive = active === entry.id
            return (
              <li key={entry.id} className="flex-1 lg:flex-none">
                <button
                  type="button"
                  onClick={() => onChange(entry.id)}
                  className={cn(
                    'flex w-full items-center justify-center gap-3 rounded-full px-4 py-3 text-[14px] transition-colors lg:justify-start lg:px-5',
                    isActive
                      ? 'bg-brand text-brand-foreground'
                      : 'text-neutral-300 hover:bg-white/[0.04] hover:text-white',
                  )}
                >
                  <entry.Icon className="size-4 shrink-0" aria-hidden />
                  <span className="hidden lg:inline">{entry.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="mt-auto hidden flex-col gap-3 lg:flex">
        <div className="flex items-center gap-3 rounded-2xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/[0.06]">
          <div className="bg-brand grid size-9 place-items-center rounded-full">
            <UserIcon className="text-brand-foreground size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-white">
              {user?.displayName || user?.phone || '—'}
            </p>
            <p className="truncate text-[11px] text-neutral-500">
              {tenant?.name ?? '—'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-3 rounded-full px-4 py-3 text-[13px] text-neutral-500 transition-colors hover:bg-white/[0.04] hover:text-white"
        >
          <LogOut className="size-4" aria-hidden />
          Вийти
        </button>
      </div>
    </aside>
  )
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-10 flex flex-col gap-2">
      <h1 className="text-[36px] leading-[1] font-light tracking-[-0.02em] lg:text-[48px]">
        {title}
      </h1>
      {subtitle && (
        <p className="text-[14px] text-neutral-500">{subtitle}</p>
      )}
    </header>
  )
}

function SubscriptionPanel({
  subscription,
  onRefresh,
  onSeePlans,
}: {
  subscription: SubscriptionDto | null
  onRefresh: () => Promise<void>
  onSeePlans: () => void
}) {
  const [busy, setBusy] = useState(false)

  if (!subscription) return <EmptyPanel />

  const stateMeta: Record<BillingState, { label: string }> = {
    none: { label: 'Немає' },
    trial: { label: 'Пробний період' },
    active: { label: 'Активна' },
    pastDue: { label: 'Прострочена' },
    cancelled: { label: 'Скасована' },
    blocked: { label: 'Заблокована' },
  }

  const planLabel =
    subscription.state === 'trial'
      ? (subscription.planName ?? 'Пробний доступ')
      : (subscription.planName ??
        (subscription.state === 'blocked' ? 'Доступ закрито' : 'Без тарифу'))

  const primaryLabel =
    subscription.state === 'trial'
      ? 'Залишилось днів пробного періоду'
      : subscription.state === 'active' || subscription.state === 'pastDue'
        ? 'Наступне списання'
        : subscription.state === 'cancelled'
          ? 'Доступ діє до'
          : 'Поточний період'

  const primaryValue =
    subscription.state === 'trial'
      ? `${subscription.trialDaysRemaining ?? 0} ${dayWord(
          subscription.trialDaysRemaining ?? 0,
        )}`
      : subscription.nextChargeAt
        ? formatDate(subscription.nextChargeAt)
        : subscription.currentPeriodEnd
          ? formatDate(subscription.currentPeriodEnd)
          : '—'

  const handleSubscribe = async () => {
    setBusy(true)
    try {
      const { checkoutUrl } = await billingApi.subscribe()
      window.location.href = checkoutUrl
    } catch {
      setBusy(false)
    }
  }

  const handleCancel = async () => {
    if (!confirm('Скасувати підписку?')) return
    setBusy(true)
    try {
      await billingApi.cancel()
      await onRefresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <Header
        title="Підписка"
        subtitle="Керуй своїм планом та статусом доступу"
      />

      <div className="bg-brand text-brand-foreground rounded-(--radius-card) flex flex-col gap-8 p-8 lg:p-10">
        <div className="flex flex-col gap-3">
          <span className="inline-flex w-fit items-center rounded-full bg-black/15 px-3 py-1.5 text-[11px] font-medium tracking-[0.05em] uppercase">
            {stateMeta[subscription.state].label}
          </span>
          <p className="text-[48px] leading-[1] font-light tracking-[-0.03em] lg:text-[64px]">
            {planLabel}
          </p>
          {typeof subscription.amount === 'number' && (
            <p className="text-[15px] opacity-75">
              {subscription.state === 'trial'
                ? `Після пробного — ${formatAmount(
                    subscription.amount,
                    subscription.currency ?? 'USD',
                  )} / місяць`
                : `${formatAmount(
                    subscription.amount,
                    subscription.currency ?? 'USD',
                  )} / місяць`}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-[14px] opacity-70">{primaryLabel}</p>
          <p className="text-[32px] font-light tabular-nums">{primaryValue}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          {(subscription.canSubscribe || subscription.canReactivate) && (
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={busy}
              className="inline-flex h-14 w-fit items-center gap-3 rounded-full bg-black px-7 text-[15px] text-white transition-colors hover:bg-black/80 disabled:opacity-50"
            >
              {subscription.canReactivate
                ? 'Поновити підписку'
                : 'Активувати підписку'}
            </button>
          )}
          {subscription.canCancel && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy}
              className="inline-flex h-14 w-fit items-center gap-3 rounded-full px-7 text-[15px] text-black ring-1 ring-black/30 transition-colors hover:bg-black/10 disabled:opacity-50"
            >
              Скасувати
            </button>
          )}
          <button
            type="button"
            onClick={onSeePlans}
            className="inline-flex h-14 w-fit items-center gap-3 rounded-full px-7 text-[15px] text-black/80 transition-colors hover:text-black"
          >
            Дивитись тарифи
          </button>
        </div>
      </div>

      <UsageBlock usage={subscription.usage} />
    </div>
  )
}

function UsageBlock({ usage }: { usage: SubscriptionDto['usage'] }) {
  const items: { label: string; data: LimitUsageDto }[] = [
    { label: 'Авто', data: usage.cars },
    { label: 'Партії', data: usage.intakes },
    { label: 'Запчастини', data: usage.parts },
    { label: 'Команда', data: usage.users },
    { label: 'Каси', data: usage.cashRegisters },
  ]

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[18px] font-medium">Використання</h2>
      <ul role="list" className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.label}
            className="bg-surface-1 flex flex-col gap-3 rounded-2xl p-5 ring-1 ring-white/[0.04]"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-neutral-400">{item.label}</span>
              <span className="text-[13px] tabular-nums text-neutral-300">
                {item.data.used}
                {item.data.max !== null && (
                  <span className="text-neutral-600"> / {item.data.max}</span>
                )}
                {item.data.max === null && (
                  <span className="text-neutral-600"> / ∞</span>
                )}
              </span>
            </div>
            <UsageBar used={item.data.used} max={item.data.max} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function UsageBar({ used, max }: { used: number; max: number | null }) {
  if (max === null) {
    return (
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div className="bg-brand/40 h-full w-full" />
      </div>
    )
  }
  const ratio = max === 0 ? 0 : Math.min(used / max, 1)
  const color =
    ratio >= 1
      ? 'bg-red-500'
      : ratio >= 0.8
        ? 'bg-amber-400'
        : 'bg-brand'
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className={cn('h-full transition-all duration-500', color)}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  )
}

function PlansPanel({
  plans,
  subscription,
}: {
  plans: PublicPlanDto[]
  subscription: SubscriptionDto | null
}) {
  const [busy, setBusy] = useState(false)

  if (plans.length === 0) return <EmptyPanel />

  const currentCode = subscription?.planCode
  const recommendedCode = 'pro_monthly'

  const handleSubscribe = async () => {
    setBusy(true)
    try {
      const { checkoutUrl } = await billingApi.subscribe()
      window.location.href = checkoutUrl
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <Header title="Тарифи" subtitle="Обери план, що підходить твоєму бізнесу" />

      <ul role="list" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.code === currentCode
          const isRecommended = plan.code === recommendedCode
          return (
            <li
              key={plan.code}
              className={cn(
                'rounded-(--radius-card) flex flex-col gap-6 p-6 lg:p-8',
                isRecommended
                  ? 'bg-brand text-brand-foreground'
                  : 'bg-surface-1 text-white ring-1 ring-white/[0.05]',
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
                {isCurrent && (
                  <span className="text-[11px] uppercase tracking-[0.05em] opacity-70">
                    Поточний
                  </span>
                )}
              </div>

              <p className="flex items-baseline gap-1 text-[44px] leading-[0.9] font-light tracking-[-0.03em]">
                <span>{formatAmount(plan.amount, plan.currency)}</span>
                <span className="text-[13px] font-normal opacity-70">
                  /міс
                </span>
              </p>

              <ul role="list" className="flex flex-col gap-2 text-[13px]">
                <PlanLimit label="Авто" value={plan.limits.cars} />
                <PlanLimit label="Партії" value={plan.limits.intakes} />
                <PlanLimit label="Запчастини" value={plan.limits.parts} />
                <PlanLimit label="Команда" value={plan.limits.users} />
                <PlanLimit label="Каси" value={plan.limits.cashRegisters} />
              </ul>

              <button
                type="button"
                disabled={isCurrent || busy}
                onClick={handleSubscribe}
                className={cn(
                  'mt-auto inline-flex h-12 items-center justify-center rounded-full text-[14px] transition-colors disabled:opacity-50',
                  isCurrent
                    ? 'cursor-default bg-white/[0.06] text-neutral-400'
                    : isRecommended
                      ? 'bg-black text-white hover:bg-black/80'
                      : 'bg-white text-black hover:bg-white/90',
                )}
              >
                {isCurrent
                  ? 'Поточний тариф'
                  : plan.trialDays > 0
                    ? `Спробувати ${plan.trialDays} днів`
                    : 'Обрати'}
              </button>
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

function PaymentPanel({
  subscription,
}: {
  subscription: SubscriptionDto | null
}) {
  if (!subscription) return <EmptyPanel />

  const hasCard = Boolean(subscription.cardLast4)

  return (
    <div className="flex flex-col gap-8">
      <Header title="Оплата" subtitle="Карта, з якої списується підписка" />

      <div className="bg-surface-1 rounded-(--radius-card) flex flex-col gap-6 p-8 ring-1 ring-white/[0.04] lg:p-10">
        {hasCard ? (
          <div className="flex items-center gap-4">
            <div className="bg-brand/10 ring-brand/30 grid size-14 place-items-center rounded-2xl ring-1">
              <CreditCard className="text-brand size-6" aria-hidden />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-[20px] font-medium tabular-nums">
                {(subscription.cardBrand ?? 'Card').toUpperCase()} ••••{' '}
                {subscription.cardLast4}
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
    </div>
  )
}

function BillingPanel({
  payments,
}: {
  payments: PagedResult<PaymentDto> | null
}) {
  if (!payments || payments.items.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <Header title="Білінг" subtitle="Історія платежів і чеки" />
        <p className="text-[14px] text-neutral-500">Платежів ще не було.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <Header title="Білінг" subtitle="Історія платежів і чеки" />

      <div className="bg-surface-1 rounded-(--radius-card) ring-1 ring-white/[0.04]">
        <ul role="list" className="divide-y divide-white/[0.04]">
          {payments.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-4 px-6 py-5 lg:px-8 lg:py-6"
            >
              <div className="flex flex-col gap-1">
                <p className="text-[15px] font-medium tabular-nums">
                  {formatAmount(item.amount, item.currency)}
                </p>
                <p className="text-[12px] text-neutral-500 tabular-nums">
                  {formatDate(item.createdAt)} · {paymentTypeLabel(item.type)}
                </p>
              </div>
              <PaymentStatusBadge status={item.status} />
            </li>
          ))}
        </ul>
      </div>
    </div>
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
      label: 'Скасовано',
      cls: 'bg-neutral-500/10 text-neutral-400 ring-neutral-500/30',
    },
  }
  const entry = map[status]
  return (
    <span className={cn('rounded-full px-3 py-1 text-[12px] ring-1', entry.cls)}>
      {entry.label}
    </span>
  )
}

function EmptyPanel() {
  return (
    <p className="text-[14px] text-neutral-500">
      Дані недоступні. Спробуйте оновити сторінку.
    </p>
  )
}

function paymentTypeLabel(t: PaymentDto['type']): string {
  switch (t) {
    case 'checkout':
      return 'Перший платіж'
    case 'recurring':
      return 'Регулярне списання'
    case 'verification':
      return 'Верифікація'
    default:
      return t
  }
}

function dayWord(n: number): string {
  const last = n % 10
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return 'днів'
  if (last === 1) return 'день'
  if (last >= 2 && last <= 4) return 'дні'
  return 'днів'
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatAmount(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (typeof amount !== 'number') return '—'
  const formatted = amount.toLocaleString('uk-UA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const upper = (currency ?? '').toUpperCase()
  const symbol = upper === 'UAH' ? '₴' : upper === 'USD' ? '$' : upper
  return upper === 'USD' ? `${symbol}${formatted}` : `${formatted} ${symbol}`.trim()
}
