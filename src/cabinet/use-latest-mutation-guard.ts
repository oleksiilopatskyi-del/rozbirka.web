import { useLayoutEffect, useRef } from 'react'
import type { Permission } from './access-types'
import { useCabinet } from './CabinetContext'
import type { CabinetModuleDefinition } from './module-registry'
import { evaluateModuleAccess, requireModuleMutation } from './policy'
import { tenantRequestScope } from './tenant-request-scope'

export interface LatestMutationRequirements {
  permission?: Permission
  quota?: boolean
}

export interface LatestMutationScope {
  signal: AbortSignal
  tenantId: string
  generation: number
}

export function useLatestMutationGuard(definition: CabinetModuleDefinition) {
  const cabinet = useCabinet()
  const latestCabinetRef = useRef(cabinet)
  useLayoutEffect(() => {
    latestCabinetRef.current = cabinet
  }, [cabinet])

  const renderedScope = {
    signal: tenantRequestScope.signal,
    tenantId: cabinet.snapshot?.tenantId ?? null,
    userId: cabinet.snapshot?.userId ?? null,
    generation: cabinet.snapshot?.generation ?? null,
  }

  const requireLatestMutation = (
    requirements: LatestMutationRequirements = {},
  ): LatestMutationScope => {
    const latest = latestCabinetRef.current
    const snapshot = latest.snapshot
    const signal = tenantRequestScope.signal
    if (
      latest.status !== 'ready' ||
      snapshot === null ||
      latest.targetTenant?.id !== snapshot.tenantId ||
      snapshot.tenantId !== renderedScope.tenantId ||
      snapshot.userId !== renderedScope.userId ||
      snapshot.generation !== renderedScope.generation ||
      signal !== renderedScope.signal ||
      signal.aborted
    ) {
      requireModuleMutation({ kind: 'access-loading' })
      throw new Error('Unreachable denied cabinet mutation')
    }

    const { quotaResource, ...unmeteredDefinition } = definition
    const permission = requirements.permission ?? definition.mutationPermission
    requireModuleMutation(
      evaluateModuleAccess(
        {
          ...unmeteredDefinition,
          ...(permission !== undefined
            ? { mutationPermission: permission }
            : {}),
          ...(requirements.quota !== false && quotaResource !== undefined
            ? { quotaResource }
            : {}),
        },
        { status: 'ready', snapshot, error: null },
        'mutation',
      ),
    )

    return {
      signal,
      tenantId: snapshot.tenantId,
      generation: snapshot.generation,
    }
  }

  return { requireLatestMutation }
}
