import { useCabinet } from '../CabinetContext'
import { AccessGate } from '../AccessGate'
import { cabinetModules, type CabinetModuleKey } from '../module-registry'
import {
  evaluateModuleAccess,
  requireModuleMutation,
  type ModuleAccessDecision,
} from '../policy'
import { tenantRequestScope } from '../tenant-request-scope'
import type { TenantAccessState } from '../access-types'

export function BillingHeader({
  title,
  subtitle,
  level = 1,
}: {
  title: string
  subtitle?: string
  level?: 1 | 2
}) {
  const Heading = level === 1 ? 'h1' : 'h2'
  return (
    <header className="mb-10 flex flex-col gap-2">
      <Heading className="text-[36px] leading-[1] font-light tracking-[-0.02em] lg:text-[48px]">
        {title}
      </Heading>
      {subtitle && <p className="text-[14px] text-neutral-400">{subtitle}</p>}
    </header>
  )
}

export function EmptyBillingPanel() {
  return (
    <p className="text-[14px] text-neutral-400">
      Дані недоступні. Спробуйте оновити сторінку.
    </p>
  )
}

export function BillingMutationGate({
  decision,
  children,
}: {
  decision: ModuleAccessDecision
  children: React.ReactNode
}) {
  return <AccessGate decision={decision}>{children}</AccessGate>
}

// eslint-disable-next-line react-refresh/only-export-components -- billing hook colocated with its layout primitives.
export function useBillingMutation(
  module: Extract<CabinetModuleKey, 'billing' | 'plans' | 'payments'>,
) {
  const cabinet = useCabinet()

  const access = cabinetAccess(cabinet)
  const controlDecision = evaluateModuleAccess(
    cabinetModules[module],
    access,
    'control',
  )

  const requireLatestMutation = () => {
    const signal = tenantRequestScope.signal
    const snapshot = cabinet.snapshot
    if (
      cabinet.status !== 'ready' ||
      snapshot === null ||
      cabinet.targetTenant?.id !== snapshot.tenantId ||
      signal.aborted
    ) {
      requireModuleMutation({ kind: 'access-loading' })
      throw new Error('Unreachable denied billing mutation')
    }
    requireModuleMutation(
      evaluateModuleAccess(
        cabinetModules[module],
        {
          status: 'ready',
          snapshot,
          error: null,
        },
        'mutation',
      ),
    )
    return {
      signal,
      tenantId: snapshot.tenantId,
      generation: snapshot.generation,
    }
  }

  return { cabinet, controlDecision, requireLatestMutation }
}

function cabinetAccess(
  cabinet: ReturnType<typeof useCabinet>,
): TenantAccessState {
  return cabinet.status === 'ready' && cabinet.snapshot !== null
    ? { status: 'ready', snapshot: cabinet.snapshot, error: null }
    : cabinet.status === 'error'
      ? { status: 'error', snapshot: null, error: cabinet.error }
      : { status: 'loading', snapshot: null, error: null }
}

// eslint-disable-next-line react-refresh/only-export-components -- presentation formatter shared by billing screens.
export function formatBillingDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

// eslint-disable-next-line react-refresh/only-export-components -- presentation formatter shared by billing screens.
export function formatBillingAmount(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (typeof amount !== 'number') return '—'
  const formatted = amount.toLocaleString('uk-UA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const upper = (currency ?? '').toUpperCase()
  const symbol = upper === 'UAH' ? '₴' : upper === 'USD' ? '$' : upper
  return upper === 'USD'
    ? `${symbol}${formatted}`
    : `${formatted} ${symbol}`.trim()
}
