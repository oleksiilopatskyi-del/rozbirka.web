import { lazy, Suspense, type ComponentType } from 'react'
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
      <Suspense
        fallback={
          <BoundaryStateScreen
            title="Завантажуємо модуль…"
            description="Це займе лише мить."
            role="status"
          />
        }
      >
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
        <BoundaryStateScreen
          title="Недостатньо прав"
          description="Зверніться до власника розбірки, щоб отримати доступ до цього розділу."
        />
      )
    case 'subscription-blocked':
      return (
        <BoundaryStateScreen
          title="Підписка потребує уваги"
          description="Перевірте стан підписки в налаштуваннях білінгу."
        />
      )
    case 'quota-exhausted':
      return (
        <BoundaryStateScreen
          title="Ліміт вичерпано"
          description="Змініть тариф або звільніть місце, щоб продовжити."
        />
      )
    case 'access-error':
      return (
        <BoundaryStateScreen
          title="Не вдалося перевірити доступ"
          description="Оновіть сторінку та спробуйте ще раз."
        />
      )
    case 'access-loading':
      return (
        <BoundaryStateScreen
          title="Перевіряємо доступ…"
          description="Це займе лише мить."
          role="status"
        />
      )
  }
}

function BoundaryStateScreen({
  title,
  description,
  role = 'alert',
}: {
  title: string
  description: string
  role?: 'alert' | 'status'
}) {
  return (
    <section
      className="grid min-h-[50dvh] place-items-center px-6 py-12 text-center"
      role={role}
    >
      <div className="grid max-w-md gap-3">
        <h1 className="text-2xl font-medium text-white">{title}</h1>
        <p className="text-sm leading-6 text-neutral-400">{description}</p>
      </div>
    </section>
  )
}
