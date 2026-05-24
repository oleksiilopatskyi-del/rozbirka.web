const ACCESS_KEY = 'rozbirka.accessToken'
const REFRESH_KEY = 'rozbirka.refreshToken'
const TENANT_KEY = 'rozbirka.tenantId'

export const tokens = {
  getAccess(): string | null {
    return localStorage.getItem(ACCESS_KEY)
  },
  getRefresh(): string | null {
    return localStorage.getItem(REFRESH_KEY)
  },
  getTenant(): string | null {
    return localStorage.getItem(TENANT_KEY)
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
  },
  setTenant(id: string) {
    localStorage.setItem(TENANT_KEY, id)
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(TENANT_KEY)
  },
}
