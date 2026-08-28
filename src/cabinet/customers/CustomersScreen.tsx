import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
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
    <section className="grid gap-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-neutral-500">Клієнти</p>
          <h1 className="text-3xl text-white">Клієнти</h1>
        </div>
        {mutationsAllowed && (
          <Link
            to="new"
            className="rounded-full bg-brand px-5 py-3 text-sm text-brand-foreground"
          >
            Новий клієнт
          </Link>
        )}
      </header>
      <label className="grid gap-2 text-sm">
        Пошук
        <input
          value={q}
          onChange={(event) =>
            setParams(
              event.target.value ? { q: event.target.value, page: '1' } : {},
            )
          }
          placeholder="Ім’я або телефон"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <p className="text-sm text-neutral-400">Знайдено: {total}</p>
      <ul className="grid gap-3">
        {customers.map((customer) => (
          <li key={customer.id}>
            <Link
              to={customer.id}
              className="block rounded-xl bg-surface-1 p-4 text-white"
            >
              {customer.name}
              <span className="ml-2 text-neutral-400">
                Замовлень: {customer.ordersCount}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <nav aria-label="Сторінки клієнтів" className="flex gap-3">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => {
            const next = new URLSearchParams(params)
            next.set('page', String(page - 1))
            setParams(next)
          }}
        >
          Попередня сторінка
        </button>
        <span>
          Сторінка {page} з {Math.max(totalPages, 1)}
        </span>
        <button
          type="button"
          disabled={totalPages === 0 || page >= totalPages}
          onClick={() => {
            const next = new URLSearchParams(params)
            next.set('page', String(page + 1))
            setParams(next)
          }}
        >
          Наступна сторінка
        </button>
      </nav>
    </section>
  )
}

function CustomerDetailScreen({
  definition,
  customerId,
}: CabinetModuleScreenProps & { customerId: string }) {
  const cabinet = useCabinet()
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
      setCustomer(
        customer.isActive
          ? await customersApi.deactivate(customer.id)
          : await customersApi.activate(customer.id),
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
      await customersApi.remove(customer.id)
      await navigate('..', { replace: true })
    } catch {
      setError(loadError)
      setBusy(false)
    }
  }
  if (!ordersViewAllowed)
    return <p role="alert">Потрібен доступ до замовлень.</p>
  if (error) return <p role="alert">{error}</p>
  if (!customer) return <p role="status">Завантажуємо клієнта…</p>
  const orderPath = `/app/${cabinet.targetTenant?.slug ?? ''}/orders/new?customerId=${encodeURIComponent(customer.id)}`
  return (
    <section className="grid gap-6">
      <header>
        <p className="text-xs text-neutral-500">Клієнт</p>
        <h1 className="text-3xl text-white">{customer.name}</h1>
      </header>
      <dl className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Замовлень"
          value={
            customer.ordersCount === null ? '—' : String(customer.ordersCount)
          }
        />
        {financeViewAllowed && (
          <>
            <Metric
              label="Витрачено"
              value={String(customer.totalAmount ?? '—')}
            />
            <Metric
              label="Середній чек"
              value={String(customer.averageAmount ?? '—')}
            />
          </>
        )}
      </dl>
      <div className="flex flex-wrap gap-3">
        {customer.phone && (
          <>
            <span>{customer.phone}</span>
            <a href={`tel:${customer.phone}`} aria-label="Зателефонувати">
              Зателефонувати
            </a>
            <a href={`sms:${customer.phone}`} aria-label="SMS">
              SMS
            </a>
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard.writeText(customer.phone!)
              }
            >
              Копіювати телефон
            </button>
          </>
        )}
        {orderCreateAllowed && customer.isActive && (
          <Link to={orderPath}>Створити замовлення</Link>
        )}
        {mutationsAllowed && (
          <>
            <Link to="edit">Редагувати</Link>
            <button
              type="button"
              disabled={busy}
              onClick={() => void updateLifecycle()}
            >
              {customer.isActive ? 'Деактивувати' : 'Активувати'}
            </button>
            {customer.ordersCount === 0 && (
              <button
                ref={triggerRef}
                type="button"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                Видалити
              </button>
            )}
          </>
        )}
      </div>
      {confirmDelete && (
        <div
          ref={dialogRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="customer-delete-title"
          aria-describedby="customer-delete-description"
          onKeyDown={containFocus}
        >
          <h2 id="customer-delete-title">Підтвердити видалення</h2>
          <p id="customer-delete-description">Видалити клієнта?</p>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            autoFocus
          >
            Підтвердити
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            disabled={busy}
          >
            Скасувати
          </button>
        </div>
      )}
      <section>
        <h2 className="text-xl text-white">Історія замовлень</h2>
        <ul>
          {customer.orders.map((order) => (
            <li key={order.id}>
              <Link
                to={`/app/${cabinet.targetTenant?.slug ?? ''}/orders/${order.id}`}
              >
                #{order.number} · {order.status} · {order.totalAmount ?? '—'}{' '}
                {order.currency ?? ''}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </section>
  )
}

function CustomerForm({
  definition,
  customerId,
}: CabinetModuleScreenProps & { customerId: string | null }) {
  const cabinet = useCabinet()
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
      const input = {
        name: name.trim(),
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      }
      const result = customerId
        ? await customersApi.update(customerId, input)
        : await customersApi.create(input)
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
      await customersApi.activate(duplicate.customerId)
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
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="text-2xl text-white">{value}</dd>
    </div>
  )
}
