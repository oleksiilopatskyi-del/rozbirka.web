import { useRef, useState, type ChangeEvent } from 'react'
import { Store } from 'lucide-react'
import type { Tenant } from '../api/types'
import { cn } from '../lib/utils'

export interface TenantSwitcherProps {
  tenant: Tenant
  tenants: readonly Tenant[]
  onSwitch: (tenantId: string) => Promise<void>
  compact?: boolean
}

export function TenantSwitcher({
  tenant,
  tenants,
  onSwitch,
  compact = false,
}: TenantSwitcherProps) {
  const [isSwitching, setIsSwitching] = useState(false)
  const switchPending = useRef(false)

  const handleChange = async (event: ChangeEvent<HTMLSelectElement>) => {
    if (switchPending.current || event.target.value === tenant.id) return

    switchPending.current = true
    setIsSwitching(true)
    try {
      await onSwitch(event.target.value)
    } catch {
      // CabinetContext owns and presents tenant-transition failures.
    } finally {
      switchPending.current = false
      setIsSwitching(false)
    }
  }

  return (
    <div className={cn('relative min-w-0', compact ? 'size-11' : 'w-full')}>
      <Store
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-1/2 z-10 size-4 -translate-y-1/2',
          compact
            ? 'text-brand-foreground left-1/2 -translate-x-1/2'
            : 'text-brand left-4',
        )}
      />
      <select
        aria-label="Перемкнути розбірку"
        className={cn(
          'bg-surface-2 min-h-11 min-w-11 appearance-none rounded-xl border border-white/10 text-sm text-white transition-colors outline-none hover:bg-white/[0.06] disabled:cursor-wait disabled:opacity-60',
          compact
            ? 'bg-brand size-11 cursor-pointer px-0 text-transparent'
            : 'w-full cursor-pointer py-2 pr-9 pl-11',
        )}
        disabled={isSwitching || tenants.length <= 1}
        onChange={(event) => void handleChange(event)}
        value={tenant.id}
      >
        {tenants.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
          </option>
        ))}
      </select>
      {!compact && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-xs text-neutral-500"
        >
          {isSwitching ? '…' : '⌄'}
        </span>
      )}
    </div>
  )
}
