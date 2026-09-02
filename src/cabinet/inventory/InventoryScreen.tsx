import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import {
  Archive,
  ClipboardCheck,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
} from 'lucide-react'
import {
  Button,
  EmptyState,
  Notice,
  PageBody,
  PageHeader,
  Panel,
  SkeletonRows,
  StatCard,
  StatusPill,
} from '@/components/app'
import {
  inventoryApi,
  type InventoryAuditEvent,
  type InventoryPartResult,
  type InventoryScan,
  type InventorySession,
  type InventorySessionResults,
  type InventoryZone,
  type Warehouse,
  type WarehouseDetail,
} from '@/api/inventory'
import { normalizeApiProblem } from '@/api/errors'
import { cabinetPath } from '../cabinet-paths'
import { useCabinet } from '../CabinetContext'
import type { CabinetModuleScreenProps } from '../ModuleBoundary'
import { cabinetModules } from '../module-registry'
import { useLatestMutationGuard } from '../use-latest-mutation-guard'
import { buildZoneLabelHtml } from './zone-label-output'

type LoadState<T> =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; data: T }

const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('uk-UA', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—'

const sessionStatus = (status: InventorySession['status']) =>
  ({
    draft: ['Чернетка', 'neutral'],
    inProgress: ['Триває', 'warn'],
    review: ['Перевірка', 'info'],
    completed: ['Завершено', 'ok'],
    cancelled: ['Скасовано', 'danger'],
  })[status] as [string, 'neutral' | 'warn' | 'info' | 'ok' | 'danger']

const resultStatus = (result: string) =>
  ({
    Matched: ['Збіг', 'ok'],
    Shortage: ['Нестача', 'danger'],
    Surplus: ['Надлишок', 'warn'],
    Unexpected: ['Несподівана', 'warn'],
  })[result] ?? [result, 'neutral']

const formText = (form: FormData, name: string) => {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function useLoad<T>(loader: (signal: AbortSignal) => Promise<T>, key: string) {
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<LoadState<T>>({ kind: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    void loader(controller.signal).then(
      (data) => !controller.signal.aborted && setState({ kind: 'ready', data }),
      () => !controller.signal.aborted && setState({ kind: 'error' }),
    )
    return () => controller.abort()
  }, [key, loader, revision])
  const reload = useCallback(() => {
    setState({ kind: 'loading' })
    setRevision((value) => value + 1)
  }, [])
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  return useMemo(() => ({ state, reload, refresh }), [refresh, reload, state])
}

function Resource<T>({
  state,
  retry,
  children,
}: {
  state: LoadState<T>
  retry: () => void
  children: (data: T) => ReactNode
}) {
  if (state.kind === 'loading')
    return <SkeletonRows label="Завантажуємо інвентаризацію…" />
  if (state.kind === 'error') {
    return (
      <Notice tone="danger">
        Не вдалося завантажити дані.{' '}
        <button className="underline" onClick={retry} type="button">
          Повторити
        </button>
      </Notice>
    )
  }
  return children(state.data)
}

export function InventoryScreen({
  definition: _definition,
}: CabinetModuleScreenProps) {
  const { pathname } = useLocation()
  const segments = pathname.split('/').filter(Boolean)
  const route = segments[0] === 'app' ? segments.slice(2) : segments
  const partId = route[0] === 'parts' ? route[1] : undefined
  if (partId && route[2] === 'inventory') {
    return <PartPlacementView partId={partId} />
  }
  const tail = route[0] === 'inventory' ? route.slice(1) : []
  if (tail[0] === 'warehouses' && tail[1]) return <WarehouseView id={tail[1]} />
  if (tail[0] === 'sessions' && tail[1] === 'new') return <NewSessionView />
  if (tail[0] === 'sessions' && tail[1] && tail[2] === 'results')
    return <ResultsView id={tail[1]} />
  if (tail[0] === 'sessions' && tail[1] && tail[2] === 'audit')
    return <AuditView id={tail[1]} />
  if (tail[0] === 'sessions' && tail[1] && tail[2] === 'journal' && tail[3])
    return <JournalView id={tail[1]} zoneId={tail[3]} />
  if (tail[0] === 'sessions' && tail[1]) return <SessionView id={tail[1]} />
  return <Overview />
}

function useInventoryBase() {
  const { targetTenant } = useCabinet()
  return targetTenant ? cabinetPath(targetTenant.slug, 'inventory') : '/'
}

function usePermission(permission: string) {
  const { snapshot } = useCabinet()
  return snapshot?.permissions.has(permission) ?? false
}

function Overview() {
  const base = useInventoryBase()
  const canManage = usePermission('inventory.manage')
  const canZones = usePermission('inventory.zones.manage')
  const { requireLatestMutation } = useLatestMutationGuard(
    cabinetModules.inventory,
  )
  const warehousesLoader = useCallback(
    (signal: AbortSignal) => inventoryApi.getWarehouses({ signal }),
    [],
  )
  const sessionsLoader = useCallback(
    (signal: AbortSignal) => inventoryApi.getSessions({ signal }),
    [],
  )
  const warehouses = useLoad(warehousesLoader, 'warehouses')
  const sessions = useLoad(sessionsLoader, 'sessions')
  const [creating, setCreating] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)
  const createWarehouse = async (form: FormData) => {
    const name = formText(form, 'name')
    const code = formText(form, 'code')
    if (!name || !code) return
    setCreating(true)
    try {
      setOperationError(null)
      const scope = requireLatestMutation({
        permission: 'inventory.zones.manage',
        quota: false,
      })
      await inventoryApi.createWarehouse(
        { name, code },
        { signal: scope.signal },
      )
      warehouses.reload()
    } catch (error) {
      setOperationError(normalizeApiProblem(error).message)
    } finally {
      setCreating(false)
    }
  }
  return (
    <PageBody>
      <PageHeader
        eyebrow="Складський облік"
        title="Інвентаризація"
        actions={
          canManage ? (
            <Button asChild variant="primary">
              <Link to={`${base}/sessions/new`}>
                <Plus aria-hidden />
                Нова інвентаризація
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Складів"
          value={
            warehouses.state.kind === 'ready'
              ? warehouses.state.data.length
              : '—'
          }
        />
        <StatCard
          label="Активних сесій"
          value={
            sessions.state.kind === 'ready'
              ? sessions.state.data.filter(
                  (item) => item.status === 'inProgress',
                ).length
              : '—'
          }
          accent
        />
        <StatCard
          label="На перевірці"
          value={
            sessions.state.kind === 'ready'
              ? sessions.state.data.filter((item) => item.status === 'review')
                  .length
              : '—'
          }
        />
      </div>
      {operationError ? <Notice tone="danger">{operationError}</Notice> : null}
      {canZones ? (
        <Panel>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
            action={(form) => void createWarehouse(form)}
          >
            <label className="grid gap-1 text-sm text-app-dim">
              Назва
              <input
                name="name"
                required
                className="min-h-11 rounded-lg border border-app-line bg-app-canvas px-3 text-white"
              />
            </label>
            <label className="grid gap-1 text-sm text-app-dim">
              Код
              <input
                name="code"
                required
                className="min-h-11 rounded-lg border border-app-line bg-app-canvas px-3 font-mono text-white"
              />
            </label>
            <Button disabled={creating} type="submit">
              Додати склад
            </Button>
          </form>
        </Panel>
      ) : null}
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold text-white">Склади й зони</h2>
        <Resource state={warehouses.state} retry={warehouses.reload}>
          {(items) =>
            items.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {items.map((item) => (
                  <WarehouseCard key={item.id} item={item} base={base} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="Складів ще немає"
                description="Створіть перший склад, щоб налаштувати зони."
              />
            )
          }
        </Resource>
      </section>
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold text-white">Останні сесії</h2>
        <Resource state={sessions.state} retry={sessions.reload}>
          {(items) =>
            items.length ? (
              <div className="overflow-hidden rounded-panel border border-app-line">
                {items.map((item) => (
                  <SessionRow key={item.id} item={item} base={base} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="Інвентаризацій ще немає"
                description="Створіть сесію та передайте підрахунок працівникам у Mobile."
              />
            )
          }
        </Resource>
      </section>
    </PageBody>
  )
}

function WarehouseCard({ item, base }: { item: Warehouse; base: string }) {
  return (
    <Link
      className="rounded-panel border border-app-line bg-app-raised p-4 transition hover:border-brand/50"
      to={`${base}/warehouses/${item.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">{item.name}</h3>
          <p className="mt-1 font-mono text-xs text-app-dim">{item.code}</p>
        </div>
        {item.isSystemDefault ? (
          <StatusPill tone="info">Основний</StatusPill>
        ) : null}
      </div>
      <p className="mt-4 text-sm text-app-dim">{item.zoneCount} зон</p>
    </Link>
  )
}

function SessionRow({ item, base }: { item: InventorySession; base: string }) {
  const [label, tone] = sessionStatus(item.status)
  const completed = item.zones.filter(
    (zone) => zone.status === 'completed',
  ).length
  return (
    <Link
      className="grid gap-2 border-b border-app-line p-4 last:border-0 hover:bg-white/[0.025] sm:grid-cols-[1fr_auto_auto] sm:items-center"
      to={`${base}/sessions/${item.id}`}
    >
      <div>
        <strong className="text-white">{item.number}</strong>
        <p className="text-xs text-app-dim">Створено {date(item.createdAt)}</p>
      </div>
      <span className="text-sm tabular-nums text-app-dim">
        {completed}/{item.zones.length} зон
      </span>
      <StatusPill tone={tone}>{label}</StatusPill>
    </Link>
  )
}

function WarehouseView({ id }: { id: string }) {
  const base = useInventoryBase()
  const navigate = useNavigate()
  const canManage = usePermission('inventory.zones.manage')
  const { requireLatestMutation } = useLatestMutationGuard(
    cabinetModules.inventory,
  )
  const loader = useCallback(
    (signal: AbortSignal) => inventoryApi.getWarehouse(id, { signal }),
    [id],
  )
  const resource = useLoad(loader, id)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  const createZone = async (form: FormData) => {
    const name = formText(form, 'name')
    const code = formText(form, 'code')
    if (!name || !code) return
    try {
      setOperationError(null)
      const scope = requireLatestMutation({
        permission: 'inventory.zones.manage',
        quota: false,
      })
      await inventoryApi.createZone(
        { warehouseId: id, name, code },
        { signal: scope.signal },
      )
      resource.reload()
    } catch (error) {
      setOperationError(normalizeApiProblem(error).message)
    }
  }
  const editWarehouse = async (warehouse: WarehouseDetail) => {
    const name = window.prompt('Назва складу', warehouse.name)?.trim()
    if (!name) return
    const code = window.prompt('Код складу', warehouse.code)?.trim()
    if (!code) return
    try {
      setOperationError(null)
      const scope = requireLatestMutation({
        permission: 'inventory.zones.manage',
        quota: false,
      })
      await inventoryApi.updateWarehouse(
        id,
        {
          name,
          code,
          isActive: warehouse.isActive,
        },
        { signal: scope.signal },
      )
      resource.reload()
    } catch (error) {
      setOperationError(normalizeApiProblem(error).message)
    }
  }
  const archiveWarehouse = async (warehouse: WarehouseDetail) => {
    if (!window.confirm(`Архівувати склад «${warehouse.name}»?`)) return
    try {
      setOperationError(null)
      const scope = requireLatestMutation({
        permission: 'inventory.zones.manage',
        quota: false,
      })
      await inventoryApi.archiveWarehouse(id, { signal: scope.signal })
      void navigate(base, { replace: true })
    } catch (error) {
      setOperationError(normalizeApiProblem(error).message)
    }
  }
  const editZone = async (zone: WarehouseDetail['zones'][number]) => {
    const name = window.prompt('Назва зони', zone.name)?.trim()
    if (!name) return
    const code = window.prompt('Код зони', zone.code)?.trim()
    if (!code) return
    try {
      setOperationError(null)
      const scope = requireLatestMutation({
        permission: 'inventory.zones.manage',
        quota: false,
      })
      await inventoryApi.updateZone(
        zone.id,
        {
          name,
          code,
          isActive: zone.isActive,
        },
        { signal: scope.signal },
      )
      resource.reload()
    } catch (error) {
      setOperationError(normalizeApiProblem(error).message)
    }
  }
  const archiveZone = async (zone: WarehouseDetail['zones'][number]) => {
    if (!window.confirm(`Архівувати зону «${zone.name}»?`)) return
    try {
      setOperationError(null)
      const scope = requireLatestMutation({
        permission: 'inventory.zones.manage',
        quota: false,
      })
      await inventoryApi.archiveZone(zone.id, { signal: scope.signal })
      resource.reload()
    } catch (error) {
      setOperationError(normalizeApiProblem(error).message)
    }
  }
  const printZones = async () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      setOperationError('Браузер заблокував вікно друку.')
      return
    }
    printWindow.opener = null
    setPrinting(true)
    setOperationError(null)
    try {
      const zones = (await inventoryApi.getZones({ warehouseId: id })).filter(
        (zone) => zone.isActive && !zone.isSystemUnassigned,
      )
      const html = await buildZoneLabelHtml(
        zones.map((zone) => ({
          id: zone.id,
          qrCode: zone.qrCode,
          zoneName: zone.name,
          zoneCode: zone.code,
          warehouseName: zone.warehouseName,
        })),
      )
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.focus()
      printWindow.print()
    } catch {
      printWindow.close()
      setOperationError('Не вдалося підготувати QR-етикетки.')
    } finally {
      setPrinting(false)
    }
  }
  return (
    <PageBody>
      <PageHeader
        eyebrow={
          <Link className="hover:text-white" to={base}>
            Інвентаризація
          </Link>
        }
        title="Склад"
      />
      {operationError ? <Notice tone="danger">{operationError}</Notice> : null}
      <Resource state={resource.state} retry={resource.reload}>
        {(warehouse: WarehouseDetail) => (
          <>
            <Panel>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    {warehouse.name}
                  </h2>
                  <p className="mt-1 font-mono text-xs text-app-dim">
                    {warehouse.code}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={printing}
                    onClick={() => void printZones()}
                    variant="quiet"
                  >
                    <Printer aria-hidden />
                    Друкувати QR зон
                  </Button>
                  {canManage ? (
                    <Button
                      onClick={() => void editWarehouse(warehouse)}
                      variant="ghost"
                    >
                      <Pencil aria-hidden />
                      Редагувати склад
                    </Button>
                  ) : null}
                  {canManage && !warehouse.isSystemDefault ? (
                    <Button
                      onClick={() => void archiveWarehouse(warehouse)}
                      variant="danger"
                    >
                      Архівувати склад
                    </Button>
                  ) : null}
                </div>
              </div>
              <p className="mt-3 text-sm text-app-dim">
                Без зони: {warehouse.unassignedPartCount} запчастин
              </p>
            </Panel>
            {canManage ? (
              <Panel>
                <form
                  className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
                  action={(form) => void createZone(form)}
                >
                  <label className="grid gap-1 text-sm text-app-dim">
                    Назва зони
                    <input
                      name="name"
                      required
                      className="min-h-11 rounded-lg border border-app-line bg-app-canvas px-3 text-white"
                    />
                  </label>
                  <label className="grid gap-1 text-sm text-app-dim">
                    Код
                    <input
                      name="code"
                      required
                      className="min-h-11 rounded-lg border border-app-line bg-app-canvas px-3 text-white"
                    />
                  </label>
                  <Button type="submit">Додати зону</Button>
                </form>
              </Panel>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {warehouse.zones.map((zone) => (
                <Panel key={zone.id}>
                  <div className="flex justify-between gap-2">
                    <div>
                      <strong className="text-white">{zone.name}</strong>
                      <p className="font-mono text-xs text-app-dim">
                        {zone.code}
                      </p>
                    </div>
                    {zone.isSystemUnassigned ? (
                      <StatusPill tone="neutral">Системна</StatusPill>
                    ) : (
                      <ClipboardCheck className="text-brand" aria-hidden />
                    )}
                  </div>
                  {canManage && !zone.isSystemUnassigned ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        aria-label={`Редагувати зону ${zone.name}`}
                        onClick={() => void editZone(zone)}
                        variant="ghost"
                      >
                        <Pencil aria-hidden />
                        Редагувати
                      </Button>
                      <Button
                        aria-label={`Архівувати зону ${zone.name}`}
                        onClick={() => void archiveZone(zone)}
                        variant="danger"
                      >
                        Архівувати
                      </Button>
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          </>
        )}
      </Resource>
    </PageBody>
  )
}

function NewSessionView() {
  const base = useInventoryBase()
  const navigate = useNavigate()
  const canManage = usePermission('inventory.manage')
  const { requireLatestMutation } = useLatestMutationGuard(
    cabinetModules.inventory,
  )
  const loader = useCallback(
    (signal: AbortSignal) => inventoryApi.getZones({ signal }),
    [],
  )
  const zones = useLoad(loader, 'zones')
  const [selected, setSelected] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)
  const create = async () => {
    if (!canManage || !selected.length) return
    setCreating(true)
    setOperationError(null)
    try {
      const scope = requireLatestMutation({ quota: false })
      const session = await inventoryApi.createSession(selected, {
        signal: scope.signal,
      })
      void navigate(`${base}/sessions/${session.id}`, { replace: true })
    } catch (error) {
      setOperationError(normalizeApiProblem(error).message)
    } finally {
      setCreating(false)
    }
  }
  return (
    <PageBody width="narrow">
      <PageHeader
        eyebrow={<Link to={base}>Інвентаризація</Link>}
        title="Нова інвентаризація"
      />
      <Notice tone="info">
        Підрахунок виконуватиметься працівниками у Mobile. Тут ви обираєте зони
        та запускаєте сесію.
      </Notice>
      {!canManage ? (
        <Notice tone="danger">
          Для створення інвентаризації потрібен дозвіл керування.
        </Notice>
      ) : null}
      {operationError ? <Notice tone="danger">{operationError}</Notice> : null}
      <Resource state={zones.state} retry={zones.reload}>
        {(items: InventoryZone[]) => (
          <Panel>
            <div className="grid gap-2">
              {items
                .filter((zone) => zone.isActive && !zone.isSystemUnassigned)
                .map((zone) => (
                  <label
                    className="flex min-h-11 items-center gap-3 rounded-lg border border-app-line px-3 text-white"
                    key={zone.id}
                  >
                    <input
                      checked={selected.includes(zone.id)}
                      disabled={!canManage}
                      onChange={() =>
                        setSelected((value) =>
                          value.includes(zone.id)
                            ? value.filter((id) => id !== zone.id)
                            : [...value, zone.id],
                        )
                      }
                      type="checkbox"
                    />
                    <span>
                      {zone.warehouseName} · {zone.name}
                    </span>
                  </label>
                ))}
            </div>
            <Button
              className="mt-4 w-full"
              disabled={creating || !canManage || !selected.length}
              onClick={() => void create()}
              variant="primary"
            >
              Створити чернетку
            </Button>
          </Panel>
        )}
      </Resource>
    </PageBody>
  )
}

function SessionView({ id }: { id: string }) {
  const base = useInventoryBase()
  const canManage = usePermission('inventory.manage')
  const { requireLatestMutation } = useLatestMutationGuard(
    cabinetModules.inventory,
  )
  const loader = useCallback(
    (signal: AbortSignal) => inventoryApi.getSession(id, { signal }),
    [id],
  )
  const resource = useLoad(loader, id)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [acting, setActing] = useState(false)
  const isInProgress =
    resource.state.kind === 'ready' &&
    resource.state.data.status === 'inProgress'
  useEffect(() => {
    if (!isInProgress) return
    const timer = window.setInterval(
      () => document.visibilityState === 'visible' && resource.refresh(),
      10_000,
    )
    return () => window.clearInterval(timer)
  }, [isInProgress, resource])
  const act = async (action: 'start' | 'complete' | 'reopen' | 'cancel') => {
    if (acting) return
    if (!window.confirm('Підтвердити дію із сесією?')) return
    const reason =
      action === 'cancel'
        ? window.prompt('Причина скасування')?.trim()
        : undefined
    if (action === 'cancel' && !reason) return
    setActing(true)
    try {
      setOperationError(null)
      const scope = requireLatestMutation({ quota: false })
      const options = { signal: scope.signal }
      if (action === 'start') await inventoryApi.startSession(id, options)
      if (action === 'complete') await inventoryApi.completeSession(id, options)
      if (action === 'reopen') await inventoryApi.reopenSession(id, options)
      if (action === 'cancel' && reason) {
        await inventoryApi.cancelSession(id, reason, options)
      }
      resource.reload()
    } catch (error) {
      setOperationError(normalizeApiProblem(error).message)
    } finally {
      setActing(false)
    }
  }
  return (
    <PageBody>
      <Resource state={resource.state} retry={resource.reload}>
        {(session) => {
          const [label, tone] = sessionStatus(session.status)
          const completed = session.zones.filter(
            (zone) => zone.status === 'completed',
          ).length
          return (
            <>
              <PageHeader
                eyebrow={<Link to={base}>Інвентаризація</Link>}
                title={session.number}
                actions={
                  <>
                    <Button onClick={resource.reload} variant="ghost">
                      <RefreshCw aria-hidden />
                      Оновити
                    </Button>
                    {session.status !== 'draft' ? (
                      <Button asChild variant="quiet">
                        <Link to={`${base}/sessions/${id}/results`}>
                          Результати
                        </Link>
                      </Button>
                    ) : null}
                    <Button asChild variant="quiet">
                      <Link to={`${base}/sessions/${id}/audit`}>Аудит</Link>
                    </Button>
                  </>
                }
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard
                  label="Статус"
                  value={<StatusPill tone={tone}>{label}</StatusPill>}
                />
                <StatCard
                  label="Завершено зон"
                  value={`${completed}/${session.zones.length}`}
                  accent
                />
                <StatCard
                  label="Запчастин у зрізі"
                  value={session.preview.includedPartCount}
                />
              </div>
              {operationError ? (
                <Notice tone="danger">{operationError}</Notice>
              ) : null}
              {canManage ? (
                <Panel className="flex flex-wrap gap-2">
                  {session.status === 'draft' ? (
                    <Button
                      disabled={acting}
                      onClick={() => void act('start')}
                      variant="primary"
                    >
                      Запустити
                    </Button>
                  ) : null}
                  {session.status === 'review' ? (
                    <Button
                      onClick={() => void act('complete')}
                      disabled={acting}
                      variant="primary"
                    >
                      Завершити
                    </Button>
                  ) : null}
                  {session.status === 'review' ? (
                    <Button
                      disabled={acting}
                      onClick={() => void act('reopen')}
                      variant="quiet"
                    >
                      Відкрити повторно
                    </Button>
                  ) : null}
                  {!['completed', 'cancelled'].includes(session.status) ? (
                    <Button
                      disabled={acting}
                      onClick={() => void act('cancel')}
                      variant="danger"
                    >
                      <Archive aria-hidden />
                      Скасувати
                    </Button>
                  ) : null}
                </Panel>
              ) : null}
              <div className="overflow-hidden rounded-panel border border-app-line">
                {session.zones.map((zone) => (
                  <div
                    className="grid gap-2 border-b border-app-line p-4 last:border-0 sm:grid-cols-[1fr_auto]"
                    key={zone.zoneId}
                  >
                    <div>
                      <strong className="text-white">{zone.zoneName}</strong>
                      <p className="text-xs text-app-dim">
                        {zone.warehouseName} · {zone.zoneCode}
                      </p>
                      {zone.leaseOwnerUserId ? (
                        <p className="mt-2 text-xs text-state-warn">
                          Зона зайнята користувачем до{' '}
                          {date(zone.leaseExpiresAt)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button asChild size="md" variant="quiet">
                        <Link
                          to={`${base}/sessions/${id}/journal/${zone.zoneId}`}
                        >
                          Журнал
                        </Link>
                      </Button>
                      <StatusPill
                        tone={
                          zone.status === 'completed'
                            ? 'ok'
                            : zone.status === 'counting'
                              ? 'warn'
                              : 'neutral'
                        }
                      >
                        {zone.status === 'completed'
                          ? 'Завершено'
                          : zone.status === 'counting'
                            ? 'Підрахунок триває'
                            : 'Очікує'}
                      </StatusPill>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )
        }}
      </Resource>
    </PageBody>
  )
}

function ResultsView({ id }: { id: string }) {
  const base = useInventoryBase()
  const canAdjust = usePermission('inventory.adjust')
  const { requireLatestMutation } = useLatestMutationGuard(
    cabinetModules.inventory,
  )
  const loader = useCallback(
    async (signal: AbortSignal) => {
      const [results, session, audit] = await Promise.all([
        inventoryApi.getResults(id, { signal }),
        inventoryApi.getSession(id, { signal }),
        inventoryApi.getAudit(id, { signal }),
      ])
      return { results, session, audit }
    },
    [id],
  )
  const resource = useLoad(loader, id)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [adjustingPartId, setAdjustingPartId] = useState<string | null>(null)
  const [resultFilter, setResultFilter] = useState<'all' | 'discrepancies'>(
    'discrepancies',
  )
  const adjust = async (part: InventoryPartResult) => {
    if (adjustingPartId) return
    const reason = window
      .prompt(`Причина коригування: ${part.partName}`)
      ?.trim()
    if (!reason) return
    setAdjustingPartId(part.partId)
    try {
      setOperationError(null)
      const scope = requireLatestMutation({
        permission: 'inventory.adjust',
        quota: false,
      })
      await inventoryApi.applyAdjustment(id, part.partId, reason, {
        signal: scope.signal,
      })
      resource.reload()
    } catch (error) {
      setOperationError(normalizeApiProblem(error).message)
    } finally {
      setAdjustingPartId(null)
    }
  }
  return (
    <PageBody>
      <PageHeader
        eyebrow={<Link to={`${base}/sessions/${id}`}>Сесія</Link>}
        title="Результати інвентаризації"
      />
      {operationError ? <Notice tone="danger">{operationError}</Notice> : null}
      <Resource state={resource.state} retry={resource.reload}>
        {({
          results,
          session,
          audit,
        }: {
          results: InventorySessionResults
          session: InventorySession
          audit: InventoryAuditEvent[]
        }) => {
          const adjustedPartIds = new Set(
            audit.flatMap((event) =>
              event.adjustmentId && event.partId ? [event.partId] : [],
            ),
          )
          const visibleParts = results.parts.filter(
            (part) => resultFilter === 'all' || part.delta !== 0,
          )
          return (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="Позицій" value={results.parts.length} />
                <StatCard
                  label="Нестач"
                  value={results.parts.filter((part) => part.delta < 0).length}
                />
                <StatCard
                  label="Надлишків"
                  value={results.parts.filter((part) => part.delta > 0).length}
                  accent
                />
              </div>
              <label className="grid max-w-xs gap-1 text-sm text-app-dim">
                Показати
                <select
                  className="min-h-11 rounded-lg border border-app-line bg-app-canvas px-3 text-white"
                  onChange={(event) =>
                    setResultFilter(
                      event.target.value as 'all' | 'discrepancies',
                    )
                  }
                  value={resultFilter}
                >
                  <option value="discrepancies">Лише розбіжності</option>
                  <option value="all">Усі позиції</option>
                </select>
              </label>
              <div className="overflow-hidden rounded-panel border border-app-line">
                {visibleParts.map((part) => (
                  <ResultRow
                    key={part.partId}
                    part={part}
                    adjusted={adjustedPartIds.has(part.partId)}
                    pending={adjustingPartId === part.partId}
                    {...(canAdjust &&
                    session.status === 'review' &&
                    part.delta !== 0 &&
                    !part.hasCoverageWarning &&
                    !adjustedPartIds.has(part.partId)
                      ? { adjust: () => void adjust(part) }
                      : {})}
                  />
                ))}
              </div>
            </>
          )
        }}
      </Resource>
    </PageBody>
  )
}

function ResultRow({
  part,
  adjusted,
  pending,
  adjust,
}: {
  part: InventoryPartResult
  adjusted: boolean
  pending: boolean
  adjust?: () => void
}) {
  const [label, tone] = resultStatus(part.result)
  const delta =
    part.delta > 0
      ? `+${part.delta}`
      : part.delta < 0
        ? `−${Math.abs(part.delta)}`
        : '0'
  return (
    <div className="grid gap-3 border-b border-app-line p-4 last:border-0 md:grid-cols-[minmax(0,1fr)_repeat(3,6rem)_auto] md:items-center">
      <div>
        <strong className="text-white">{part.partName}</strong>
        <p className="font-mono text-xs text-app-dim">{part.partQrCode}</p>
      </div>
      <span className="text-sm text-app-dim">
        Очікувалось <b className="text-white">{part.expectedQuantity}</b>
      </span>
      <span className="text-sm text-app-dim">
        Фактично <b className="text-white">{part.actualQuantity}</b>
      </span>
      <strong
        className={
          part.delta < 0
            ? 'text-state-danger'
            : part.delta > 0
              ? 'text-state-warn'
              : 'text-state-ok'
        }
      >
        {delta}
      </strong>
      <div className="flex items-center gap-2">
        <StatusPill tone={tone as 'neutral'}>{label}</StatusPill>
        {part.hasCoverageWarning ? (
          <StatusPill tone="warn">Перевірте зони</StatusPill>
        ) : null}
        {adjusted ? <StatusPill tone="ok">Скориговано</StatusPill> : null}
        {adjust ? (
          <Button
            aria-label={`Скоригувати ${part.partName}`}
            aria-busy={pending}
            disabled={pending}
            onClick={adjust}
            size="md"
            variant="quiet"
          >
            Скоригувати
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function AuditView({ id }: { id: string }) {
  const base = useInventoryBase()
  const loader = useCallback(
    (signal: AbortSignal) => inventoryApi.getAudit(id, { signal }),
    [id],
  )
  const resource = useLoad(loader, id)
  return (
    <PageBody>
      <PageHeader
        eyebrow={<Link to={`${base}/sessions/${id}`}>Сесія</Link>}
        title="Аудит інвентаризації"
      />
      <Resource state={resource.state} retry={resource.reload}>
        {(events: InventoryAuditEvent[]) =>
          events.length ? (
            <div className="overflow-hidden rounded-panel border border-app-line">
              {events.map((event) => (
                <div
                  className="grid gap-1 border-b border-app-line p-4 last:border-0 sm:grid-cols-[1fr_auto]"
                  key={event.id}
                >
                  <strong className="text-white">{event.action}</strong>
                  <time className="text-xs text-app-dim">
                    {date(event.createdAt)}
                  </time>
                  <p className="font-mono text-xs text-app-dim">
                    {event.actorUserId}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Подій аудиту ще немає"
              description="Дії із сесією з’являться тут автоматично."
            />
          )
        }
      </Resource>
    </PageBody>
  )
}

function JournalView({ id, zoneId }: { id: string; zoneId: string }) {
  const base = useInventoryBase()
  const loader = useCallback(
    (signal: AbortSignal) => inventoryApi.getScans(id, zoneId, { signal }),
    [id, zoneId],
  )
  const resource = useLoad(loader, `${id}:${zoneId}`)
  return (
    <PageBody>
      <PageHeader
        eyebrow={<Link to={`${base}/sessions/${id}`}>Сесія</Link>}
        title="Журнал сканувань"
      />
      <Notice tone="info">
        Це журнал підрахунку з Mobile. У Web він доступний лише для перегляду.
      </Notice>
      <Resource state={resource.state} retry={resource.reload}>
        {(scans: InventoryScan[]) =>
          scans.length ? (
            <div className="overflow-hidden rounded-panel border border-app-line">
              {scans.map((scan) => (
                <div
                  className="grid gap-2 border-b border-app-line p-4 last:border-0 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                  key={scan.id}
                >
                  <div>
                    <strong className="text-white">{scan.partName}</strong>
                    <p className="font-mono text-xs text-app-dim">
                      {scan.partQrCode}
                    </p>
                  </div>
                  <time className="text-xs text-app-dim">
                    {date(scan.scannedAt)}
                  </time>
                  {scan.voidedAt ? (
                    <div className="grid justify-items-end gap-1">
                      <StatusPill tone="danger">Скасовано</StatusPill>
                      {scan.voidReason ? (
                        <span className="text-xs text-app-dim">
                          {scan.voidReason}
                        </span>
                      ) : null}
                    </div>
                  ) : scan.unexpected ? (
                    <StatusPill tone="warn">Несподівана</StatusPill>
                  ) : (
                    <StatusPill tone="ok">Очікувана</StatusPill>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Сканувань ще немає"
              description="Записи з’являться після підрахунку в Mobile."
            />
          )
        }
      </Resource>
    </PageBody>
  )
}

function PartPlacementView({ partId }: { partId: string }) {
  const { targetTenant } = useCabinet()
  const canManage = usePermission('inventory.zones.manage')
  const { requireLatestMutation } = useLatestMutationGuard(
    cabinetModules.inventory,
  )
  const loader = useCallback(
    async (signal: AbortSignal) => {
      const [zones, placement] = await Promise.all([
        inventoryApi.getZones({ signal }),
        inventoryApi.getPartZones(partId, { signal }),
      ])
      return { zones, placement }
    },
    [partId],
  )
  const resource = useLoad(loader, partId)
  const [selection, setSelection] = useState<string[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [operationError, setOperationError] = useState<string | null>(null)
  const selected = useMemo(
    () =>
      selection ??
      (resource.state.kind === 'ready'
        ? resource.state.data.placement.map((zone) => zone.zoneId)
        : []),
    [resource.state, selection],
  )

  const save = async () => {
    if (!canManage || !selected.length) return
    setSaving(true)
    try {
      setOperationError(null)
      const scope = requireLatestMutation({
        permission: 'inventory.zones.manage',
        quota: false,
      })
      await inventoryApi.replacePartZones(partId, selected, {
        signal: scope.signal,
      })
      setSelection(null)
      resource.reload()
    } catch (error) {
      setOperationError(normalizeApiProblem(error).message)
    } finally {
      setSaving(false)
    }
  }

  const back = targetTenant
    ? cabinetPath(targetTenant.slug, 'parts', partId)
    : '/'
  return (
    <PageBody width="narrow">
      <PageHeader
        eyebrow={<Link to={back}>Запчастина</Link>}
        title="Розміщення по зонах"
      />
      <Notice tone="info">
        Виберіть щонайменше одну зону зберігання. Системна зона «Без зони» не
        показується серед фізичних місць.
      </Notice>
      {operationError ? <Notice tone="danger">{operationError}</Notice> : null}
      <Resource state={resource.state} retry={resource.reload}>
        {({ zones: items }: { zones: InventoryZone[] }) => (
          <Panel>
            <div className="grid gap-2">
              {items
                .filter((zone) => zone.isActive && !zone.isSystemUnassigned)
                .map((zone) => {
                  const checked = selected.includes(zone.id)
                  return (
                    <label
                      className="flex min-h-11 items-center gap-3 rounded-lg border border-app-line px-3 text-white"
                      key={zone.id}
                    >
                      <input
                        aria-label={`${zone.warehouseName} · ${zone.name}`}
                        checked={checked}
                        disabled={!canManage}
                        onChange={() =>
                          setSelection((value) => {
                            const current = value ?? selected
                            return checked
                              ? current.filter((id) => id !== zone.id)
                              : [...current, zone.id]
                          })
                        }
                        type="checkbox"
                      />
                      <span>
                        {zone.warehouseName} · {zone.name}
                      </span>
                    </label>
                  )
                })}
            </div>
            {canManage ? (
              <Button
                className="mt-4 w-full"
                disabled={saving || !selected.length}
                onClick={() => void save()}
                variant="primary"
              >
                Зберегти розміщення
              </Button>
            ) : null}
          </Panel>
        )}
      </Resource>
    </PageBody>
  )
}
