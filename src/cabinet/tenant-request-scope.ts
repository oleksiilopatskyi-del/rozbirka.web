class TenantRequestScope {
  #controller = new AbortController()

  get signal() {
    return this.#controller.signal
  }

  rotate() {
    this.#controller.abort('tenant-scope-changed')
    this.#controller = new AbortController()
  }
}

export const tenantRequestScope = new TenantRequestScope()
