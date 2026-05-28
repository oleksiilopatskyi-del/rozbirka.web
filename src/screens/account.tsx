import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import {
  ArrowRight,
  Check,
  ChevronsUpDown,
  CreditCard,
  Crown,
  LogOut,
  Receipt,
  Store,
  User as UserIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandLogo } from '@/components/site/brand-logo'
import { billingApi } from '@/api/billing'
import { tenantsApi } from '@/api/tenants'
import { tokens } from '@/api/tokens'
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

  const activeTenantId = auth.tenant?.id

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
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
  }, [activeTenantId])

  const handleLogout = async () => {
    await auth.signOut()
    navigate('/', { replace: true })
  }

  const refreshSubscription = async () => {
    const sub = await billingApi.getSubscription().catch(() => null)
    setSubscription(sub)
  }

  const refreshPayments = async () => {
    const pay = await billingApi.getPayments(1, 10).catch(() => null)
    setPayments(pay)
  }

  if (loading) {
    return (
      <div className="bg-background grid min-h-screen place-items-center text-neutral-500">
        <p className="text-[14px]">Завантаження…</p>
      </div>
    )
  }

  // Fresh user with no розбірка yet → onboarding.
  if (auth.tenants.length === 0) {
    return <OnboardingScreen onLogout={handleLogout} onCreated={auth.hydrate} />
  }

  return (
    <div className="bg-background flex min-h-screen flex-col text-white lg:flex-row">
      <Sidebar
        active={section}
        onChange={setSection}
        user={auth.user}
        tenant={auth.tenant}
        tenants={auth.tenants}
        onSwitchTenant={auth.switchTenant}
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
          {section === 'billing' && (
            <BillingPanel payments={payments} onRefresh={refreshPayments} />
          )}
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
  tenants,
  onSwitchTenant,
  onLogout,
}: {
  active: Section
  onChange: (s: Section) => void
  user: User | null
  tenant: Tenant | null
  tenants: Tenant[]
  onSwitchTenant: (id: string) => void
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

      <div className="mt-auto flex flex-col gap-3">
        <TenantSwitcher
          tenant={tenant}
          tenants={tenants}
          user={user}
          onSwitch={onSwitchTenant}
        />
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

function OnboardingScreen({
  onCreated,
  onLogout,
}: {
  onCreated: () => Promise<void>
  onLogout: () => void
}) {
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (name.trim().length < 2) {
      setError('Введіть назву розбірки')
      return
    }
    setBusy(true)
    try {
      const res = await tenantsApi.create({
        tenantName: name.trim(),
        ...(city.trim() ? { city: city.trim() } : {}),
      })
      tokens.setTenant(res.tenantId)
      await onCreated()
    } catch {
      setError('Не вдалося створити розбірку. Спробуйте ще раз.')
      setBusy(false)
    }
  }

  return (
    <div className="bg-background relative flex min-h-screen flex-col text-white">
      <header className="flex items-center justify-between px-6 py-6 lg:px-10">
        <BrandLogo />
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-2 text-[13px] text-neutral-400 transition-colors hover:text-white"
        >
          <LogOut className="size-4" aria-hidden />
          Вийти
        </button>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="anim-fade-up w-full max-w-[460px]">
          <div className="flex flex-col gap-3">
            <span className="text-brand text-[11px] font-medium tracking-[0.28em] uppercase">
              Перший крок
            </span>
            <h1 className="text-[40px] leading-[0.95] font-light tracking-[-0.025em] lg:text-[52px]">
              Створіть<br />
              <span className="text-brand">свою розбірку</span>
            </h1>
            <p className="max-w-[360px] text-[14px] leading-[1.5] text-neutral-500">
              Це ваш робочий простір — авто, склад, продажі й команда. Далі
              активуєте 7 днів безкоштовно.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="tenant-name"
                className="text-[12px] text-neutral-500"
              >
                Назва розбірки
              </label>
              <input
                id="tenant-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder="Напр. CarDubliany"
                className="bg-surface-1 placeholder:text-neutral-600 focus:ring-brand h-14 rounded-2xl px-5 text-[16px] text-white ring-1 ring-white/10 transition-all outline-none focus:ring-2"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="tenant-city" className="text-[12px] text-neutral-500">
                Місто <span className="text-neutral-600">(необовʼязково)</span>
              </label>
              <input
                id="tenant-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Львів"
                className="bg-surface-1 placeholder:text-neutral-600 focus:ring-brand h-14 rounded-2xl px-5 text-[16px] text-white ring-1 ring-white/10 transition-all outline-none focus:ring-2"
              />
            </div>

            {error && (
              <p role="alert" className="text-[13px] text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="bg-brand hover:bg-brand-hover text-brand-foreground group mt-2 inline-flex h-14 items-center justify-center gap-3 rounded-full text-[15px] transition-all duration-300 hover:scale-[1.01] disabled:opacity-60"
            >
              <span>{busy ? 'Створюємо…' : 'Створити розбірку'}</span>
              {!busy && (
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              )}
            </button>
          </form>
        </div>
      </main>

      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 [background:radial-gradient(80%_60%_at_50%_0%,rgba(247,116,37,0.12),transparent_60%)]"
      />
    </div>
  )
}

function TenantSwitcher({
  tenant,
  tenants,
  user,
  onSwitch,
}: {
  tenant: Tenant | null
  tenants: Tenant[]
  user: User | null
  onSwitch: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const subtitle = tenant?.name ?? user?.phone ?? '—'

  // Single розбірка → static card, no switcher.
  if (tenants.length <= 1) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/[0.06]">
        <div className="bg-brand grid size-9 place-items-center rounded-full">
          <UserIcon className="text-brand-foreground size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-white">
            {user?.displayName || user?.phone || '—'}
          </p>
          <p className="truncate text-[11px] text-neutral-500">{subtitle}</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.03] px-4 py-3 text-left ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.06]"
      >
        <div className="bg-brand grid size-9 shrink-0 place-items-center rounded-full">
          <Store className="text-brand-foreground size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-white">
            {tenant?.name ?? 'Оберіть розбірку'}
          </p>
          <p className="truncate text-[11px] text-neutral-500">
            {user?.displayName || user?.phone || '—'}
          </p>
        </div>
        <ChevronsUpDown
          className="size-4 shrink-0 text-neutral-500"
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="bg-surface-2 absolute bottom-[calc(100%+8px)] left-0 z-20 flex w-full flex-col gap-1 rounded-2xl p-2 shadow-2xl ring-1 ring-white/10"
        >
          <p className="px-3 pt-1 pb-2 text-[11px] tracking-[0.05em] text-neutral-500 uppercase">
            Розбірки
          </p>
          {tenants.map((t) => {
            const isCurrent = t.id === tenant?.id
            return (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={isCurrent}
                onClick={() => {
                  onSwitch(t.id)
                  setOpen(false)
                }}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors',
                  isCurrent
                    ? 'bg-white/[0.06] text-white'
                    : 'text-neutral-300 hover:bg-white/[0.04] hover:text-white',
                )}
              >
                <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.06]">
                  <Store className="size-3.5" aria-hidden />
                </div>
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                {isCurrent && (
                  <Check className="text-brand size-4 shrink-0" aria-hidden />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-10 flex flex-col gap-2">
      <h1 className="text-[36px] leading-[1] font-light tracking-[-0.02em] lg:text-[48px]">
        {title}
      </h1>
      {subtitle && <p className="text-[14px] text-neutral-500">{subtitle}</p>}
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

  // Fresh tenant that hasn't activated its trial yet → present the card as a
  // trial invitation rather than an empty "no plan" state.
  const offerTrial = subscription.canActivateTrial
  // Trial spent / subscription lapsed → access closed, must pick a paid plan.
  // We do NOT auto-send to Mono checkout; the user chooses a tier on /tarifs.
  const accessEnded = subscription.state === 'blocked' && !offerTrial

  const stateMeta: Record<BillingState, { label: string }> = {
    none: { label: 'Початок' },
    trial: { label: 'Пробний період' },
    active: { label: 'Активна' },
    pastDue: { label: 'Прострочена' },
    cancelled: { label: 'Скасована' },
    blocked: { label: 'Доступ закрито' },
  }

  const badgeLabel = offerTrial
    ? 'Пробний доступ'
    : stateMeta[subscription.state].label

  const planLabel = offerTrial
    ? '7 днів безкоштовно'
    : accessEnded
      ? 'Доступ закрито'
      : subscription.state === 'trial'
        ? (subscription.planName ?? 'Пробний доступ')
        : (subscription.planName ?? 'Без тарифу')

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
      window.location.assign(checkoutUrl)
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

  const handleActivateTrial = async () => {
    setBusy(true)
    try {
      await billingApi.activateTrial()
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
            {badgeLabel}
          </span>
          <p className="text-[48px] leading-[1] font-light tracking-[-0.03em] lg:text-[64px]">
            {planLabel}
          </p>
          {offerTrial ? (
            <p className="text-[15px] opacity-75">
              Повний доступ до Pro. Без картки.
            </p>
          ) : subscription.state === 'trial' ? (
            <p className="text-[15px] opacity-75">7 днів безкоштовно</p>
          ) : (
            !accessEnded &&
            typeof subscription.amount === 'number' && (
              <p className="text-[15px] opacity-75">
                {formatAmount(
                  subscription.amount,
                  subscription.currency ?? 'USD',
                )}{' '}
                / місяць
              </p>
            )
          )}
        </div>

        {accessEnded ? (
          <div className="rounded-2xl bg-black/15 px-5 py-4">
            <p className="text-[14px] leading-[1.5]">
              Пробний період завершився. Щоб продовжити користуватись —
              оформіть підписку: оберіть тариф нижче.
            </p>
          </div>
        ) : (
          !offerTrial && (
            <div className="flex flex-col gap-1">
              <p className="text-[14px] opacity-70">{primaryLabel}</p>
              <p className="text-[32px] font-light tabular-nums">
                {primaryValue}
              </p>
            </div>
          )
        )}

        <div className="flex flex-wrap gap-3">
          {subscription.canActivateTrial && (
            <button
              type="button"
              onClick={handleActivateTrial}
              disabled={busy}
              className="inline-flex h-14 w-fit items-center gap-3 rounded-full bg-black px-7 text-[15px] text-white transition-colors hover:bg-black/80 disabled:opacity-50"
            >
              Активувати 7 днів безкоштовно
            </button>
          )}
          {/* "Поновити" only for a still-active cancelled sub — never blocked. */}
          {subscription.canReactivate && subscription.state !== 'blocked' && (
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={busy}
              className="inline-flex h-14 w-fit items-center gap-3 rounded-full bg-black px-7 text-[15px] text-white transition-colors hover:bg-black/80 disabled:opacity-50"
            >
              Поновити підписку
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
            className={cn(
              'inline-flex h-14 w-fit items-center gap-3 rounded-full px-7 text-[15px] transition-colors',
              subscription.canActivateTrial ||
                (subscription.canReactivate &&
                  subscription.state !== 'blocked')
                ? 'text-black/80 hover:text-black'
                : 'bg-black text-white hover:bg-black/80',
            )}
          >
            {accessEnded ? 'Оформити підписку' : 'Дивитись тарифи'}
          </button>
        </div>
      </div>

      <UsageBlock usage={subscription.usage} onUpgrade={onSeePlans} />
    </div>
  )
}

function isOver(u: LimitUsageDto): boolean {
  return u.max !== null && u.used > u.max
}

function UsageBlock({
  usage,
  onUpgrade,
}: {
  usage: SubscriptionDto['usage']
  onUpgrade: () => void
}) {
  const items: { label: string; data: LimitUsageDto }[] = [
    { label: 'Авто', data: usage.cars },
    { label: 'Партії', data: usage.intakes },
    { label: 'Запчастини', data: usage.parts },
    { label: 'Команда', data: usage.users },
    { label: 'Каси', data: usage.cashRegisters },
  ]

  const overItems = items.filter((i) => isOver(i.data))

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[18px] font-medium">Використання</h2>

      {overItems.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] leading-[1.5] text-amber-200/90">
            Перевищено ліміт тарифу:{' '}
            {overItems
              .map((i) => `${i.label} ${i.data.used}/${i.data.max ?? '∞'}`)
              .join(', ')}
            . Наявні дані лишаються доступними, але додавати нові не вийде, поки
            не повернетесь у межі.
          </p>
          <button
            type="button"
            onClick={onUpgrade}
            className="bg-brand hover:bg-brand-hover text-brand-foreground inline-flex h-10 shrink-0 items-center justify-center rounded-full px-5 text-[13px] transition-colors"
          >
            Підвищити тариф
          </button>
        </div>
      )}

      <ul role="list" className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((item) => {
          const over = isOver(item.data)
          return (
            <li
              key={item.label}
              className="bg-surface-1 flex flex-col gap-3 rounded-2xl p-5 ring-1 ring-white/[0.04]"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-neutral-400">
                  {item.label}
                </span>
                <span
                  className={cn(
                    'text-[13px] tabular-nums',
                    over ? 'text-amber-300' : 'text-neutral-300',
                  )}
                >
                  {item.data.used}
                  {item.data.max !== null ? (
                    <span className={over ? 'text-amber-300/60' : 'text-neutral-600'}>
                      {' '}
                      / {item.data.max}
                    </span>
                  ) : (
                    <span className="text-neutral-600"> / ∞</span>
                  )}
                </span>
              </div>
              <UsageBar used={item.data.used} max={item.data.max} />
            </li>
          )
        })}
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
    ratio >= 1 ? 'bg-red-500' : ratio >= 0.8 ? 'bg-amber-400' : 'bg-brand'
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

  const handleSubscribe = async (planCode: string) => {
    setBusy(true)
    try {
      const { checkoutUrl } = await billingApi.subscribe({ planCode })
      window.location.assign(checkoutUrl)
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <Header
        title="Тарифи"
        subtitle="Обери план, що підходить твоєму бізнесу"
      />

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
                <span className="text-[13px] font-normal opacity-70">/міс</span>
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
                onClick={() => handleSubscribe(plan.code)}
                className={cn(
                  'mt-auto inline-flex h-12 items-center justify-center rounded-full text-[14px] transition-colors disabled:opacity-50',
                  isCurrent
                    ? 'cursor-default bg-white/[0.06] text-neutral-400'
                    : isRecommended
                      ? 'bg-black text-white hover:bg-black/80'
                      : 'bg-white text-black hover:bg-white/90',
                )}
              >
                {isCurrent ? 'Поточний тариф' : 'Обрати'}
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
  onRefresh,
}: {
  payments: PagedResult<PaymentDto> | null
  onRefresh: () => Promise<void>
}) {
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const cancel = async (paymentId: string) => {
    setCancellingId(paymentId)
    try {
      await billingApi.cancelPayment(paymentId)
      await onRefresh()
    } catch {
      // Backend already validated; surface nothing for now — toast can come later.
    } finally {
      setCancellingId(null)
    }
  }

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
              <div className="flex items-center gap-3">
                {item.status === 'pending' && item.checkoutUrl && (
                  <a
                    href={item.checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-white/[0.06] px-3 py-1 text-[12px] font-medium text-white ring-1 ring-white/[0.08] hover:bg-white/[0.10] transition"
                  >
                    Продовжити оплату
                  </a>
                )}
                {item.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => cancel(item.id)}
                    disabled={cancellingId === item.id}
                    className="rounded-full px-3 py-1 text-[12px] font-medium text-red-300 ring-1 ring-red-500/30 hover:bg-red-500/10 transition disabled:opacity-50"
                  >
                    {cancellingId === item.id ? 'Скасування…' : 'Скасувати'}
                  </button>
                )}
                <PaymentStatusBadge status={item.status} />
              </div>
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
  return upper === 'USD'
    ? `${symbol}${formatted}`
    : `${formatted} ${symbol}`.trim()
}
