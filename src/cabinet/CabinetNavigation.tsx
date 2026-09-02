import { useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import { Ellipsis, LogOut, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { NavLink } from 'react-router'
import type { Tenant } from '../api/types'
import { BrandLogo } from '../components/site/brand-logo'
import { cn } from '../lib/utils'
import type { TenantAccessSnapshot } from './access-types'
import { cabinetPath } from './cabinet-paths'
import {
  cabinetModules,
  type CabinetModuleDefinition,
  type CabinetModuleKey,
  type CabinetNavigationGroup,
} from './module-registry'
import { evaluateModuleAccess } from './policy'
import { TenantSwitcher } from './TenantSwitcher'

interface NavigationEntry {
  key: CabinetModuleKey
  label: string
  icon: NonNullable<CabinetModuleDefinition['navigation']>['icon']
  placement: NonNullable<CabinetModuleDefinition['navigation']>['placement']
  group: CabinetNavigationGroup
  mobilePriority: number
  to: string
}

const groupLabel: Record<CabinetNavigationGroup, string | null> = {
  overview: null,
  stock: 'Склад',
  sales: 'Продажі',
  money: 'Гроші',
  settings: 'Налаштування',
}

const groupOrder: readonly CabinetNavigationGroup[] = [
  'overview',
  'stock',
  'sales',
  'money',
  'settings',
]

/** Four tabs fit a phone; everything else lives behind "Ще". */
const MOBILE_TAB_LIMIT = 4

const byMobilePriority = (a: NavigationEntry, b: NavigationEntry) =>
  a.mobilePriority - b.mobilePriority

const groupsOf = (entries: readonly NavigationEntry[]) =>
  groupOrder
    .map((group) => ({
      group,
      label: groupLabel[group],
      entries: entries.filter((entry) => entry.group === group),
    }))
    .filter((section) => section.entries.length > 0)

export interface CabinetNavigationProps {
  tenant: Tenant
  tenants: readonly Tenant[]
  snapshot: TenantAccessSnapshot
  onSwitchTenant: (tenantId: string) => Promise<void>
  onLogout: () => Promise<void>
}

export function CabinetNavigation({
  tenant,
  tenants,
  snapshot,
  onSwitchTenant,
  onLogout,
}: CabinetNavigationProps) {
  const entries = useMemo(
    () =>
      Object.values(cabinetModules).flatMap((definition): NavigationEntry[] => {
        const navigation = definition.navigation
        if (
          navigation === undefined ||
          evaluateModuleAccess(
            { ...definition, navigation },
            { status: 'ready', snapshot, error: null },
            'view',
          ).kind !== 'allowed'
        ) {
          return []
        }

        return [
          {
            key: definition.key,
            label: navigation.label,
            icon: navigation.icon,
            placement: navigation.placement,
            group: navigation.group,
            mobilePriority:
              navigation.mobilePriority ?? Number.MAX_SAFE_INTEGER,
            to: cabinetPath(tenant.slug, definition.key),
          },
        ]
      }),
    [snapshot, tenant.slug],
  )

  return (
    <>
      <DesktopNavigation
        entries={entries}
        tenant={tenant}
        tenants={tenants}
        onSwitchTenant={onSwitchTenant}
        onLogout={onLogout}
      />
      <TabletNavigation
        entries={entries}
        tenant={tenant}
        tenants={tenants}
        onSwitchTenant={onSwitchTenant}
        onLogout={onLogout}
      />
      <MobileNavigation
        entries={entries}
        tenant={tenant}
        tenants={tenants}
        onSwitchTenant={onSwitchTenant}
        onLogout={onLogout}
      />
    </>
  )
}

interface PresentationProps {
  entries: readonly NavigationEntry[]
  tenant: Tenant
  tenants: readonly Tenant[]
  onSwitchTenant: (tenantId: string) => Promise<void>
  onLogout: () => Promise<void>
}

function DesktopNavigation({
  entries,
  tenant,
  tenants,
  onSwitchTenant,
  onLogout,
}: PresentationProps) {
  const primary = entries.filter((entry) => entry.placement === 'primary')
  const account = entries.filter((entry) => entry.placement === 'account')

  return (
    <aside className="bg-surface-1 hidden min-h-dvh w-[280px] shrink-0 flex-col border-r border-white/[0.06] px-6 py-7 lg:flex">
      <BrandLogo href={cabinetPath(tenant.slug, 'dashboard')} />
      <nav
        aria-label="Навігація кабінету"
        className="mt-8 flex flex-1 flex-col"
      >
        {groupsOf(primary).map((section) => (
          <NavigationList
            className="mt-1"
            entries={section.entries}
            key={section.group}
            label={section.label}
            presentation="desktop"
          />
        ))}
        {account.length > 0 ? (
          <NavigationList
            className="mt-auto pt-6"
            entries={account}
            label="Налаштування"
            presentation="desktop"
          />
        ) : null}
      </nav>
      <div className="mt-5 border-t border-white/[0.06] pt-5">
        <TenantSwitcher
          tenant={tenant}
          tenants={tenants}
          onSwitch={onSwitchTenant}
        />
        <LogoutButton onLogout={onLogout} presentation="desktop" />
      </div>
    </aside>
  )
}

function TabletNavigation({
  entries,
  tenant,
  tenants,
  onSwitchTenant,
  onLogout,
}: PresentationProps) {
  const primary = entries.filter((entry) => entry.placement === 'primary')
  const account = entries.filter((entry) => entry.placement === 'account')

  return (
    <aside className="bg-surface-1 hidden min-h-dvh w-[72px] shrink-0 flex-col items-center border-r border-white/[0.06] px-3 py-5 md:flex lg:hidden">
      <span aria-hidden className="text-brand text-xl font-semibold">
        r
      </span>
      <nav
        aria-label="Навігація планшета"
        className="mt-7 flex w-full flex-1 flex-col"
      >
        {groupsOf(primary).map((section) => (
          <NavigationList
            className="mt-1"
            entries={section.entries}
            key={section.group}
            presentation="rail"
          />
        ))}
        {account.length > 0 ? (
          <NavigationList
            className="mt-auto pt-5"
            entries={account}
            presentation="rail"
          />
        ) : null}
      </nav>
      <div className="mt-4 border-t border-white/[0.06] pt-4">
        <RailControl label="Перемкнути розбірку">
          <TenantSwitcher
            compact
            tenant={tenant}
            tenants={tenants}
            onSwitch={onSwitchTenant}
          />
        </RailControl>
        <LogoutButton onLogout={onLogout} presentation="rail" />
      </div>
    </aside>
  )
}

function MobileNavigation({
  entries,
  tenant,
  tenants,
  onSwitchTenant,
  onLogout,
}: PresentationProps) {
  const mobileEntries = [...entries]
    .filter((entry) => entry.placement === 'primary')
    .sort(byMobilePriority)
    .slice(0, MOBILE_TAB_LIMIT)
  const mobileKeys = new Set(mobileEntries.map((entry) => entry.key))
  const moreEntries = entries.filter((entry) => !mobileKeys.has(entry.key))

  return (
    <Dialog.Root>
      <nav
        aria-label="Мобільна навігація"
        className="bg-surface-1/95 fixed inset-x-0 bottom-0 z-40 flex min-h-16 items-start justify-around border-t border-white/10 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
      >
        {mobileEntries.map((entry) => (
          <NavigationLink key={entry.key} entry={entry} presentation="mobile" />
        ))}
        <Dialog.Trigger asChild>
          <button
            type="button"
            className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-xl px-3 text-[11px] text-neutral-400 transition-colors hover:bg-white/[0.05] hover:text-white"
          >
            <Ellipsis aria-hidden className="size-5" />
            <span>Ще</span>
          </button>
        </Dialog.Trigger>
      </nav>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <Dialog.Content className="bg-surface-2 fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 max-h-[min(76dvh,42rem)] overflow-y-auto rounded-3xl border border-white/10 p-5 shadow-2xl data-[state=closed]:animate-out data-[state=open]:animate-in md:hidden">
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title className="text-lg font-medium text-white">
              Меню кабінету
            </Dialog.Title>
            <Dialog.Close
              aria-label="Закрити меню"
              className="grid min-h-11 min-w-11 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Навігація та перемикання між розбірками
          </Dialog.Description>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {moreEntries.map((entry) => (
              <Dialog.Close asChild key={entry.key}>
                <NavigationLink entry={entry} presentation="dialog" />
              </Dialog.Close>
            ))}
          </div>
          <div className="mt-5 border-t border-white/10 pt-5">
            <p className="mb-2 text-xs text-neutral-500">Поточна розбірка</p>
            <TenantSwitcher
              tenant={tenant}
              tenants={tenants}
              onSwitch={onSwitchTenant}
            />
            <Dialog.Close asChild>
              <LogoutButton onLogout={onLogout} presentation="dialog" />
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function LogoutButton({
  onLogout,
  presentation,
}: {
  onLogout: () => Promise<void>
  presentation: 'desktop' | 'rail' | 'dialog'
}) {
  const button = (
    <button
      type="button"
      aria-label={presentation === 'rail' ? 'Вийти' : undefined}
      onClick={() => void onLogout()}
      className={cn(
        'min-h-11 min-w-11 rounded-xl text-neutral-400 transition-colors hover:bg-white/[0.05] hover:text-white',
        presentation === 'desktop' &&
          'mt-3 flex w-full items-center gap-3 px-4 text-sm',
        presentation === 'rail' && 'grid place-items-center',
        presentation === 'dialog' &&
          'mt-3 flex w-full items-center gap-3 px-3 py-2 text-sm',
      )}
    >
      <LogOut aria-hidden className="size-5 shrink-0" />
      {presentation !== 'rail' && <span>Вийти</span>}
    </button>
  )

  return presentation === 'rail' ? (
    <RailControl className="mt-3" label="Вийти">
      {button}
    </RailControl>
  ) : (
    button
  )
}

function NavigationList({
  entries,
  presentation,
  className,
  label,
}: {
  entries: readonly NavigationEntry[]
  presentation: 'desktop' | 'rail'
  className?: string
  label?: string | null
}) {
  return (
    <div className={className}>
      {presentation === 'desktop' && label ? (
        <p className="text-app-dim px-4 pt-3 pb-1.5 font-mono text-[10px] tracking-[0.12em] uppercase">
          {label}
        </p>
      ) : null}
      <ul role="list" className="grid gap-1">
        {entries.map((entry) => (
          <li key={entry.key}>
            {presentation === 'rail' ? (
              <RailControl label={entry.label}>
                <NavigationLink entry={entry} presentation={presentation} />
              </RailControl>
            ) : (
              <NavigationLink entry={entry} presentation={presentation} />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function NavigationLink({
  entry,
  presentation,
  ...props
}: {
  entry: NavigationEntry
  presentation: 'desktop' | 'rail' | 'mobile' | 'dialog'
} & Omit<ComponentProps<typeof NavLink>, 'children' | 'className' | 'to'>) {
  const Icon = entry.icon

  return (
    <NavLink
      {...props}
      aria-label={presentation === 'rail' ? entry.label : undefined}
      className={({ isActive }) =>
        cn(
          'min-h-11 min-w-11 rounded-xl transition-colors',
          presentation === 'desktop' && 'flex items-center gap-3 px-4 text-sm',
          presentation === 'rail' && 'grid place-items-center',
          presentation === 'mobile' &&
            'flex flex-col items-center justify-center gap-1 px-3 text-[11px]',
          presentation === 'dialog' &&
            'flex items-center gap-3 px-3 py-2 text-sm',
          isActive
            ? presentation === 'mobile'
              ? 'text-brand'
              : 'bg-brand/[0.12] text-brand shadow-[inset_2px_0_0_var(--color-brand)]'
            : 'text-app-muted hover:bg-white/[0.05] hover:text-white',
        )
      }
      end
      to={entry.to}
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      {presentation !== 'rail' && <span>{entry.label}</span>}
    </NavLink>
  )
}

function RailControl({
  children,
  className,
  label,
}: {
  children: ReactNode
  className?: string
  label: string
}) {
  const [hasFocus, setHasFocus] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      className={cn('relative', className)}
      onBlur={() => setHasFocus(false)}
      onFocus={() => setHasFocus(true)}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
      {children}
      <span
        className="cabinet-rail-tooltip"
        hidden={!hasFocus && !isHovered}
        role="tooltip"
      >
        {label}
      </span>
    </div>
  )
}
