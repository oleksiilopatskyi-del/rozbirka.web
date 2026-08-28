import { Link } from 'react-router'
import { cabinetPath } from '../cabinet-paths'
import { useCabinet } from '../CabinetContext'
import type { CabinetModuleDefinition } from '../module-registry'

export function ModuleUnavailableScreen({
  definition,
}: {
  definition: CabinetModuleDefinition
}) {
  return (
    <UnavailableState
      title="Модуль готується до запуску"
      description={`${definition.navigation?.label ?? definition.key} поки недоступний у кабінеті.`}
    />
  )
}

export function FeatureUnavailableScreen({
  definition,
}: {
  definition: CabinetModuleDefinition
}) {
  return (
    <UnavailableState
      title="Функція недоступна на вашому тарифі"
      description={`Модуль «${definition.navigation?.label ?? definition.key}» не входить до поточного тарифу. Оберіть інший тариф, щоб отримати доступ.`}
    />
  )
}

function UnavailableState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  const { targetTenant } = useCabinet()

  return (
    <section
      className="grid min-h-[50dvh] place-items-center px-6 py-12 text-center"
      role="status"
    >
      <div className="grid max-w-md gap-3">
        <h1 className="text-2xl font-medium text-white">{title}</h1>
        <p className="text-sm leading-6 text-neutral-400">{description}</p>
        {targetTenant !== null && (
          <Link
            className="bg-brand text-brand-foreground mt-1 min-h-11 justify-self-center rounded-full px-5 py-3 text-sm"
            to={cabinetPath(targetTenant.slug, 'dashboard')}
          >
            До головної
          </Link>
        )}
      </div>
    </section>
  )
}
