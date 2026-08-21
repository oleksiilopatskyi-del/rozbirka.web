const TENANT_KEY = 'rozbirka.tenantId'

export const tenantPreference = {
  get(): string | null {
    return localStorage.getItem(TENANT_KEY)
  },

  set(id: string) {
    localStorage.setItem(TENANT_KEY, id)
  },

  clear() {
    localStorage.removeItem(TENANT_KEY)
  },
}
