import { accountPathForPlan, readPlanCode } from '@/lib/plan-selection'

const SAFE_PATHS = [
  /^\/account(?:[/?#]|$)/,
  /^\/invite\/[A-Za-z0-9_-]{4,128}(?:[?#]|$)/,
  /^\/scan\/[A-Za-z0-9._~-]{1,256}(?:[?#]|$)/,
  /^\/app\/[A-Za-z0-9_-]+(?:[/?#]|$)/,
]

const hasUnsafeCharacters = (value: string): boolean => {
  try {
    const decoded = decodeURIComponent(value)
    return Array.from(decoded).some((character) => {
      const codePoint = character.codePointAt(0)
      return (
        codePoint !== undefined &&
        (codePoint <= 0x1f || codePoint === 0x7f || character === '\\')
      )
    })
  } catch {
    return true
  }
}

export function isSafeCabinetPath(value: string): boolean {
  return (
    !hasUnsafeCharacters(value) && SAFE_PATHS.some((path) => path.test(value))
  )
}

export function resolvePostLoginDestination(
  search: string,
  fallback: string,
  tenant?: { slug: string } | null,
): string {
  const params = new URLSearchParams(search)
  const invite = params.get('invite')
  if (invite) {
    const destination = `/invite/${encodeURIComponent(invite)}`
    if (isSafeCabinetPath(destination)) return destination
  }

  const scan = params.get('scan')
  if (scan) {
    const destination = `/scan/${encodeURIComponent(scan)}`
    if (isSafeCabinetPath(destination)) return destination
  }

  const planCode = readPlanCode(search)
  if (planCode) {
    return tenant && isSafeTenantSlug(tenant.slug)
      ? `/app/${tenant.slug}/settings/billing/plans?plan=${planCode}`
      : accountPathForPlan(planCode)
  }

  const safeFallback = isSafeCabinetPath(fallback) ? fallback : '/account'
  return tenant && isSafeTenantSlug(tenant.slug)
    ? resolveTenantFallback(tenant.slug, safeFallback)
    : safeFallback
}

const isSafeTenantSlug = (slug: string) =>
  /^[a-z0-9](?:[a-z0-9-]{0,62})$/.test(slug)

function resolveTenantFallback(slug: string, fallback: string): string {
  if (!/^\/account(?:[/?#]|$)/.test(fallback)) return fallback
  const queryStart = fallback.indexOf('?')
  const hashStart = fallback.indexOf('#')
  const query =
    queryStart < 0
      ? ''
      : fallback.slice(
          queryStart,
          hashStart >= 0 && hashStart > queryStart ? hashStart : undefined,
        )
  const params = new URLSearchParams(query)
  switch (params.get('section')) {
    case 'subscription':
      return `/app/${slug}/settings/billing/overview`
    case 'plans': {
      const plan = readPlanCode(query)
      return `/app/${slug}/settings/billing/plans${plan ? `?plan=${plan}` : ''}`
    }
    case 'payment':
    case 'billing':
      return `/app/${slug}/settings/billing/payments`
    default: {
      const scan = params.get('scan')
      return `/app/${slug}/dashboard${
        scan && /^[A-Za-z0-9._~-]{1,256}$/.test(scan)
          ? `?scan=${encodeURIComponent(scan)}`
          : ''
      }`
    }
  }
}
