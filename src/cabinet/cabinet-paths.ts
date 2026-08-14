import type { Tenant } from '../api/types'
import { readPlanCode } from '../lib/plan-selection'
import { cabinetModules, type CabinetModuleKey } from './module-registry'

export const CABINET_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62})$/

export function cabinetPath(
  slug: string,
  module: CabinetModuleKey,
  suffix?: string,
): string {
  if (!CABINET_SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid tenant slug: ${slug}`)
  }

  const base = `/app/${slug}${cabinetModules[module].routeSegment}`
  if (suffix === undefined || suffix === '') return base

  const segments = suffix.replace(/^\/+|\/+$/g, '').split('/')
  if (
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    throw new Error(`Invalid cabinet path suffix: ${suffix}`)
  }

  return `${base}/${segments.map(encodeURIComponent).join('/')}`
}

export function resolveAccountDestination(
  tenant: Pick<Tenant, 'slug'>,
  search: string,
): string {
  const params = new URLSearchParams(search)

  switch (params.get('section')) {
    case 'subscription':
      return cabinetPath(tenant.slug, 'billing')
    case 'plans': {
      const plan = readPlanCode(search)
      const destination = cabinetPath(tenant.slug, 'plans')
      return plan === null ? destination : `${destination}?plan=${plan}`
    }
    case 'payment':
    case 'billing':
      return cabinetPath(tenant.slug, 'payments')
    default:
      return cabinetPath(tenant.slug, 'profile')
  }
}
