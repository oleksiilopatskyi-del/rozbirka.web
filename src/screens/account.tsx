import { Navigate, useLocation } from 'react-router'
import { useAuth } from '@/auth/AuthContext'
import { resolveAccountDestination } from '@/cabinet/cabinet-paths'
import { TenantOnboardingScreen } from '@/cabinet/screens/tenant-onboarding'

/** Compatibility entry for pre-cabinet account links. */
export function AccountScreen() {
  const auth = useAuth()
  const location = useLocation()

  if (auth.tenants.length === 0) {
    return <TenantOnboardingScreen />
  }

  const targetTenant = auth.tenant ?? auth.tenants[0]!

  return (
    <Navigate
      to={resolveAccountDestination(targetTenant, location.search)}
      replace
    />
  )
}
