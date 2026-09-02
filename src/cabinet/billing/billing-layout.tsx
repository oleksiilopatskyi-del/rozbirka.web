import { useId, type ReactNode } from 'react'
import { EmptyState, Notice } from '@/components/app'
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

/** Eyebrow every billing screen wears, so the three read as one section. */
export const BILLING_EYEBROW = 'Налаштування · Білінг'

/**
 * One sentence for "we cannot tell which store owns this subscription", used
 * both as a standing notice and as the failure of an action that discovered it
 * mid-flight. It says what to do next, because "недоступне" alone is a dead end.
 */
export const BILLING_MANAGEMENT_UNAVAILABLE =
  'Керування підпискою недоступне. Оновіть сторінку — можливо, підписку перенесли в App Store або Google Play.'

/** Thrown when a mutation is dispatched against a non-Mono subscription. */
// eslint-disable-next-line react-refresh/only-export-components -- failure type shared by the three billing screens.
export class BillingManagementUnavailableError extends Error {
  constructor() {
    super(BILLING_MANAGEMENT_UNAVAILABLE)
    this.name = 'BillingManagementUnavailableError'
  }
}

/**
 * A second-level block of a billing screen. Unlike `SectionPanel` it draws no
 * surface of its own, so a `DataTable` inside it keeps a single border.
 */
export function BillingSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  const titleId = useId()

  return (
    <section aria-labelledby={titleId} className="grid gap-3">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold text-white" id={titleId}>
          {title}
        </h2>
        {description === undefined ? null : (
          <p className="text-app-dim text-[12.5px]">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

export function BillingUnavailableNotice() {
  return <Notice tone="warn">{BILLING_MANAGEMENT_UNAVAILABLE}</Notice>
}

export function EmptyBillingPanel() {
  return (
    <EmptyState
      description="Дані недоступні. Спробуйте оновити сторінку."
      title="Немає даних білінгу"
    />
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
