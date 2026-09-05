import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { Plus, Trash2 } from 'lucide-react'
import {
  Button,
  SectionPanel,
  DataTable,
  DeniedState,
  ErrorState,
  EmptyState,
  Field,
  Notice,
  PageBody,
  PageHeader,
  Pagination,
  Panel,
  SearchInput,
  SelectInput,
  SkeletonRows,
  StatusPill,
  TextArea,
  TextInput,
  Toolbar,
  type StatusTone,
} from '@/components/app'
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
  if (problem.status === 402)
    return 'Функція потребує активної підписки. Поновіть підписку в розділі «Підписка» та спробуйте ще раз.'
  if (problem.kind === 'forbidden')
    return 'У вас немає прав для цієї дії. Попросіть адміністратора розбірки розширити вашу роль.'
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

const orderStatusPresentation = (
  status: string,
): { label: string; tone: StatusTone } => {
  if (status === 'confirmed') return { label: 'Підтверджено', tone: 'ok' }
  if (status === 'pending') return { label: 'Очікує', tone: 'warn' }
  if (status === 'cancelled') return { label: 'Скасовано', tone: 'neutral' }
  if (status === 'refunded') return { label: 'Повернено', tone: 'info' }
  return { label: status, tone: 'neutral' }
}

/** One money figure as text: the digits stay bare so columns line up. */
const money = (value: number | null | undefined, currency?: string | null) => {
  if (value === null || value === undefined || !Number.isFinite(value))
    return '—'
  return currency ? `${value} ${currency}` : String(value)
}
const lineTotal = (quantity: number, unitPrice: number) => {
  const total = quantity * unitPrice
  return Number.isFinite(total) ? total : null
}
/** `2026-08-28T10:15:00Z` reads as `2026-08-28 10:15`; the machine value stays in `dateTime`. */
const formatTimestamp = (value: string) => {
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value)
  return parts ? `${parts[1]} ${parts[2]}` : value
}

/** A titled block of a form or a record: heading, body, one row of actions. */
/** The running figure a block is judged by: label left, digits right. */
function TotalLine({
  label,
  value,
  strong = false,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
      <span className="text-app-dim text-[12.5px]">{label}</span>
      <span
        className={
          strong
            ? 'text-[15px] font-semibold tabular-nums text-white'
            : 'text-app-muted text-[13px] tabular-nums'
        }
      >
        {value}
      </span>
    </div>
  )
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
  const setParam = (name: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    next.set('page', '1')
    setParams(next)
  }
  const goToPage = (nextPage: number) => {
    const next = new URLSearchParams(params)
    next.set('page', String(nextPage))
    setParams(next)
  }
  return (
    <PageBody>
      <PageHeader
        actions={
          createAllowed ? (
            <Button asChild variant="primary">
              <Link to="new">
                <Plus aria-hidden />
                Нове замовлення
              </Link>
            </Button>
          ) : undefined
        }
        eyebrow="Продажі"
        title="Замовлення"
      />
      <Toolbar>
        <Field className="min-w-52 flex-1" label="Пошук замовлень">
          <SearchInput
            onChange={(event) => setParam('q', event.target.value)}
            value={params.get('q') ?? ''}
          />
        </Field>
        <Field className="min-w-48" label="Статус замовлення">
          <SelectInput
            onChange={(event) => setParam('status', event.target.value)}
            value={params.get('status') ?? ''}
          >
            <option value="">Усі</option>
            <option value="pending">Очікує</option>
            <option value="confirmed">Підтверджено</option>
            <option value="cancelled">Скасовано</option>
            <option value="refunded">Повернено</option>
          </SelectInput>
        </Field>
      </Toolbar>
      {error && <Notice tone="danger">{error}</Notice>}
      <DataTable
        caption="Список замовлень"
        columns={[
          {
            key: 'number',
            label: 'Замовлення',
            variant: 'primary',
            cell: (order) => (
              <Link className="hover:text-brand block" to={order.id}>
                #{order.number}
              </Link>
            ),
          },
          {
            key: 'status',
            label: 'Статус',
            cell: (order) => {
              const presentation = orderStatusPresentation(order.status)
              return (
                <StatusPill tone={presentation.tone}>
                  {presentation.label}
                </StatusPill>
              )
            },
          },
          {
            key: 'total',
            label: 'Сума',
            align: 'end',
            cell: (order) => order.totalAmount ?? '—',
          },
        ]}
        empty={
          <EmptyState
            description="Замовлення з’являться тут, щойно ви створите перше або клієнт зробить його сам."
            title="Замовлень поки немає"
          />
        }
        footer={
          <Pagination
            label="Сторінки замовлень"
            onPage={goToPage}
            page={page}
            totalPages={Math.max(totalPages, 1)}
          />
        }
        rowKey={(order) => order.id}
        rows={orders}
      />
    </PageBody>
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
  const location = useLocation()
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
    return (
      <PageBody width="narrow">
        <DeniedState
          description="Потрібен доступ до запчастин і клієнтів. Попросіть адміністратора розбірки відкрити ці розділи для вашої ролі."
          role="alert"
          title="Замовлення недоступні для створення"
        />
      </PageBody>
    )
  }
  const selectedPart = partResults.find((part) => part.id === partId)
  const selectedCustomer = customerResults.find(
    (customer) => customer.id === customerId,
  )
  const draftLineTotal =
    quantity && unitPrice
      ? lineTotal(Number(quantity), Number(unitPrice))
      : null
  const existingTotal = existingItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  )
  const backPath = orderId
    ? location.pathname.replace(/\/items\/new$/, '')
    : location.pathname.replace(/\/new$/, '')
  const submitBlocked =
    !mutationsAllowed ||
    busy ||
    (orderId !== null && existingItemsLoadStatus !== 'loaded') ||
    !partId ||
    !quantity ||
    !unitPrice
  return (
    <PageBody width="narrow">
      <PageHeader
        eyebrow={orderId ? 'Продажі · Замовлення' : 'Продажі'}
        title={orderId ? 'Додати позицію' : 'Створити замовлення'}
      />
      <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
        {error && <Notice tone="danger">{error}</Notice>}
        <SectionPanel
          description={
            orderId
              ? 'Знайдіть запчастину, вкажіть кількість і ціну — позиція долучиться до наявних у замовленні.'
              : 'Замовлення створюється з однією позицією. Решту можна додати на сторінці замовлення.'
          }
          title="Позиція"
        >
          <div className="grid gap-3">
            {partSearchAllowed && (
              <div className="grid gap-2">
                <Field
                  hint="Введіть назву — знайдені запчастини з’являться нижче."
                  label="Пошук запчастини"
                >
                  <SearchInput
                    onChange={(event) => setPartQuery(event.target.value)}
                    value={partQuery}
                  />
                </Field>
                {partQuery.trim() && partResults.length > 0 && (
                  <ul className="grid gap-1.5">
                    {partResults.map((part) => (
                      <li key={part.id}>
                        <Button
                          aria-label={`Обрати запчастину ${part.name}`}
                          className={
                            part.id === partId
                              ? 'border-brand/40 bg-brand/[0.1] w-full justify-between'
                              : 'w-full justify-between'
                          }
                          onClick={() => setPartId(part.id)}
                        >
                          <span className="min-w-0 truncate">{part.name}</span>
                          <span className="text-app-dim text-[12px] tabular-nums">
                            {part.quantityAvailable} шт
                          </span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <Field
              hint={
                selectedPart
                  ? `Обрано ${selectedPart.name}`
                  : 'Заповнюється автоматично, коли ви обираєте запчастину в пошуку.'
              }
              label="ID запчастини"
            >
              <TextInput
                onChange={(event) => setPartId(event.target.value)}
                value={partId}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Кількість">
                <TextInput
                  className="text-right"
                  inputMode="numeric"
                  onChange={(event) => setQuantity(event.target.value)}
                  value={quantity}
                />
              </Field>
              <Field label="Ціна за одиницю">
                <TextInput
                  className="text-right"
                  inputMode="decimal"
                  onChange={(event) => setUnitPrice(event.target.value)}
                  value={unitPrice}
                />
              </Field>
            </div>
          </div>
        </SectionPanel>
        {customerSearchAllowed && (
          <SectionPanel
            description="Замовлення можна створити й без клієнта — тоді поле лишається порожнім."
            title="Клієнт"
          >
            <div className="grid gap-3">
              <Field
                hint={
                  selectedCustomer
                    ? `Обрано ${selectedCustomer.name}`
                    : customerId
                      ? `Обрано клієнта ${customerId}`
                      : 'Клієнта не обрано'
                }
                label="Пошук клієнта"
              >
                <SearchInput
                  onChange={(event) => setCustomerQuery(event.target.value)}
                  value={customerQuery}
                />
              </Field>
              {customerQuery.trim() && customerResults.length > 0 && (
                <ul className="grid gap-1.5">
                  {customerResults.map((customer) => (
                    <li key={customer.id}>
                      <Button
                        aria-label={`Обрати клієнта ${customer.name}`}
                        className={
                          customer.id === customerId
                            ? 'border-brand/40 bg-brand/[0.1] w-full justify-between'
                            : 'w-full justify-between'
                        }
                        onClick={() => setCustomerId(customer.id)}
                      >
                        <span className="min-w-0 truncate">
                          {customer.name}
                        </span>
                        <span className="text-app-dim text-[12px]">
                          {customer.phone ?? 'без телефону'}
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {customerMutationAllowed && (
                <fieldset className="border-app-line-2 rounded-control grid gap-3 border border-dashed p-3">
                  <legend className="text-app-muted px-1 text-[12.5px]">
                    Новий клієнт
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Ім’я нового клієнта">
                      <TextInput
                        onChange={(event) =>
                          setNewCustomerName(event.target.value)
                        }
                        value={newCustomerName}
                      />
                    </Field>
                    <Field label="Телефон нового клієнта">
                      <TextInput
                        inputMode="tel"
                        onChange={(event) =>
                          setNewCustomerPhone(event.target.value)
                        }
                        value={newCustomerPhone}
                      />
                    </Field>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      aria-busy={customerBusy}
                      disabled={customerBusy || !newCustomerName.trim()}
                      onClick={() => void createCustomerInline()}
                    >
                      {customerBusy ? 'Створюємо клієнта…' : 'Створити клієнта'}
                    </Button>
                  </div>
                </fieldset>
              )}
              {customerConflict && (
                <Notice
                  action={
                    customerConflict.isActive ? (
                      <Button
                        onClick={selectDuplicateCustomer}
                        variant="primary"
                      >
                        Використати клієнта {customerConflict.customerName}
                      </Button>
                    ) : (
                      <Button
                        disabled={customerBusy}
                        onClick={() => void reactivateDuplicateCustomer()}
                        variant="primary"
                      >
                        Активувати {customerConflict.customerName}
                      </Button>
                    )
                  }
                  className="flex-wrap"
                  role="alert"
                  tone="warn"
                >
                  {customerConflict.message}
                </Notice>
              )}
            </div>
          </SectionPanel>
        )}
        {orderId === null && (
          <SectionPanel title="Нотатки">
            <div>
              <Field
                hint="Видно команді розбірки на сторінці замовлення."
                label="Нотатки"
              >
                <TextArea
                  onChange={(event) => setNotes(event.target.value)}
                  value={notes}
                />
              </Field>
            </div>
          </SectionPanel>
        )}
        <Panel>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="grid min-w-0 gap-1">
              {orderId !== null && (
                <TotalLine
                  label="Уже в замовленні"
                  value={
                    existingItemsLoadStatus === 'loaded'
                      ? money(existingTotal)
                      : '—'
                  }
                />
              )}
              <TotalLine
                label={orderId ? 'Разом за позицію' : 'Разом за замовлення'}
                strong
                value={money(draftLineTotal)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="quiet">
                <Link to={backPath}>
                  {orderId ? 'До замовлення' : 'До списку замовлень'}
                </Link>
              </Button>
              <Button
                aria-busy={busy || existingItemsLoadStatus === 'loading'}
                disabled={submitBlocked}
                type="submit"
                variant="primary"
              >
                {busy
                  ? orderId
                    ? 'Додаємо…'
                    : 'Створюємо…'
                  : orderId
                    ? 'Додати позицію'
                    : 'Створити замовлення'}
              </Button>
            </div>
          </div>
        </Panel>
      </form>
    </PageBody>
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
  if (error && !order)
    return (
      <PageBody width="narrow">
        <ErrorState
          description={error}
          onRetry={() => void reload()}
          title="Не вдалося завантажити замовлення"
        />
      </PageBody>
    )
  if (!order)
    return (
      <PageBody width="narrow">
        <SkeletonRows label="Завантажуємо замовлення…" rows={4} />
      </PageBody>
    )
  const status = orderStatusPresentation(order.status)
  const currency = order.paymentCurrency
  const itemsEditable = mutationsAllowed && order.status === 'pending'
  const draftsTotal = itemDrafts.reduce((sum, item) => {
    const total = lineTotal(item.quantity, item.unitPrice)
    return total === null ? sum : sum + total
  }, 0)
  const paymentsTotal = paymentDrafts.reduce((sum, payment) => {
    const amount = Number(payment.amount)
    return payment.amount && Number.isFinite(amount) ? sum + amount : sum
  }, 0)
  const outstanding =
    order.totalAmount === null || order.totalPaid === null
      ? null
      : order.totalAmount - order.totalPaid
  const historyRows = order.history.map((entry, index) => ({
    ...entry,
    key: `${entry.createdAt}-${entry.eventType}-${entry.userName}-${index}`,
  }))
  return (
    <PageBody>
      <PageHeader
        actions={<StatusPill tone={status.tone}>{status.label}</StatusPill>}
        eyebrow="Продажі · Замовлення"
        title={`Замовлення #${String(order.number)}`}
      />
      {error && <Notice tone="danger">{error}</Notice>}
      <Panel>
        <dl className="grid gap-3 sm:grid-cols-4">
          <div className="grid gap-1">
            <dt className="text-app-dim text-[12.5px]">Клієнт</dt>
            <dd className="text-sm text-white">
              {order.customerName ?? 'Без клієнта'}
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-app-dim text-[12.5px]">Разом</dt>
            <dd className="text-sm tabular-nums text-white">
              {money(order.totalAmount, currency)}
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-app-dim text-[12.5px]">Сплачено</dt>
            <dd className="text-sm tabular-nums text-white">
              {money(order.totalPaid, currency)}
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="text-app-dim text-[12.5px]">Залишок</dt>
            <dd className="text-sm tabular-nums text-white">
              {money(outstanding, currency)}
            </dd>
          </div>
        </dl>
      </Panel>
      {itemsEditable ? (
        <SectionPanel
          aside={
            <span className="text-app-muted text-[12.5px] tabular-nums">
              Разом за позиціями {money(draftsTotal, currency)}
            </span>
          }
          description={
            itemDrafts.length === 1
              ? 'Видалення останньої позиції скасує замовлення.'
              : 'Змініть кількість або ціну й збережіть позиції — набір замінюється цілком.'
          }
          footer={
            <>
              <Button
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
                variant="primary"
              >
                Зберегти позиції
              </Button>
              <Button asChild variant="ghost">
                <Link to={`${location.pathname}/items/new`}>
                  <Plus aria-hidden />
                  Додати позицію
                </Link>
              </Button>
            </>
          }
          title="Позиції"
        >
          {itemDrafts.length === 0 && (
            <p className="text-app-muted px-4 py-3 text-sm">
              Позицій немає. Додайте запчастину, щоб замовлення можна було
              підтвердити.
            </p>
          )}
          <ul>
            {itemDrafts.map((item, index) => (
              <li
                className="border-app-line grid gap-3 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                key={item.id}
              >
                <div className="min-w-0">
                  <p className="text-app-ink truncate text-sm font-medium">
                    {item.partName}
                  </p>
                  <p className="text-app-dim mt-0.5 text-[11.5px] tabular-nums">
                    Сума позиції{' '}
                    {money(lineTotal(item.quantity, item.unitPrice), currency)}
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="grid w-20 gap-1.5">
                    <span aria-hidden className="text-app-dim text-[11.5px]">
                      Кількість
                    </span>
                    <TextInput
                      aria-label={`Кількість ${item.partName}`}
                      className="text-right"
                      inputMode="numeric"
                      onChange={(event) =>
                        setItemDrafts((current) =>
                          current.map((draft, draftIndex) =>
                            draftIndex === index
                              ? {
                                  ...draft,
                                  quantity: Number(event.target.value),
                                }
                              : draft,
                          ),
                        )
                      }
                      value={item.quantity}
                    />
                  </div>
                  <div className="grid w-28 gap-1.5">
                    <span aria-hidden className="text-app-dim text-[11.5px]">
                      Ціна
                    </span>
                    <TextInput
                      aria-label={`Ціна ${item.partName}`}
                      className="text-right"
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
                      value={item.unitPrice}
                    />
                  </div>
                  <Button
                    aria-label={`Видалити ${item.partName}`}
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
                    size="icon"
                    variant="danger"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </SectionPanel>
      ) : (
        <section className="grid gap-2">
          <h2 className="text-base font-semibold text-white">Позиції</h2>
          <DataTable
            caption="Позиції замовлення"
            columns={[
              {
                key: 'part',
                label: 'Позиція',
                variant: 'primary',
                cell: (item) => item.partName,
              },
              {
                key: 'quantity',
                label: 'Кількість',
                align: 'end',
                cell: (item) => item.quantity,
              },
              {
                key: 'unitPrice',
                label: 'Ціна',
                align: 'end',
                cell: (item) => money(item.unitPrice, currency),
              },
              {
                key: 'totalPrice',
                label: 'Сума',
                align: 'end',
                cell: (item) => money(item.totalPrice, currency),
              },
            ]}
            empty={
              <EmptyState
                description="У цьому замовленні немає жодної запчастини."
                title="Позицій немає"
              />
            }
            rowKey={(item) => item.id}
            rows={order.items}
          />
        </section>
      )}
      {itemsEditable && (
        <SectionPanel
          description="Нотатки бачить команда розбірки; клієнта можна змінити, доки замовлення очікує."
          title="Клієнт і нотатки"
        >
          <div className="grid gap-4 p-4">
            <div className="grid gap-2">
              <Field label="Нотатки замовлення">
                <TextArea
                  onChange={(event) => setDraftNotes(event.target.value)}
                  value={draftNotes}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy}
                  onClick={() =>
                    void transition(() =>
                      ordersApi.updateNotes(order.id, draftNotes),
                    )
                  }
                >
                  Зберегти нотатки
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Field
                className="min-w-52 flex-1"
                hint="Порожнє поле відв’яже клієнта від замовлення."
                label="ID клієнта замовлення"
              >
                <TextInput
                  onChange={(event) => setDraftCustomerId(event.target.value)}
                  value={draftCustomerId}
                />
              </Field>
              <Button
                disabled={busy}
                onClick={() =>
                  void transition(() =>
                    ordersApi.setCustomer(order.id, draftCustomerId || null),
                  )
                }
              >
                Зберегти клієнта
              </Button>
            </div>
          </div>
        </SectionPanel>
      )}
      {financeAllowed && order.status === 'pending' && (
        <SectionPanel
          description="Підтвердження фіксує оплату й переводить замовлення у статус «Підтверджено»."
          footer={
            <>
              <Button
                disabled={
                  busy ||
                  paymentDrafts.some(
                    (payment) =>
                      !payment.accountId ||
                      !payment.amount ||
                      !payment.currency,
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
                variant="primary"
              >
                Підтвердити
              </Button>
              <Button
                onClick={() =>
                  setPaymentDrafts((current) => [
                    ...current,
                    { accountId: '', amount: '', currency: '' },
                  ])
                }
              >
                <Plus aria-hidden />
                Додати платіж
              </Button>
            </>
          }
          title="Оплата й підтвердження"
        >
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
                <fieldset
                  className="border-app-line-2 rounded-control grid gap-3 border border-dashed p-3"
                  key={index}
                >
                  <legend className="text-app-muted px-1 text-[12.5px]">
                    Платіж {index + 1}
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label={`ID рахунку${suffix}`}>
                      <TextInput
                        onChange={(event) =>
                          updatePayment('accountId', event.target.value)
                        }
                        value={payment.accountId}
                      />
                    </Field>
                    <Field label={`Сума платежу${suffix}`}>
                      <TextInput
                        className="text-right"
                        inputMode="decimal"
                        onChange={(event) =>
                          updatePayment('amount', event.target.value)
                        }
                        value={payment.amount}
                      />
                    </Field>
                    <Field label={`Валюта платежу${suffix}`}>
                      <TextInput
                        onChange={(event) =>
                          updatePayment('currency', event.target.value)
                        }
                        value={payment.currency}
                      />
                    </Field>
                  </div>
                  {paymentDrafts.length > 1 && (
                    <div className="flex flex-wrap">
                      <Button
                        onClick={() =>
                          setPaymentDrafts((current) =>
                            current.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          )
                        }
                        variant="quiet"
                      >
                        Прибрати платіж {index + 1}
                      </Button>
                    </div>
                  )}
                </fieldset>
              )
            })}
            <div className="grid gap-1">
              <TotalLine
                label="Сума платежів"
                strong
                value={money(paymentsTotal, currency)}
              />
              <TotalLine
                label="Разом за замовленням"
                value={money(order.totalAmount, currency)}
              />
            </div>
          </div>
        </SectionPanel>
      )}
      {itemsEditable && (
        <SectionPanel
          description="Скасування звільняє зарезервовані запчастини; повернути замовлення в роботу не вийде."
          title="Скасування замовлення"
        >
          <div className="flex flex-wrap gap-2 p-4">
            <Button
              disabled={busy}
              onClick={() => void transition(() => ordersApi.cancel(order.id))}
              variant="danger"
            >
              Скасувати замовлення
            </Button>
          </div>
        </SectionPanel>
      )}
      {financeAllowed && order.status === 'confirmed' && (
        <SectionPanel
          description="Повернення переводить замовлення у статус «Повернено» і не скасовується."
          title="Повернення коштів"
        >
          <form
            className="grid gap-3 p-4"
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
            <Field
              hint="Причина потрапляє в історію замовлення."
              label="Причина повернення"
            >
              <TextInput
                onChange={(event) => setRefundReason(event.target.value)}
                value={refundReason}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || !refundReason}
                type="submit"
                variant="danger"
              >
                Повернути кошти
              </Button>
            </div>
          </form>
        </SectionPanel>
      )}
      <section className="grid gap-2">
        <h2 className="text-base font-semibold text-white">Платежі</h2>
        <DataTable
          caption="Платежі замовлення"
          columns={[
            {
              key: 'account',
              label: 'Рахунок',
              variant: 'primary',
              cell: (payment) => payment.accountName,
            },
            {
              key: 'amount',
              label: 'Сума',
              align: 'end',
              cell: (payment) => `${payment.amount} ${payment.currency}`,
            },
          ]}
          empty={
            <EmptyState
              description="Платежі з’являться тут після підтвердження замовлення."
              title="Платежів немає"
            />
          }
          rowKey={(payment) => payment.id}
          rows={order.payments}
        />
      </section>
      <section className="grid gap-2">
        <h2 className="text-base font-semibold text-white">Аудит</h2>
        <DataTable
          caption="Історія замовлення"
          columns={[
            {
              key: 'event',
              label: 'Подія',
              variant: 'primary',
              cell: (entry) => entry.eventType,
            },
            {
              key: 'user',
              label: 'Користувач',
              cell: (entry) => entry.userName,
            },
            {
              key: 'time',
              label: 'Час',
              cell: (entry) => (
                <time dateTime={entry.createdAt}>
                  {formatTimestamp(entry.createdAt)}
                </time>
              ),
            },
            {
              key: 'data',
              label: 'Деталі',
              cell: (entry) => entry.data ?? '—',
            },
          ]}
          empty={
            <EmptyState
              description="Дії із замовленням з’являться тут одразу після збереження."
              title="Подій немає"
            />
          }
          rowKey={(entry) => entry.key}
          rows={historyRows}
        />
      </section>
    </PageBody>
  )
}
