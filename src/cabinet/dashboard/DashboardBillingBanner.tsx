import { Link } from 'react-router'
import type { Tenant } from '@/api/types'
import type { TenantAccessSnapshot } from '../access-types'
import { cabinetPath } from '../cabinet-paths'
import { cabinetModules } from '../module-registry'
import { evaluateModuleAccess } from '../policy'

interface BillingGuidance {
  title: string
  message: string
  urgent: boolean
}

export function DashboardBillingBanner({
  snapshot,
  tenant,
}: {
  snapshot: TenantAccessSnapshot
  tenant: Pick<Tenant, 'slug'>
}) {
  const guidance = getBillingGuidance(snapshot)
  if (guidance === null) return null

  const billingAllowed =
    evaluateModuleAccess(
      cabinetModules.billing,
      { status: 'ready', snapshot, error: null },
      'view',
    ).kind === 'allowed'

  return (
    <section
      className="rounded-2xl border border-white/[0.08] p-4"
      role={guidance.urgent ? 'alert' : 'status'}
    >
      <h2 className="font-medium text-white">{guidance.title}</h2>
      <p className="mt-1 text-sm text-neutral-400">{guidance.message}</p>
      {billingAllowed ? (
        <Link
          className="mt-3 inline-flex min-h-11 items-center rounded-full border border-white/[0.12] px-4 text-sm text-white"
          to={cabinetPath(tenant.slug, 'billing')}
        >
          Перейти до підписки
        </Link>
      ) : null}
    </section>
  )
}

function getBillingGuidance(
  snapshot: TenantAccessSnapshot,
): BillingGuidance | null {
  const state = snapshot.entitlement?.state ?? snapshot.subscription?.state
  if (state === undefined) return null

  switch (state) {
    case 'trial':
      return {
        title: 'Пробний період',
        message: trialMessage(snapshot),
        urgent: false,
      }
    case 'pastDue':
      return {
        title: 'Потрібна оплата',
        message: 'Оновіть спосіб оплати, щоб зберегти доступ до розбірки.',
        urgent: true,
      }
    case 'cancelled':
      return {
        title: 'Підписку скасовано',
        message: 'Оберіть тариф, щоб продовжити користуватися сервісом.',
        urgent: true,
      }
    case 'blocked':
      return {
        title: 'Доступ призупинено',
        message: 'Оновіть підписку, щоб відновити доступ до розбірки.',
        urgent: true,
      }
    default:
      return quotaGuidance(snapshot)
  }
}

function trialMessage(snapshot: TenantAccessSnapshot): string {
  const days = snapshot.subscription?.trialDaysRemaining
  return days === null || days === undefined
    ? 'Керуйте тарифом до завершення пробного періоду.'
    : `До завершення пробного періоду: ${days}.`
}

function quotaGuidance(snapshot: TenantAccessSnapshot): BillingGuidance | null {
  const exhausted = Object.entries(snapshot.entitlement?.usage ?? {}).find(
    ([, usage]) => usage.max !== null && usage.used >= usage.max,
  )
  if (exhausted === undefined) return null

  const [resource] = exhausted
  const labels: Record<string, string> = {
    cars: 'авто',
    intakes: 'приймань',
    parts: 'запчастин',
    users: 'користувачів',
    cashRegisters: 'кас',
  }
  return {
    title: `Ліміт ${labels[resource] ?? 'ресурсу'} вичерпано`,
    message: 'Оберіть тариф із більшим лімітом, щоб продовжити роботу.',
    urgent: true,
  }
}
