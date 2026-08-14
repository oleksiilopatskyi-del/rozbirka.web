export interface TenantResetScope {
  userId: string
  tenantId: string
}

type TenantReset = (scope: TenantResetScope) => void | Promise<void>

class TenantResetRegistry {
  #resets = new Set<TenantReset>()

  register(reset: TenantReset) {
    this.#resets.add(reset)
    return () => {
      this.#resets.delete(reset)
    }
  }

  async clear(scope: TenantResetScope) {
    await Promise.all(
      [...this.#resets].map((reset) =>
        Promise.resolve().then(() => reset(scope)),
      ),
    )
  }
}

export const tenantResetRegistry = new TenantResetRegistry()
