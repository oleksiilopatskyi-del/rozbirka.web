import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { Button, EmptyState, SectionPanel } from '@/components/app'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import type { Tenant } from '@/api/types'
import type { TenantAccessSnapshot } from '../access-types'
import { cabinetPath } from '../cabinet-paths'
import {
  cabinetModules,
  type CabinetModuleDefinition,
} from '../module-registry'
import { evaluateModuleAccess } from '../policy'

const countFormatter = new Intl.NumberFormat('uk-UA')

interface DashboardDestination {
  label: string
  to: string
  icon: LucideIcon
  usage: { text: string; exhausted: boolean } | null
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
      <section aria-label="Підготовка робочих модулів">
        <EmptyState
          description="Щойно тариф і права буде налаштовано, тут з’являться розділи, у яких ви працюєте."
          title="Готуємо робочі модулі"
        />
      </section>
    )
  }

  return (
    <div className="grid min-w-0 gap-4">
      {links.length > 0 ? (
        <SectionPanel
          description="Розділи, до яких у вас є доступ у цій розбірці."
          title="Робочі модулі"
        >
          <ul className="grid min-w-0 gap-2 sm:grid-cols-2">
            {links.map((destination) => (
              <li className="min-w-0" key={destination.to}>
                <DestinationCard destination={destination} />
              </li>
            ))}
          </ul>
        </SectionPanel>
      ) : null}
      {quickActions.length > 0 ? (
        <SectionPanel
          description="Розділи, де ви можете одразу створювати та змінювати записи."
          title="Швидкі дії"
        >
          <ul className="flex min-w-0 flex-wrap gap-2">
            {quickActions.map((destination) => (
              <li key={destination.to}>
                <Button asChild>
                  <Link to={destination.to}>
                    <destination.icon aria-hidden />
                    Відкрити: {destination.label}
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </SectionPanel>
      ) : null}
    </div>
  )
}

function DestinationCard({
  destination,
}: {
  destination: DashboardDestination
}) {
  const Icon = destination.icon

  return (
    <Link
      className="border-app-line rounded-panel bg-app-raised hover:border-app-line-2 focus-visible:outline-brand flex min-h-11 min-w-0 items-center gap-3 border p-3 transition-colors hover:bg-white/[0.02] focus-visible:outline-2 focus-visible:outline-offset-2"
      to={destination.to}
    >
      <span className="text-app-muted grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.05]">
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium break-words text-white">
          {destination.label}
        </div>
        {destination.usage === null ? null : (
          <div
            className={cn(
              'mt-0.5 text-[12px] tabular-nums',
              destination.usage.exhausted ? 'text-state-warn' : 'text-app-dim',
            )}
          >
            {destination.usage.text}
          </div>
        )}
      </div>
      <ChevronRight aria-hidden className="text-app-dim size-4 shrink-0" />
    </Link>
  )
}

function deriveDestinations(snapshot: TenantAccessSnapshot, slug: string) {
  const destinationModules =
    Object.values(cabinetModules).filter(isDestinationModule)
  const access = { status: 'ready' as const, snapshot, error: null }

  return {
    links: destinationModules.flatMap((definition): DashboardDestination[] =>
      evaluateModuleAccess(definition, access, 'view').kind === 'allowed'
        ? [toDestination(definition, slug, snapshot)]
        : [],
    ),
    quickActions: destinationModules.flatMap(
      (definition): DashboardDestination[] =>
        evaluateModuleAccess(definition, access, 'mutation').kind === 'allowed'
          ? [toDestination(definition, slug, snapshot)]
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
  snapshot: TenantAccessSnapshot,
): DashboardDestination {
  return {
    label: definition.navigation!.label,
    to: cabinetPath(slug, definition.key),
    icon: definition.navigation!.icon,
    usage: moduleUsage(definition, snapshot),
  }
}

/** The only count this block owns: how much of the plan the module has used. */
function moduleUsage(
  definition: CabinetModuleDefinition,
  snapshot: TenantAccessSnapshot,
): DashboardDestination['usage'] {
  const resource = definition.quotaResource
  if (resource === undefined) return null

  const usage = snapshot.entitlement?.usage[resource]
  if (usage === undefined) return null

  const used = countFormatter.format(usage.used)
  if (usage.max == null) {
    return { text: `Використано ${used}`, exhausted: false }
  }

  const max = countFormatter.format(usage.max)
  return usage.used >= usage.max
    ? { text: `Ліміт вичерпано: ${used} з ${max}`, exhausted: true }
    : { text: `Використано ${used} з ${max}`, exhausted: false }
}
