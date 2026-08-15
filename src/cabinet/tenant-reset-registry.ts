export interface TenantResetScope {
  userId: string
  tenantId: string
}

type TenantReset = (scope: TenantResetScope) => void | Promise<void>

class TenantResetRegistry {
  #resets = new Set<TenantReset>()
  #clearBarrier = Promise.resolve()

  register(reset: TenantReset) {
    this.#resets.add(reset)
    return () => {
      this.#resets.delete(reset)
    }
  }

  clear(scope: TenantResetScope): Promise<void> {
    const resets = [...this.#resets]
    const clearing = this.#clearBarrier.then(async () => {
      const results = await Promise.allSettled(
        resets.map((reset) => Promise.resolve().then(() => reset(scope))),
      )
      const failures: unknown[] = []
      for (const result of results) {
        if (result.status === 'rejected') {
          failures.push(result.reason as unknown)
        }
      }

      if (failures.length === 1) {
        throw failures[0]
      }
      if (failures.length > 1) {
        throw new AggregateError(failures, 'Tenant cleanup failed')
      }
    })
    this.#clearBarrier = clearing.then(
      () => undefined,
      () => undefined,
    )
    return clearing
  }
}

export const tenantResetRegistry = new TenantResetRegistry()
