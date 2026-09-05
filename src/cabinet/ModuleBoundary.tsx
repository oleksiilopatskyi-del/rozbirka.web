import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AlertTriangle } from 'lucide-react'
import {
  Button,
  DeniedState,
  SkeletonRows,
  StateScreen,
} from '@/components/app'
import { cabinetPath } from './cabinet-paths'
import { useCabinet } from './CabinetContext'
import {
  cabinetModules,
  type CabinetModuleDefinition,
  type CabinetModuleKey,
} from './module-registry'
import { evaluateModuleAccess, type ModuleAccessDecision } from './policy'
import {
  FeatureUnavailableScreen,
  ModuleUnavailableScreen,
} from './screens/module-unavailable'
import type { TenantAccessState } from './access-types'

export interface CabinetModuleScreenProps {
  definition: CabinetModuleDefinition
}

export interface ModuleBoundaryProps {
  module: CabinetModuleKey
  screen: ComponentType<CabinetModuleScreenProps>
}

const LazyCabinetModuleScreen = lazy(async () => {
  const { CabinetModuleScreen } = await import('./screens/cabinet-state')
  return { default: CabinetModuleScreen }
})

export function CabinetModuleRoute({ module }: { module: CabinetModuleKey }) {
  return <ModuleBoundary module={module} screen={LazyCabinetModuleScreen} />
}

export function ModuleBoundary({
  module,
  screen: Screen,
}: ModuleBoundaryProps) {
  const cabinet = useCabinet()
  const definition = cabinetModules[module]
  const access = cabinetAccessState(cabinet)
  const decision = evaluateModuleAccess(definition, access, 'view')

  if (decision.kind === 'allowed') {
    return (
      <Suspense fallback={<SkeletonRows label="Завантажуємо модуль…" />}>
        <Screen definition={definition} />
      </Suspense>
    )
  }

  return decisionScreen(definition, decision)
}

function cabinetAccessState(
  cabinet: ReturnType<typeof useCabinet>,
): TenantAccessState {
  if (cabinet.status === 'ready' && cabinet.snapshot !== null) {
    return { status: 'ready', snapshot: cabinet.snapshot, error: null }
  }
  if (cabinet.status === 'error') {
    return { status: 'error', snapshot: null, error: cabinet.error }
  }
  return { status: 'loading', snapshot: null, error: null }
}

function decisionScreen(
  definition: CabinetModuleDefinition,
  decision: Exclude<ModuleAccessDecision, { kind: 'allowed' }>,
) {
  switch (decision.kind) {
    case 'unreleased':
      return <ModuleUnavailableScreen definition={definition} />
    case 'feature-unavailable':
      return <FeatureUnavailableScreen definition={definition} />
    case 'permission-denied':
      return (
        <DeniedState
          description="Доступ до цього розділу відкриває власник розбірки в «Команді»."
          title="Недостатньо прав"
        />
      )
    case 'subscription-blocked':
      return (
        <BoundaryStateScreen
          action={<BillingLink label="Перейти до підписки" module="billing" />}
          description="Поки підписка неактивна, розділ доступний лише для перегляду історії в білінгу."
          title="Підписка потребує уваги"
          tone="warn"
        />
      )
    case 'quota-exhausted':
      return (
        <BoundaryStateScreen
          action={<BillingLink label="Порівняти тарифи" module="plans" />}
          description={`Ліміт тарифу вичерпано: ${String(decision.used)} з ${String(decision.max)}. Підвищте тариф або звільніть місце.`}
          title="Ліміт вичерпано"
          tone="warn"
        />
      )
    case 'access-error':
      return (
        <BoundaryStateScreen
          description="Не вдалося отримати ваші права для цієї розбірки. Оновіть сторінку та спробуйте ще раз."
          role="alert"
          title="Не вдалося перевірити доступ"
          tone="danger"
        />
      )
    case 'access-loading':
      return <SkeletonRows label="Перевіряємо доступ…" />
  }
}

function BillingLink({
  label,
  module,
}: {
  label: string
  module: 'billing' | 'plans'
}) {
  const { targetTenant } = useCabinet()
  if (targetTenant === null) return null

  return (
    <Button asChild variant="primary">
      <Link to={cabinetPath(targetTenant.slug, module)}>{label}</Link>
    </Button>
  )
}

function BoundaryStateScreen({
  title,
  description,
  action,
  role = 'status',
  tone = 'neutral',
}: {
  title: string
  description: string
  action?: ReactNode
  role?: 'alert' | 'status'
  tone?: 'neutral' | 'warn' | 'danger'
}) {
  return (
    <StateScreen
      actions={action}
      className="min-h-[50dvh] content-center"
      description={description}
      icon={<AlertTriangle aria-hidden />}
      role={role}
      title={title}
      tone={tone}
    />
  )
}
