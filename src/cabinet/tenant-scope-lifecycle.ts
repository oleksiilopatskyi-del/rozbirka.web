import {
  tenantResetRegistry,
  type TenantResetScope,
} from './tenant-reset-registry'

export interface TenantScopeLease {
  readonly scope: TenantResetScope
  departure: Promise<void> | null
}

class TenantScopeLifecycle {
  #current: TenantScopeLease | null = null

  currentLease(): TenantScopeLease | null {
    return this.#current
  }

  commit(scope: TenantResetScope): TenantScopeLease {
    const lease: TenantScopeLease = { scope, departure: null }
    this.#current = lease
    return lease
  }

  depart(lease: TenantScopeLease | null): Promise<void> {
    if (lease === null) return Promise.resolve()
    if (lease.departure === null) {
      lease.departure = tenantResetRegistry.clear(lease.scope)
      void lease.departure.catch(() => undefined)
    }
    return lease.departure
  }
}

export const tenantScopeLifecycle = new TenantScopeLifecycle()
