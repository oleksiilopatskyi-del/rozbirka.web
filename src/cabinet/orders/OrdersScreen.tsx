import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { normalizeApiProblem } from '@/api/errors'
import {
  customersApi,
  readCustomerPhoneConflict,
  type CustomerPhoneConflict,
  type CustomerSearchItem,
} from '@/api/customers'
import { ordersApi, type OrderDetail, type OrderListItem } from '@/api/orders'
import { partsApi, type PartListItem } from '@/api/parts'
import { useCabinet } from '../CabinetContext'
import type { Permission } from '../access-types'
import type { CabinetModuleScreenProps } from '../ModuleBoundary'
import { evaluateModuleAccess } from '../policy'
import { useLatestMutationGuard } from '../use-latest-mutation-guard'

const idFromPath = (path: string) => /\/orders\/([^/]+)/.exec(path)?.[1] ?? null
const errorMessage = (error: unknown) => {
  const problem = normalizeApiProblem(error)
  if (problem.status === 402) return 'Функція потребує активної підписки.'
  if (problem.kind === 'forbidden') return 'У вас немає прав для цієї дії.'
  if (problem.kind === 'conflict')
    return 'Замовлення змінилося. Оновіть сторінку та спробуйте ще раз.'
  return problem.message
}
type OrderReplayOperation = 'order-confirm' | 'order-refund'
const isAmbiguousMutationFailure = (error: unknown) => {
  const kind = normalizeApiProblem(error).kind
  return kind === 'network' || kind === 'timeout'
}
const useOrderIdempotencyKeys = () => {
  const keysRef = useRef(
    new Map<OrderReplayOperation, { signature: string; key: string }>(),
  )
  return {
    forPayload(
      tenant: string,
      operation: OrderReplayOperation,
      payload: unknown,
    ) {
      const signature = JSON.stringify([tenant, operation, payload])
      const current = keysRef.current.get(operation)
      if (current?.signature === signature) return current.key
      const key = `${operation}-${crypto.randomUUID()}`
      keysRef.current.set(operation, { signature, key })
      return key
    },
    clear(operation: OrderReplayOperation) {
      keysRef.current.delete(operation)
    },
  }
}

export function OrdersScreen({ definition }: CabinetModuleScreenProps) {
  const location = useLocation()
  const id = idFromPath(location.pathname)
  if (location.pathname.endsWith('/new')) {
    const isItemForm = location.pathname.endsWith('/items/new')
    return (
      <OrderForm
        definition={definition}
        orderId={
          isItemForm
            ? idFromPath(location.pathname.replace('/items/new', ''))
            : null
        }
      />
    )
  }
  return id ? (
    <OrderDetailScreen definition={definition} orderId={id} />
  ) : (
    <OrderDirectory definition={definition} />
  )
}

function canMutate(
  definition: CabinetModuleScreenProps['definition'],
  cabinet: ReturnType<typeof useCabinet>,
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
      : { ...definition, mutationPermission: permission }
  return (
    evaluateModuleAccess(scopedDefinition, access, 'mutation').kind ===
    'allowed'
  )
}

const canCreateOrder = (
  definition: CabinetModuleScreenProps['definition'],
  cabinet: ReturnType<typeof useCabinet>,
) =>
  canMutate(definition, cabinet) &&
  cabinet.snapshot?.permissions.has('parts.view') === true &&
  cabinet.snapshot.permissions.has('customers.view')

function OrderDirectory({ definition }: CabinetModuleScreenProps) {
  const cabinet = useCabinet()
  const createAllowed = canCreateOrder(definition, cabinet)
  const [params, setParams] = useSearchParams()
  const [orders, setOrders] = useState<OrderListItem[]>([])
  const [totalPages, setTotalPages] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const search = params.get('q') ?? undefined
  const status = params.get('status') ?? undefined
  const customerId = params.get('customerId') ?? undefined
  const page = Number(params.get('page') ?? 1) || 1
  useEffect(() => {
    const controller = new AbortController()
    void ordersApi
      .list(
        {
          ...(search === undefined ? {} : { search }),
          ...(status === undefined ? {} : { status }),
          ...(customerId === undefined ? {} : { customerId }),
          page,
        },
        { signal: controller.signal },
      )
      .then((result) => {
        setOrders(result.items)
        setTotalPages(result.totalPages)
        setError(null)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorMessage(error))
      })
    return () => controller.abort()
  }, [customerId, page, search, status])
  return (
    <section className="grid gap-6">
      <header className="flex justify-between">
        <h1 className="text-3xl text-white">Замовлення</h1>
        {createAllowed && <Link to="new">Нове замовлення</Link>}
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          Пошук замовлень
          <input
            value={params.get('q') ?? ''}
            onChange={(event) => {
              const next = new URLSearchParams(params)
              if (event.target.value) next.set('q', event.target.value)
              else next.delete('q')
              next.set('page', '1')
              setParams(next)
            }}
          />
        </label>
        <label>
          Статус замовлення
          <select
            value={params.get('status') ?? ''}
            onChange={(event) => {
              const next = new URLSearchParams(params)
              if (event.target.value) next.set('status', event.target.value)
              else next.delete('status')
              next.set('page', '1')
              setParams(next)
            }}
          >
            <option value="">Усі</option>
            <option value="pending">Очікує</option>
            <option value="confirmed">Підтверджено</option>
            <option value="cancelled">Скасовано</option>
            <option value="refunded">Повернено</option>
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <ul>
        {orders.map((order) => (
          <li key={order.id}>
            <Link to={order.id}>
              #{order.number} · {order.status} · {order.totalAmount ?? '—'}
            </Link>
          </li>
        ))}
      </ul>
      <nav aria-label="Сторінки замовлень" className="flex gap-3">
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

function OrderForm({
  definition,
  orderId,
}: CabinetModuleScreenProps & { orderId: string | null }) {
  const cabinet = useCabinet()
  const { requireLatestMutation } = useLatestMutationGuard(definition)
  const mutationsAllowed = canMutate(definition, cabinet)
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const partSearchAllowed =
    cabinet.snapshot?.permissions.has('parts.view') === true
  const customerSearchAllowed =
    !orderId && cabinet.snapshot?.permissions.has('customers.view') === true
  const customerMutationAllowed =
    !orderId && canMutate(definition, cabinet, 'customers.manage')
  const dependenciesAllowed =
    partSearchAllowed && (orderId !== null || customerSearchAllowed)
  const [partId, setPartId] = useState('')
  const [partQuery, setPartQuery] = useState('')
  const [partResults, setPartResults] = useState<PartListItem[]>([])
  const [customerId, setCustomerId] = useState(params.get('customerId') ?? '')
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerSearchItem[]>(
    [],
  )
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const [customerConflict, setCustomerConflict] =
    useState<CustomerPhoneConflict | null>(null)
  const [customerBusy, setCustomerBusy] = useState(false)
  const [quantity, setQuantity] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [notes, setNotes] = useState('')
  const [existingItems, setExistingItems] = useState<
    { partId: string; quantity: number; unitPrice: number }[]
  >([])
  const [existingItemsLoad, setExistingItemsLoad] = useState<{
    orderId: string | null
    status: 'not-needed' | 'loaded' | 'failed'
  }>({ orderId: null, status: 'not-needed' })
  const existingItemsLoadStatus =
    orderId === null
      ? 'not-needed'
      : existingItemsLoad.orderId === orderId
        ? existingItemsLoad.status
        : 'loading'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const q = partQuery.trim()
    if (!partSearchAllowed || !q) return
    const controller = new AbortController()
    void partsApi
      .list({ q, page: 1, pageSize: 10, signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setPartResults(result.items)
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError))
      })
    return () => controller.abort()
  }, [partQuery, partSearchAllowed])
  useEffect(() => {
    const q = customerQuery.trim()
    if (!customerSearchAllowed || !q) return
    const controller = new AbortController()
    void customersApi
      .search(q, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setCustomerResults(result)
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError))
      })
    return () => controller.abort()
  }, [customerQuery, customerSearchAllowed])
  useEffect(() => {
    if (!orderId) return
    const controller = new AbortController()
    void ordersApi
      .getById(orderId, { signal: controller.signal })
      .then((order) => {
        if (!controller.signal.aborted) {
          setExistingItems(
            order.items.map(({ partId, quantity, unitPrice }) => ({
              partId,
              quantity,
              unitPrice,
            })),
          )
          setExistingItemsLoad({ orderId, status: 'loaded' })
        }
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setExistingItemsLoad({ orderId, status: 'failed' })
          setError(errorMessage(requestError))
        }
      })
    return () => controller.abort()
  }, [orderId])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (
      busy ||
      !dependenciesAllowed ||
      (orderId !== null && existingItemsLoadStatus !== 'loaded') ||
      !partId ||
      !quantity ||
      !unitPrice
    )
      return
    setBusy(true)
    setError(null)
    try {
      const scope = requireLatestMutation({ quota: orderId === null })
      requireLatestMutation({ permission: 'parts.view', quota: false })
      if (orderId === null) {
        requireLatestMutation({ permission: 'customers.view', quota: false })
      }
      const detail = orderId
        ? await ordersApi.updateItems(
            orderId,
            existingItems.some((item) => item.partId === partId)
              ? existingItems.map((item) =>
                  item.partId === partId
                    ? {
                        ...item,
                        quantity: item.quantity + Number(quantity),
                        unitPrice: Number(unitPrice),
                      }
                    : item,
                )
              : [
                  ...existingItems,
                  {
                    partId,
                    quantity: Number(quantity),
                    unitPrice: Number(unitPrice),
                  },
                ],
          )
        : await ordersApi.create({
            customerId: customerId || null,
            notes: notes || null,
            items: [
              {
                partId,
                quantity: Number(quantity),
                unitPrice: Number(unitPrice),
              },
            ],
          })
      if (scope.signal.aborted) return
      await navigate(`../${detail.id}`, { replace: true })
    } catch (error) {
      setError(errorMessage(error))
      setBusy(false)
    }
  }
  const createCustomerInline = async () => {
    if (customerBusy || !newCustomerName.trim() || !customerMutationAllowed)
      return
    setCustomerBusy(true)
    setError(null)
    setCustomerConflict(null)
    try {
      requireLatestMutation()
      requireLatestMutation({
        permission: 'customers.manage',
        quota: false,
      })
      const scope = requireLatestMutation({
        permission: 'customers.view',
        quota: false,
      })
      const result = await customersApi.create(
        {
          name: newCustomerName.trim(),
          phone: newCustomerPhone.trim() || null,
          notes: null,
        },
        { signal: scope.signal },
      )
      if (scope.signal.aborted) return
      setCustomerId(result.customer.id)
      setNewCustomerName('')
      setNewCustomerPhone('')
    } catch (requestError) {
      const conflict = readCustomerPhoneConflict(requestError)
      if (conflict) setCustomerConflict(conflict)
      else setError(errorMessage(requestError))
    } finally {
      setCustomerBusy(false)
    }
  }
  const selectDuplicateCustomer = () => {
    if (!customerConflict?.isActive || !customerMutationAllowed) return
    setCustomerId(customerConflict.customerId)
    setCustomerConflict(null)
    setNewCustomerName('')
    setNewCustomerPhone('')
  }
  const reactivateDuplicateCustomer = async () => {
    if (
      !customerConflict ||
      customerConflict.isActive ||
      customerBusy ||
      !customerMutationAllowed
    )
      return
    setCustomerBusy(true)
    setError(null)
    try {
      requireLatestMutation({ quota: false })
      requireLatestMutation({
        permission: 'customers.manage',
        quota: false,
      })
      const scope = requireLatestMutation({
        permission: 'customers.view',
        quota: false,
      })
      const customer = await customersApi.activate(
        customerConflict.customerId,
        {
          signal: scope.signal,
        },
      )
      if (scope.signal.aborted) return
      setCustomerId(customer.id)
      setCustomerConflict(null)
      setNewCustomerName('')
      setNewCustomerPhone('')
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setCustomerBusy(false)
    }
  }
  if (!dependenciesAllowed) {
    return <p role="alert">Потрібен доступ до запчастин і клієнтів.</p>
  }
  return (
    <section>
      <h1 className="text-3xl text-white">
        {orderId ? 'Додати позицію' : 'Створити замовлення'}
      </h1>
      <form onSubmit={(event) => void submit(event)} className="grid gap-3">
        {partSearchAllowed && (
          <div className="grid gap-2">
            <label>
              Пошук запчастини
              <input
                value={partQuery}
                onChange={(event) => setPartQuery(event.target.value)}
              />
            </label>
            <ul>
              {(partQuery.trim() ? partResults : []).map((part) => (
                <li key={part.id}>
                  <button type="button" onClick={() => setPartId(part.id)}>
                    Обрати запчастину {part.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <label>
          ID запчастини
          <input
            value={partId}
            onChange={(event) => setPartId(event.target.value)}
          />
        </label>
        <label>
          Кількість
          <input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            inputMode="numeric"
          />
        </label>
        <label>
          Ціна за одиницю
          <input
            value={unitPrice}
            onChange={(event) => setUnitPrice(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label>
          Нотатки
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        {customerSearchAllowed && (
          <div className="grid gap-2">
            <label>
              Пошук клієнта
              <input
                value={customerQuery}
                onChange={(event) => setCustomerQuery(event.target.value)}
              />
            </label>
            <ul>
              {(customerQuery.trim() ? customerResults : []).map((customer) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    onClick={() => setCustomerId(customer.id)}
                  >
                    Обрати клієнта {customer.name}
                  </button>
                </li>
              ))}
            </ul>
            {customerMutationAllowed && (
              <fieldset className="grid gap-2">
                <legend>Новий клієнт</legend>
                <label>
                  Ім’я нового клієнта
                  <input
                    value={newCustomerName}
                    onChange={(event) => setNewCustomerName(event.target.value)}
                  />
                </label>
                <label>
                  Телефон нового клієнта
                  <input
                    value={newCustomerPhone}
                    onChange={(event) =>
                      setNewCustomerPhone(event.target.value)
                    }
                  />
                </label>
                <button
                  type="button"
                  aria-busy={customerBusy}
                  disabled={customerBusy || !newCustomerName.trim()}
                  onClick={() => void createCustomerInline()}
                >
                  {customerBusy ? 'Створюємо клієнта…' : 'Створити клієнта'}
                </button>
              </fieldset>
            )}
            {customerConflict && (
              <div role="alert" className="grid gap-2">
                <p>{customerConflict.message}</p>
                {customerConflict.isActive ? (
                  <button type="button" onClick={selectDuplicateCustomer}>
                    Використати клієнта {customerConflict.customerName}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={customerBusy}
                    onClick={() => void reactivateDuplicateCustomer()}
                  >
                    Активувати {customerConflict.customerName}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <button
          type="submit"
          aria-busy={busy || existingItemsLoadStatus === 'loading'}
          disabled={
            !mutationsAllowed ||
            busy ||
            (orderId !== null && existingItemsLoadStatus !== 'loaded') ||
            !partId ||
            !quantity ||
            !unitPrice
          }
        >
          {busy
            ? orderId
              ? 'Додаємо…'
              : 'Створюємо…'
            : orderId
              ? 'Додати позицію'
              : 'Створити замовлення'}
        </button>
      </form>
    </section>
  )
}

function OrderDetailScreen({
  definition,
  orderId,
}: CabinetModuleScreenProps & { orderId: string }) {
  const cabinet = useCabinet()
  const { requireLatestMutation } = useLatestMutationGuard(definition)
  const replayKeys = useOrderIdempotencyKeys()
  const location = useLocation()
  const mutationsAllowed = canMutate(definition, cabinet)
  const financeAllowed =
    mutationsAllowed &&
    cabinet.snapshot?.permissions.has('finance.manage') === true
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [itemDrafts, setItemDrafts] = useState<OrderDetail['items']>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [refundReason, setRefundReason] = useState('')
  const [draftNotes, setDraftNotes] = useState('')
  const [draftCustomerId, setDraftCustomerId] = useState('')
  const [paymentDrafts, setPaymentDrafts] = useState([
    { accountId: '', amount: '', currency: '' },
  ])
  const acceptOrder = useCallback((detail: OrderDetail) => {
    setOrder(detail)
    setItemDrafts(detail.items)
    setDraftNotes(detail.notes ?? '')
    setDraftCustomerId(detail.customerId ?? '')
  }, [])
  const reload = useCallback(
    (signal?: AbortSignal) =>
      ordersApi
        .getById(orderId, signal ? { signal } : {})
        .then((detail) => {
          if (!signal?.aborted) {
            acceptOrder(detail)
            setError(null)
          }
        })
        .catch((error) => {
          if (!signal?.aborted) setError(errorMessage(error))
        }),
    [acceptOrder, orderId],
  )
  useEffect(() => {
    const controller = new AbortController()
    void reload(controller.signal)
    return () => controller.abort()
  }, [reload])
  const transition = async (
    action: (idempotencyKey?: string) => Promise<OrderDetail>,
    replay?: { operation: OrderReplayOperation; payload: unknown },
    permission?: Permission,
  ) => {
    if (busy) return
    setBusy(true)
    try {
      const scope = requireLatestMutation({ quota: false })
      if (permission) {
        requireLatestMutation({ permission, quota: false })
      }
      const replayKey = replay
        ? replayKeys.forPayload(
            scope.tenantId,
            replay.operation,
            replay.payload,
          )
        : undefined
      const updated = await action(replayKey)
      if (replay) replayKeys.clear(replay.operation)
      if (scope.signal.aborted) return
      acceptOrder(updated)
      setError(null)
    } catch (error) {
      if (replay && !isAmbiguousMutationFailure(error))
        replayKeys.clear(replay.operation)
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  if (error && !order) return <p role="alert">{error}</p>
  if (!order) return <p role="status">Завантажуємо замовлення…</p>
  return (
    <section className="grid gap-5">
      <h1 className="text-3xl text-white">Замовлення #{order.number}</h1>
      {error && <p role="alert">{error}</p>}
      <p>Статус: {order.status}</p>
      <p>Клієнт: {order.customerName ?? 'Без клієнта'}</p>
      <p>
        Разом: {order.totalAmount ?? '—'} {order.paymentCurrency ?? ''}
      </p>
      <p>
        Сплачено: {order.totalPaid ?? '—'} {order.paymentCurrency ?? ''}
      </p>
      <ul className="grid gap-3">
        {itemDrafts.map((item, index) => (
          <li key={item.id}>
            {mutationsAllowed && order.status === 'pending' ? (
              <fieldset className="grid gap-2">
                <legend>{item.partName}</legend>
                <label>
                  Кількість {item.partName}
                  <input
                    value={item.quantity}
                    inputMode="numeric"
                    onChange={(event) =>
                      setItemDrafts((current) =>
                        current.map((draft, draftIndex) =>
                          draftIndex === index
                            ? { ...draft, quantity: Number(event.target.value) }
                            : draft,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Ціна {item.partName}
                  <input
                    value={item.unitPrice}
                    inputMode="decimal"
                    onChange={(event) =>
                      setItemDrafts((current) =>
                        current.map((draft, draftIndex) =>
                          draftIndex === index
                            ? {
                                ...draft,
                                unitPrice: Number(event.target.value),
                              }
                            : draft,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void transition(() =>
                      itemDrafts.length === 1
                        ? ordersApi.cancel(order.id)
                        : ordersApi.updateItems(
                            order.id,
                            itemDrafts
                              .filter((_, draftIndex) => draftIndex !== index)
                              .map(({ partId, quantity, unitPrice }) => ({
                                partId,
                                quantity,
                                unitPrice,
                              })),
                          ),
                    )
                  }
                >
                  Видалити {item.partName}
                </button>
              </fieldset>
            ) : (
              <>
                {item.partName} · {item.quantity} × {item.unitPrice}
              </>
            )}
          </li>
        ))}
      </ul>
      {mutationsAllowed && order.status === 'pending' && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void transition(() =>
              ordersApi.updateItems(
                order.id,
                itemDrafts.map(({ partId, quantity, unitPrice }) => ({
                  partId,
                  quantity,
                  unitPrice,
                })),
              ),
            )
          }
        >
          Зберегти позиції
        </button>
      )}
      {mutationsAllowed && order.status === 'pending' && (
        <Link to={`${location.pathname}/items/new`}>Додати позицію</Link>
      )}
      {mutationsAllowed && order.status === 'pending' && (
        <div className="grid gap-3">
          <label>
            Нотатки замовлення
            <textarea
              value={draftNotes}
              onChange={(event) => setDraftNotes(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void transition(() => ordersApi.updateNotes(order.id, draftNotes))
            }
          >
            Зберегти нотатки
          </button>
          <label>
            ID клієнта замовлення
            <input
              value={draftCustomerId}
              onChange={(event) => setDraftCustomerId(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void transition(() =>
                ordersApi.setCustomer(order.id, draftCustomerId || null),
              )
            }
          >
            Зберегти клієнта
          </button>
        </div>
      )}
      {financeAllowed && order.status === 'pending' && (
        <div className="grid gap-3">
          {paymentDrafts.map((payment, index) => {
            const suffix = index === 0 ? '' : ` ${index + 1}`
            const updatePayment = (
              field: 'accountId' | 'amount' | 'currency',
              value: string,
            ) =>
              setPaymentDrafts((current) =>
                current.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, [field]: value } : item,
                ),
              )
            return (
              <fieldset key={index} className="grid gap-3">
                <legend>Платіж {index + 1}</legend>
                <label>
                  ID рахунку{suffix}
                  <input
                    value={payment.accountId}
                    onChange={(event) =>
                      updatePayment('accountId', event.target.value)
                    }
                  />
                </label>
                <label>
                  Сума платежу{suffix}
                  <input
                    value={payment.amount}
                    onChange={(event) =>
                      updatePayment('amount', event.target.value)
                    }
                    inputMode="decimal"
                  />
                </label>
                <label>
                  Валюта платежу{suffix}
                  <input
                    value={payment.currency}
                    onChange={(event) =>
                      updatePayment('currency', event.target.value)
                    }
                  />
                </label>
              </fieldset>
            )
          })}
          <button
            type="button"
            onClick={() =>
              setPaymentDrafts((current) => [
                ...current,
                { accountId: '', amount: '', currency: '' },
              ])
            }
          >
            Додати платіж
          </button>
          <button
            type="button"
            disabled={
              busy ||
              paymentDrafts.some(
                (payment) =>
                  !payment.accountId || !payment.amount || !payment.currency,
              )
            }
            onClick={() => {
              const input = {
                payments: paymentDrafts.map((payment) => ({
                  accountId: payment.accountId,
                  amount: Number(payment.amount),
                  currency: payment.currency,
                })),
              }
              void transition(
                (idempotencyKey) =>
                  ordersApi.confirm(order.id, input, {
                    idempotencyKey: idempotencyKey!,
                  }),
                {
                  operation: 'order-confirm',
                  payload: { orderId: order.id, input },
                },
                'finance.manage',
              )
            }}
          >
            Підтвердити
          </button>
        </div>
      )}
      {mutationsAllowed && order.status === 'pending' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void transition(() => ordersApi.cancel(order.id))}
        >
          Скасувати замовлення
        </button>
      )}
      {financeAllowed && order.status === 'confirmed' && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const input = { refundReason }
            void transition(
              (idempotencyKey) =>
                ordersApi.refund(order.id, input, {
                  idempotencyKey: idempotencyKey!,
                }),
              {
                operation: 'order-refund',
                payload: { orderId: order.id, input },
              },
              'finance.manage',
            )
          }}
        >
          <label>
            Причина повернення
            <input
              value={refundReason}
              onChange={(event) => setRefundReason(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || !refundReason}>
            Повернути кошти
          </button>
        </form>
      )}
      <section>
        <h2>Платежі</h2>
        <ul>
          {order.payments.map((payment) => (
            <li key={payment.id}>
              {payment.accountName} · {payment.amount} {payment.currency}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Аудит</h2>
        <ul>
          {order.history.map((item, index) => (
            <li
              key={`${item.createdAt}-${item.eventType}-${item.userName}-${index}`}
            >
              <span>
                {item.eventType} · {item.userName} ·{' '}
                <time dateTime={item.createdAt}>{item.createdAt}</time>
              </span>
              {item.data !== null && <p>{item.data}</p>}
            </li>
          ))}
        </ul>
      </section>
    </section>
  )
}
