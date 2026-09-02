import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { Copy, MessageSquare, Phone, Plus } from 'lucide-react'
import {
  Button,
  Fact,
  DataTable,
  DeniedState,
  EmptyState,
  ErrorState,
  Field,
  Notice,
  PageBody,
  PageHeader,
  Pagination,
  Panel,
  SearchInput,
  SkeletonRows,
  StatStrip,
  StatusPill,
  Toolbar,
} from '@/components/app'
import {
  customersApi,
  readCustomerPhoneConflict,
  type CustomerDetail,
  type CustomerListItem,
  type CustomerPhoneConflict,
} from '@/api/customers'
import type { Permission } from '../access-types'
import type { CabinetModuleScreenProps } from '../ModuleBoundary'
import { useCabinet } from '../CabinetContext'
import { evaluateModuleAccess, type ModuleAccessOperation } from '../policy'
import { useLatestMutationGuard } from '../use-latest-mutation-guard'

const loadError = 'Не вдалося завантажити дані. Спробуйте ще раз.'
const idFromPath = (path: string) =>
  /\/customers\/([^/]+)/.exec(path)?.[1] ?? null
const customerDirectoryPath = (path: string) =>
  path.replace(/\/new$|\/[^/]+\/edit$/, '')
function canAccess(
  definition: CabinetModuleScreenProps['definition'],
  cabinet: ReturnType<typeof useCabinet>,
  operation: ModuleAccessOperation,
  permission?: Permission,
) {
  const access =
    cabinet.status === 'ready' && cabinet.snapshot !== null
      ? { status: 'ready' as const, snapshot: cabinet.snapshot, error: null }
      : cabinet.status === 'error'
        ? { status: 'error' as const, snapshot: null, error: cabinet.error }
        : { status: 'loading' as const, snapshot: null, error: null }
  const scopedDefinition =
    permission === undefined
      ? definition
      : operation === 'view'
        ? { ...definition, viewPermission: permission }
        : { ...definition, mutationPermission: permission }
  return (
    evaluateModuleAccess(scopedDefinition, access, operation).kind === 'allowed'
  )
}

function useDialogFocus(open: boolean) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    dialogRef.current
      ?.querySelector<HTMLElement>('button:not([disabled])')
      ?.focus()
    return () => trigger?.focus()
  }, [open])
  const containFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled])',
    )
    if (!controls?.length) return
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }
  return { containFocus, dialogRef, triggerRef }
}

export function CustomersScreen({ definition }: CabinetModuleScreenProps) {
  const location = useLocation()
  const id = idFromPath(location.pathname)
  if (location.pathname.endsWith('/new'))
    return <CustomerForm definition={definition} customerId={null} />
  if (location.pathname.endsWith('/edit'))
    return <CustomerForm definition={definition} customerId={id} />
  return id ? (
    <CustomerDetailScreen definition={definition} customerId={id} />
  ) : (
    <CustomerDirectory definition={definition} />
  )
}

function CustomerDirectory({ definition }: CabinetModuleScreenProps) {
  const cabinet = useCabinet()
  const mutationsAllowed = canAccess(definition, cabinet, 'mutation')
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 1) || 1
  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void customersApi
      .list({ ...(q ? { q } : {}), page }, { signal: controller.signal })
      .then((result) => {
        setCustomers(result.items)
        setTotal(result.total)
        setTotalPages(result.totalPages)
        setError(null)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(loadError)
      })
    return () => controller.abort()
  }, [page, q])

  return (
    <PageBody>
      <PageHeader
        actions={
          mutationsAllowed ? (
            <Button asChild variant="primary">
              <Link to="new">
                <Plus aria-hidden />
                Новий клієнт
              </Link>
            </Button>
          ) : undefined
        }
        eyebrow="Продажі"
        title="Клієнти"
      />
      <Toolbar>
        <Field className="min-w-52 flex-1" label="Пошук">
          <SearchInput
            onChange={(event) =>
              setParams(
                event.target.value ? { q: event.target.value, page: '1' } : {},
              )
            }
            placeholder="Ім’я або телефон"
            value={q}
          />
        </Field>
      </Toolbar>
      {error && <Notice tone="danger">{error}</Notice>}
      <StatStrip items={[{ label: 'знайдено', value: total }]} />
      <DataTable
        caption="Список клієнтів"
        columns={[
          {
            key: 'name',
            label: 'Клієнт',
            variant: 'primary',
            cell: (customer) => (
              <Link className="hover:text-brand block" to={customer.id}>
                {customer.name}
              </Link>
            ),
          },
          {
            key: 'orders',
            label: 'Замовлень',
            align: 'end',
            cell: (customer) => customer.ordersCount,
          },
        ]}
        empty={
          <EmptyState
            description="Клієнти з’являються після першого замовлення або коли ви додасте їх самі."
            title="Клієнтів поки немає"
          />
        }
        footer={
          <Pagination
            label="Сторінки клієнтів"
            onPage={(nextPage) => {
              const next = new URLSearchParams(params)
              next.set('page', String(nextPage))
              setParams(next)
            }}
            page={page}
            totalPages={Math.max(totalPages, 1)}
          />
        }
        rowKey={(customer) => customer.id}
        rows={customers}
      />
    </PageBody>
  )
}

function CustomerDetailScreen({
  definition,
  customerId,
}: CabinetModuleScreenProps & { customerId: string }) {
  const cabinet = useCabinet()
  const { requireLatestMutation } = useLatestMutationGuard(definition)
  const mutationsAllowed = canAccess(definition, cabinet, 'mutation')
  const ordersViewAllowed = canAccess(
    definition,
    cabinet,
    'view',
    'orders.view',
  )
  const financeViewAllowed = canAccess(
    definition,
    cabinet,
    'view',
    'finance.view',
  )
  const orderCreateAllowed =
    canAccess(definition, cabinet, 'mutation', 'orders.manage') &&
    cabinet.snapshot?.permissions.has('parts.view') === true
  const [customer, setCustomer] = useState<CustomerDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { containFocus, dialogRef, triggerRef } = useDialogFocus(confirmDelete)
  const navigate = useNavigate()
  useEffect(() => {
    if (!ordersViewAllowed) return
    const controller = new AbortController()
    void customersApi
      .getById(customerId, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setCustomer(result)
          setError(null)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(loadError)
      })
    return () => controller.abort()
  }, [customerId, ordersViewAllowed])
  const updateLifecycle = async () => {
    if (!customer || busy || !mutationsAllowed) return
    setBusy(true)
    try {
      const scope = requireLatestMutation({ quota: false })
      requireLatestMutation({ permission: 'orders.view', quota: false })
      setCustomer(
        customer.isActive
          ? await customersApi.deactivate(customer.id, {
              signal: scope.signal,
            })
          : await customersApi.activate(customer.id, {
              signal: scope.signal,
            }),
      )
      setError(null)
    } catch {
      setError(loadError)
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!customer || busy || !mutationsAllowed || customer.ordersCount !== 0)
      return
    setBusy(true)
    try {
      const scope = requireLatestMutation({ quota: false })
      requireLatestMutation({ permission: 'orders.view', quota: false })
      await customersApi.remove(customer.id, { signal: scope.signal })
      await navigate('..', { replace: true })
    } catch {
      setError(loadError)
      setBusy(false)
    }
  }
  if (!ordersViewAllowed)
    return (
      <PageBody width="narrow">
        <DeniedState
          description="Картка клієнта показує його замовлення, тож потрібен доступ до розділу «Замовлення»."
          role="alert"
          title="Потрібен доступ до замовлень."
        />
      </PageBody>
    )
  if (error)
    return (
      <PageBody width="narrow">
        <ErrorState
          description={error}
          title="Не вдалося завантажити клієнта"
        />
      </PageBody>
    )
  if (!customer)
    return (
      <PageBody width="narrow">
        <SkeletonRows label="Завантажуємо клієнта…" rows={3} />
      </PageBody>
    )
  const orderPath = `/app/${cabinet.targetTenant?.slug ?? ''}/orders/new?customerId=${encodeURIComponent(customer.id)}`
  return (
    <PageBody>
      <PageHeader
        actions={
          <StatusPill tone={customer.isActive ? 'ok' : 'neutral'}>
            {customer.isActive ? 'Активний' : 'Неактивний'}
          </StatusPill>
        }
        eyebrow="Продажі · Клієнти"
        title={customer.name}
      />
      <dl className="grid gap-3 sm:grid-cols-3">
        <Fact label="Замовлень">
          {customer.ordersCount === null ? '—' : String(customer.ordersCount)}
        </Fact>
        {financeViewAllowed && (
          <>
            <Fact label="Витрачено">{String(customer.totalAmount ?? '—')}</Fact>
            <Fact label="Середній чек">
              {String(customer.averageAmount ?? '—')}
            </Fact>
          </>
        )}
      </dl>
      <Panel className="flex flex-wrap items-center gap-2">
        {customer.phone && (
          <>
            <span className="text-app-muted mr-1 font-mono text-sm">
              {customer.phone}
            </span>
            <Button asChild>
              <a href={`tel:${customer.phone}`} aria-label="Зателефонувати">
                <Phone aria-hidden />
                Зателефонувати
              </a>
            </Button>
            <Button asChild>
              <a href={`sms:${customer.phone}`} aria-label="SMS">
                <MessageSquare aria-hidden />
                SMS
              </a>
            </Button>
            <Button
              onClick={() =>
                void navigator.clipboard.writeText(customer.phone!)
              }
            >
              <Copy aria-hidden />
              Копіювати телефон
            </Button>
          </>
        )}
        {orderCreateAllowed && customer.isActive && (
          <Button asChild variant="primary">
            <Link to={orderPath}>Створити замовлення</Link>
          </Button>
        )}
        {mutationsAllowed && (
          <>
            <Button asChild>
              <Link to="edit">Редагувати</Link>
            </Button>
            <Button disabled={busy} onClick={() => void updateLifecycle()}>
              {customer.isActive ? 'Деактивувати' : 'Активувати'}
            </Button>
            {customer.ordersCount === 0 && (
              <Button
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
                ref={triggerRef}
                variant="danger"
              >
                Видалити
              </Button>
            )}
          </>
        )}
      </Panel>
      {confirmDelete && (
        <div
          ref={dialogRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="customer-delete-title"
          aria-describedby="customer-delete-description"
          className="bg-app-overlay border-app-line-2 rounded-sheet grid gap-3 border p-5"
          onKeyDown={containFocus}
        >
          <h2
            className="text-lg font-semibold text-white"
            id="customer-delete-title"
          >
            Підтвердити видалення
          </h2>
          <p
            className="text-app-muted text-sm"
            id="customer-delete-description"
          >
            Картка клієнта та його контакти зникнуть назавжди. Замовлень у нього
            немає, тож історія продажів не постраждає.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => setConfirmDelete(false)} disabled={busy}>
              Скасувати
            </Button>
            <Button
              onClick={() => void remove()}
              disabled={busy}
              variant="danger"
            >
              Підтвердити
            </Button>
          </div>
        </div>
      )}
      <section className="grid gap-2">
        <h2 className="text-base font-semibold text-white">
          Історія замовлень
        </h2>
        <DataTable
          caption="Історія замовлень клієнта"
          columns={[
            {
              key: 'number',
              label: 'Замовлення',
              variant: 'primary',
              cell: (order) => (
                <Link
                  className="hover:text-brand block"
                  to={`/app/${cabinet.targetTenant?.slug ?? ''}/orders/${order.id}`}
                >
                  #{order.number}
                </Link>
              ),
            },
            {
              key: 'status',
              label: 'Статус',
              cell: (order) => order.status,
            },
            {
              key: 'total',
              label: 'Сума',
              align: 'end',
              cell: (order) =>
                `${String(order.totalAmount ?? '—')} ${order.currency ?? ''}`.trim(),
            },
          ]}
          empty={
            <EmptyState
              description="Щойно клієнт зробить перше замовлення, воно зʼявиться тут."
              title="Замовлень ще не було"
            />
          }
          rowKey={(order) => order.id}
          rows={customer.orders}
        />
      </section>
    </PageBody>
  )
}

function CustomerForm({
  definition,
  customerId,
}: CabinetModuleScreenProps & { customerId: string | null }) {
  const cabinet = useCabinet()
  const { requireLatestMutation } = useLatestMutationGuard(definition)
  const mutationsAllowed = canAccess(definition, cabinet, 'mutation')
  const ordersViewAllowed =
    customerId === null || canAccess(definition, cabinet, 'view', 'orders.view')
  const navigate = useNavigate()
  const location = useLocation()
  const directoryPath = customerDirectoryPath(location.pathname)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [duplicate, setDuplicate] = useState<CustomerPhoneConflict | null>(null)
  useEffect(() => {
    if (customerId && ordersViewAllowed) {
      const controller = new AbortController()
      void customersApi
        .getById(customerId, { signal: controller.signal })
        .then((customer) => {
          if (!controller.signal.aborted) {
            setName(customer.name)
            setPhone(customer.phone ?? '')
            setNotes(customer.notes ?? '')
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setError(loadError)
        })
      return () => controller.abort()
    }
  }, [customerId, ordersViewAllowed])
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || busy || !mutationsAllowed || !ordersViewAllowed) return
    setBusy(true)
    setError(null)
    setDuplicate(null)
    try {
      const scope = requireLatestMutation({ quota: false })
      if (customerId)
        requireLatestMutation({ permission: 'orders.view', quota: false })
      const input = {
        name: name.trim(),
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      }
      const result = customerId
        ? await customersApi.update(customerId, input, {
            signal: scope.signal,
          })
        : await customersApi.create(input, { signal: scope.signal })
      await navigate(`${directoryPath}/${customerId ?? result.customer.id}`, {
        replace: true,
      })
    } catch (saveError) {
      const conflict = readCustomerPhoneConflict(saveError)
      if (conflict) setDuplicate(conflict)
      else setError(loadError)
      setBusy(false)
    }
  }
  const reactivateDuplicate = async () => {
    if (!duplicate || busy || !mutationsAllowed) return
    setBusy(true)
    try {
      const scope = requireLatestMutation({ quota: false })
      if (customerId)
        requireLatestMutation({ permission: 'orders.view', quota: false })
      await customersApi.activate(duplicate.customerId, {
        signal: scope.signal,
      })
      await navigate(`${directoryPath}/${duplicate.customerId}`, {
        replace: true,
      })
    } catch {
      setError(loadError)
      setBusy(false)
    }
  }
  if (!ordersViewAllowed)
    return <p role="alert">Потрібен доступ до замовлень.</p>
  return (
    <section className="grid gap-6">
      <h1 className="text-3xl text-white">
        {customerId ? 'Редагувати клієнта' : 'Новий клієнт'}
      </h1>
      <form onSubmit={(event) => void save(event)} className="grid gap-4">
        <label>
          Ім’я
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            disabled={!mutationsAllowed}
          />
        </label>
        <label>
          Телефон
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            inputMode="tel"
            disabled={!mutationsAllowed}
          />
        </label>
        <label>
          Нотатки
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={!mutationsAllowed}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        {duplicate && (
          <div role="alert" className="grid gap-2">
            <p>{duplicate.message}</p>
            <Link to={`${directoryPath}/${duplicate.customerId}`}>
              Використати клієнта {duplicate.customerName}
            </Link>
            {!duplicate.isActive && mutationsAllowed && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void reactivateDuplicate()}
              >
                Активувати {duplicate.customerName}
              </button>
            )}
          </div>
        )}
        <button
          type="submit"
          disabled={!mutationsAllowed || busy || !name.trim()}
        >
          {busy ? 'Зберігаємо…' : 'Зберегти'}
        </button>
      </form>
    </section>
  )
}
