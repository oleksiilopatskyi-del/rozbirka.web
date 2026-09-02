import { Link } from 'react-router'
import { Button, Notice, type NoticeTone } from '@/components/app'
import type { Tenant } from '@/api/types'
import type { TenantAccessSnapshot } from '../access-types'
import { getDashboardBillingPath } from './dashboard-billing-access'

interface BillingGuidance {
  title: string
  message: string
  tone: NoticeTone
  urgent: boolean
}

/**
 * The one thing allowed to interrupt the dashboard. It appears only when the
 * subscription needs a decision, and it carries the single action that ends it.
 */
export function DashboardBillingBanner({
  snapshot,
  tenant,
}: {
  snapshot: TenantAccessSnapshot
  tenant: Pick<Tenant, 'slug'>
}) {
  const guidance = getBillingGuidance(snapshot)
  if (guidance === null) return null

  const billingPath = getDashboardBillingPath(snapshot, tenant)

  return (
    <Notice
      action={
        billingPath === null ? undefined : (
          <Button asChild variant={guidance.urgent ? 'primary' : 'ghost'}>
            <Link to={billingPath}>Перейти до підписки</Link>
          </Button>
        )
      }
      block
      role={guidance.urgent ? 'alert' : 'status'}
      tone={guidance.tone}
    >
      <p className="font-medium text-white">{guidance.title}</p>
      <p className="text-app-muted mt-0.5">{guidance.message}</p>
    </Notice>
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
        tone: 'info',
        urgent: false,
      }
    case 'pastDue':
      return {
        title: 'Потрібна оплата',
        message: 'Оновіть спосіб оплати, щоб зберегти доступ до розбірки.',
        tone: 'danger',
        urgent: true,
      }
    case 'cancelled':
      return {
        title: 'Підписку скасовано',
        message: 'Оберіть тариф, щоб продовжити користуватися сервісом.',
        tone: 'warn',
        urgent: true,
      }
    case 'blocked':
      return {
        title: 'Доступ призупинено',
        message: 'Оновіть підписку, щоб відновити доступ до розбірки.',
        tone: 'danger',
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
    : `Пробний період триває ще ${String(days)} ${dayWord(days)}. Оберіть тариф, щоб не втратити доступ.`
}

function dayWord(days: number): string {
  const tens = days % 100
  const units = days % 10
  if (tens >= 11 && tens <= 14) return 'днів'
  if (units === 1) return 'день'
  if (units >= 2 && units <= 4) return 'дні'
  return 'днів'
}

function quotaGuidance(snapshot: TenantAccessSnapshot): BillingGuidance | null {
  const exhausted = Object.entries(snapshot.entitlement?.usage ?? {}).find(
    ([, usage]) => usage.max != null && usage.used >= usage.max,
  )
  if (exhausted === undefined) return null

  const [resource, usage] = exhausted
  const labels: Record<string, string> = {
    cars: 'авто',
    intakes: 'приймань',
    parts: 'запчастин',
    users: 'користувачів',
    cashRegisters: 'кас',
  }
  return {
    title: `Ліміт ${labels[resource] ?? 'ресурсу'} вичерпано`,
    message: `Використано ${String(usage.used)} із ${String(usage.max)}. Оберіть тариф із більшим лімітом, щоб продовжити роботу.`,
    tone: 'warn',
    urgent: true,
  }
}
