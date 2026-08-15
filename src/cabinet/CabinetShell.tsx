import { Outlet, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { useCabinet, type CabinetContextValue } from './CabinetContext'
import { CabinetNavigation } from './CabinetNavigation'

export function CabinetShell() {
  const auth = useAuth()
  const cabinet = useCabinet()
  const navigate = useNavigate()

  if (!isReady(cabinet)) return null

  const handleLogout = async () => {
    void navigate('/', { replace: true, flushSync: true })
    await auth.signOut()
  }

  return (
    <div className="cabinet-shell bg-background flex min-h-dvh w-full max-w-full text-white">
      <CabinetNavigation
        tenant={cabinet.targetTenant}
        tenants={auth.tenants}
        snapshot={cabinet.snapshot}
        onSwitchTenant={(tenantId) => cabinet.switchTenant(tenantId)}
        onLogout={handleLogout}
      />
      <main className="cabinet-shell__content min-w-0 flex-1 px-4 py-6 sm:px-6 md:px-8 md:py-8 lg:px-10 lg:py-10">
        <Outlet />
      </main>
    </div>
  )
}

function isReady(
  cabinet: CabinetContextValue,
): cabinet is CabinetContextValue & {
  status: 'ready'
  targetTenant: NonNullable<CabinetContextValue['targetTenant']>
  snapshot: NonNullable<CabinetContextValue['snapshot']>
} {
  return (
    cabinet.status === 'ready' &&
    cabinet.targetTenant !== null &&
    cabinet.snapshot !== null
  )
}
