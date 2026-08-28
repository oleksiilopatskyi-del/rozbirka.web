import { Link } from 'react-router'
import type { Tenant } from '@/api/types'
import type { TenantAccessSnapshot } from '../access-types'
import { cabinetPath } from '../cabinet-paths'
import {
  cabinetModules,
  type CabinetModuleDefinition,
} from '../module-registry'
import { evaluateModuleAccess } from '../policy'

interface DashboardDestination {
  label: string
  to: string
}

export function DashboardDestinations({
  snapshot,
  tenant,
}: {
  snapshot: TenantAccessSnapshot
  tenant: Pick<Tenant, 'slug'>
}) {
  const { links, quickActions } = deriveDestinations(snapshot, tenant.slug)

  if (links.length === 0 && quickActions.length === 0) {
    return (
      <section
        aria-label="Підготовка робочих модулів"
        className="rounded-2xl border border-white/[0.06] p-4"
      >
        <h2 className="font-medium text-white">Готуємо робочі модулі</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Незабаром тут з’являться доступні інструменти для роботи.
        </p>
      </section>
    )
  }

  return (
    <div className="grid gap-5">
      {links.length > 0 ? (
        <section aria-label="Робочі модулі">
          <h2 className="font-medium text-white">Робочі модулі</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {links.map((destination) => (
              <li key={destination.to}>
                <Link
                  className="flex min-h-11 items-center rounded-xl border border-white/[0.08] px-4 text-sm text-white transition-colors hover:border-white/[0.18] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  to={destination.to}
                >
                  {destination.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {quickActions.length > 0 ? (
        <section aria-label="Швидкі дії">
          <h2 className="font-medium text-white">Швидкі дії</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {quickActions.map((destination) => (
              <li key={destination.to}>
                <Link
                  className="inline-flex min-h-11 items-center rounded-full border border-white/[0.12] px-4 text-sm text-white transition-colors hover:border-white/[0.24] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  to={destination.to}
                >
                  Відкрити: {destination.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function deriveDestinations(snapshot: TenantAccessSnapshot, slug: string) {
  const destinationModules =
    Object.values(cabinetModules).filter(isDestinationModule)
  const access = { status: 'ready' as const, snapshot, error: null }

  return {
    links: destinationModules.flatMap((definition): DashboardDestination[] =>
      evaluateModuleAccess(definition, access, 'view').kind === 'allowed'
        ? [toDestination(definition, slug)]
        : [],
    ),
    quickActions: destinationModules.flatMap(
      (definition): DashboardDestination[] =>
        evaluateModuleAccess(definition, access, 'mutation').kind === 'allowed'
          ? [toDestination(definition, slug)]
          : [],
    ),
  }
}

function isDestinationModule(definition: CabinetModuleDefinition) {
  return definition.key !== 'dashboard'
}

function toDestination(
  definition: CabinetModuleDefinition,
  slug: string,
): DashboardDestination {
  return {
    label: definition.navigation!.label,
    to: cabinetPath(slug, definition.key),
  }
}
