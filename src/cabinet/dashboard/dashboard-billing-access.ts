import type { Tenant } from '@/api/types'
import type { TenantAccessSnapshot } from '../access-types'
import { cabinetPath } from '../cabinet-paths'
import { cabinetModules } from '../module-registry'
import { evaluateModuleAccess } from '../policy'

export function getDashboardBillingPath(
  snapshot: TenantAccessSnapshot,
  tenant: Pick<Tenant, 'slug'>,
): string | null {
  const decision = evaluateModuleAccess(
    cabinetModules.billing,
    { status: 'ready', snapshot, error: null },
    'view',
  )
  return decision.kind === 'allowed'
    ? cabinetPath(tenant.slug, 'billing')
    : null
}
