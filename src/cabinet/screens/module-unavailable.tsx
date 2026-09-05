import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { PackageOpen, Sparkles } from 'lucide-react'
import { Button, StateScreen } from '@/components/app'
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
      description={`${definition.navigation?.label ?? definition.key} поки недоступний у вашій розбірці. Посилання запрацює, щойно розділ увімкнуть.`}
      icon={<PackageOpen aria-hidden />}
      title="Розділ поки недоступний"
      tone="neutral"
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
      description={`Модуль «${definition.navigation?.label ?? definition.key}» не входить до поточного тарифу. Оберіть інший тариф, щоб отримати доступ.`}
      icon={<Sparkles aria-hidden />}
      title="Функція недоступна на вашому тарифі"
      tone="warn"
    />
  )
}

function UnavailableState({
  title,
  description,
  icon,
  tone,
}: {
  title: string
  description: string
  icon: ReactNode
  tone: 'neutral' | 'warn'
}) {
  const { targetTenant } = useCabinet()

  return (
    <StateScreen
      actions={
        targetTenant === null ? undefined : (
          <Button asChild variant="primary">
            <Link to={cabinetPath(targetTenant.slug, 'dashboard')}>
              До головної
            </Link>
          </Button>
        )
      }
      className="min-h-[50dvh] content-center"
      description={description}
      icon={icon}
      title={title}
      tone={tone}
    />
  )
}
