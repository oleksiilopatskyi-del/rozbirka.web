import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { ChevronLeft, Copy, MessageSquare, Phone, Plus } from 'lucide-react'
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
  PanelFooter,
  SearchInput,
  SectionPanel,
  SkeletonRows,
  StatStrip,
  StatusPill,
  TextArea,
  TextInput,
  Toolbar,
  useOperation,
} from '@/components/app'
import {
  customersApi,
  readCustomerPhoneConflict,
  type CustomerDetail,
  type CustomerListItem,
  type CustomerPhoneConflict,
} from '@/api/customers'
import { normalizeApiProblem } from '@/api/errors'
import type { Permission } from '../access-types'
import type { CabinetModuleScreenProps } from '../ModuleBoundary'
import { useCabinet } from '../CabinetContext'
import {
  evaluateModuleAccess,
  ModuleAccessDeniedError,
  type ModuleAccessOperation,
} from '../policy'
import { useLatestMutationGuard } from '../use-latest-mutation-guard'

const loadError = 'Не вдалося завантажити дані. Спробуйте ще раз.'
const nameExample = 'Наприклад: Ірина Коваль або СТО «Пітстоп»'
const phoneExample = 'Наприклад: +380 50 111 22 33'
const nameMissing = `Введіть ім’я клієнта — за ним ви знайдете його в списку й у замовленнях. ${nameExample}`
/** Digits, spaces, brackets, dashes and a leading plus — nothing else. */
const phoneShape = /^\+?[\d\s()-]+$/
const phoneProblem = (value: string): string | null => {
  if (value === '') return null
  if (!phoneShape.test(value))
    return `Приберіть із номера зайві символи — залиште цифри, пробіли, дужки та «+». ${phoneExample}`
  const digits = value.replace(/\D/g, '')
  if (digits.length < 9)
    return `У номері замало цифр. Додайте код оператора та країни. ${phoneExample}`
  if (digits.length > 15)
    return `У номері забагато цифр. Перевірте його: у міжнародному форматі їх щонайбільше 15. ${phoneExample}`
  return null
}
/** Turns a failed save into a reason the user can act on. */
const saveProblem = (failure: unknown): string => {
  const conflict = readCustomerPhoneConflict(failure)
  if (conflict) return conflict.message
  if (failure instanceof ModuleAccessDeniedError)
    return 'Права на зміну клієнтів більше немає. Оновіть сторінку або попросіть власника кабінету відкрити доступ.'
  return normalizeApiProblem(failure).message
}
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
  const editing = customerId !== null
  const backPath = editing ? `${directoryPath}/${customerId}` : directoryPath
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [touched, setTouched] = useState({ name: false, phone: false })
  const [duplicate, setDuplicate] = useState<CustomerPhoneConflict | null>(null)
  const [retryable, setRetryable] = useState(true)
  const [loadProblem, setLoadProblem] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [loading, setLoading] = useState(editing && ordersViewAllowed)
  const nameRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
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
            setLoadProblem(null)
            setLoading(false)
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setLoadProblem(loadError)
            setLoading(false)
          }
        })
      return () => controller.abort()
    }
  }, [customerId, ordersViewAllowed, reloadToken])
  const nameIssue = name.trim() === '' ? nameMissing : null
  const phoneIssue = phoneProblem(phone.trim())
  const save = useOperation(
    async () => {
      const scope = requireLatestMutation({ quota: false })
      if (customerId)
        requireLatestMutation({ permission: 'orders.view', quota: false })
      const input = {
        name: name.trim(),
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      }
      return customerId
        ? await customersApi.update(customerId, input, {
            signal: scope.signal,
          })
        : await customersApi.create(input, { signal: scope.signal })
    },
    {
      successMessage: editing ? 'Зміни збережено' : 'Клієнта створено',
      errorMessage: saveProblem,
      onError: (failure) => {
        setDuplicate(readCustomerPhoneConflict(failure))
        setRetryable(!(failure instanceof ModuleAccessDeniedError))
      },
      onSuccess: (result) => {
        void navigate(`${directoryPath}/${customerId ?? result.customer.id}`, {
          replace: true,
        })
      },
    },
  )
  const reactivateDuplicate = useOperation(
    async () => {
      if (duplicate === null || !mutationsAllowed) return null
      const scope = requireLatestMutation({ quota: false })
      if (customerId)
        requireLatestMutation({ permission: 'orders.view', quota: false })
      await customersApi.activate(duplicate.customerId, {
        signal: scope.signal,
      })
      return duplicate.customerId
    },
    {
      successMessage: 'Клієнта активовано',
      errorMessage: saveProblem,
      onSuccess: (activatedId) => {
        if (activatedId !== null)
          void navigate(`${directoryPath}/${activatedId}`, { replace: true })
      },
    },
  )
  /** One entry point for saving: the footer button and the retry both validate. */
  const attemptSave = () => {
    setTouched({ name: true, phone: true })
    if (nameIssue !== null) {
      nameRef.current?.focus()
      return
    }
    if (phoneIssue !== null) {
      phoneRef.current?.focus()
      return
    }
    if (!mutationsAllowed || !ordersViewAllowed || save.pending) return
    setDuplicate(null)
    setRetryable(true)
    save.run()
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    attemptSave()
  }
  if (!ordersViewAllowed)
    return (
      <PageBody width="narrow">
        <DeniedState
          description="Картку клієнта не відкрити без його замовлень, тож потрібен доступ до розділу «Замовлення». Попросіть власника кабінету відкрити його."
          role="alert"
          title="Потрібен доступ до замовлень."
        />
      </PageBody>
    )
  if (loadProblem !== null)
    return (
      <PageBody width="narrow">
        <ErrorState
          description={loadProblem}
          onRetry={() => {
            setLoadProblem(null)
            setLoading(true)
            setReloadToken((token) => token + 1)
          }}
          title="Не вдалося завантажити клієнта"
        />
      </PageBody>
    )
  if (loading)
    return (
      <PageBody width="narrow">
        <PageHeader eyebrow="Продажі · Клієнти" title="Редагувати клієнта" />
        <SkeletonRows columns={2} label="Завантажуємо клієнта…" rows={3} />
      </PageBody>
    )
  return (
    <PageBody width="narrow">
      <Button asChild className="justify-self-start" variant="quiet">
        <Link to={backPath}>
          <ChevronLeft aria-hidden />
          {editing ? 'До картки клієнта' : 'До списку клієнтів'}
        </Link>
      </Button>
      <PageHeader
        eyebrow="Продажі · Клієнти"
        title={editing ? 'Редагувати клієнта' : 'Новий клієнт'}
      />
      {mutationsAllowed ? null : (
        <Notice tone="warn">
          Дані можна переглянути, але не змінити. Щоб редагувати клієнтів,
          попросіть власника кабінету відкрити доступ.
        </Notice>
      )}
      <form
        aria-busy={save.pending}
        className="grid gap-4"
        noValidate
        onSubmit={submit}
      >
        <SectionPanel
          description="Ім’я показуємо в списку клієнтів і в замовленнях, телефон — для дзвінка та пошуку."
          title="Контакт"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              error={touched.name ? nameIssue : null}
              hint={nameExample}
              label="Ім’я"
              required
            >
              <TextInput
                autoComplete="name"
                disabled={!mutationsAllowed}
                onBlur={() =>
                  setTouched((current) => ({ ...current, name: true }))
                }
                onChange={(event) => setName(event.target.value)}
                ref={nameRef}
                required
                value={name}
              />
            </Field>
            <Field
              error={touched.phone ? phoneIssue : null}
              hint={`Один номер для дзвінка та SMS. ${phoneExample}`}
              label="Телефон"
            >
              <TextInput
                autoComplete="tel"
                disabled={!mutationsAllowed}
                inputMode="tel"
                onBlur={() =>
                  setTouched((current) => ({ ...current, phone: true }))
                }
                onChange={(event) => setPhone(event.target.value)}
                ref={phoneRef}
                type="tel"
                value={phone}
              />
            </Field>
          </div>
        </SectionPanel>
        <SectionPanel
          description="Домовленості, зручний час для дзвінка, побажання щодо доставки."
          title="Нотатки"
        >
          <Field hint="Видно лише вашій команді" label="Нотатки">
            <TextArea
              disabled={!mutationsAllowed}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              value={notes}
            />
          </Field>
        </SectionPanel>
        {duplicate === null ? null : (
          <Notice block role="alert" tone="warn">
            <p>
              {duplicate.message} Відкрийте наявну картку, щоб не заводити
              другу.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button asChild>
                <Link to={`${directoryPath}/${duplicate.customerId}`}>
                  Використати клієнта {duplicate.customerName}
                </Link>
              </Button>
              {!duplicate.isActive && mutationsAllowed && (
                <Button
                  {...reactivateDuplicate.triggerProps}
                  onClick={() => {
                    reactivateDuplicate.run()
                  }}
                >
                  Активувати {duplicate.customerName}
                </Button>
              )}
            </div>
          </Notice>
        )}
        {reactivateDuplicate.error === null ? null : (
          <Notice tone="danger">{reactivateDuplicate.error}</Notice>
        )}
        {save.error === null || duplicate !== null ? null : (
          <Notice
            action={
              retryable ? (
                <Button onClick={attemptSave}>Спробувати ще раз</Button>
              ) : undefined
            }
            tone="danger"
          >
            {save.error}
          </Notice>
        )}
        <Panel padded={false}>
          <PanelFooter
            className="border-t-0"
            leading="Зірочкою позначено обов’язкове поле"
          >
            <Button asChild variant="quiet">
              <Link to={backPath}>Скасувати</Link>
            </Button>
            <Button
              {...save.triggerProps}
              disabled={!mutationsAllowed || save.pending}
              type="submit"
              variant="primary"
            >
              {save.pending
                ? 'Зберігаємо…'
                : editing
                  ? 'Зберегти зміни'
                  : 'Створити клієнта'}
            </Button>
          </PanelFooter>
        </Panel>
      </form>
    </PageBody>
  )
}
