import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router'
import { Plus } from 'lucide-react'
import {
  ActiveFilters,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Notice,
  PageBody,
  PageHeader,
  Pagination,
  SearchInput,
  SelectInput,
  StatStrip,
  StatusPill,
  TextInput,
  Toolbar,
  type StatusTone,
} from '@/components/app'
import {
  partsApi,
  type CreatePartRequest,
  type PartDetail,
  type PartListItem,
  type PartsSummary,
} from '@/api/parts'
import { carsApi, type CarListItem } from '@/api/cars'
import { intakesApi, type IntakeListItem } from '@/api/intakes'
import { mediaApi } from '@/api/media'
import { useCabinet } from '../CabinetContext'
import type { CabinetModuleScreenProps } from '../ModuleBoundary'
import {
  cabinetModules,
  type CabinetModuleDefinition,
} from '../module-registry'
import { evaluateModuleAccess, type ModuleAccessDecision } from '../policy'
import { useLatestMutationGuard } from '../use-latest-mutation-guard'

const partStatuses = new Set(['available', 'reserved', 'sold'])
const positiveInteger = (value: string | null, fallback: number) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
const pageSizeParam = (value: string | null, fallback: number) => {
  const parsed = positiveInteger(value, fallback)
  return parsed <= 100 ? parsed : fallback
}
const statusPresentation = (
  status: string,
): { label: string; tone: StatusTone } => {
  if (status === 'available') return { label: 'Доступно', tone: 'ok' }
  if (status === 'reserved') return { label: 'У резерві', tone: 'warn' }
  if (status === 'sold') return { label: 'Продано', tone: 'neutral' }
  return { label: status, tone: 'neutral' }
}

const optional = (value: string) => value.trim() || undefined
const optionalNumber = (value: string) =>
  value.trim() ? Number(value) : undefined
const normalizedIds = (values: string[]) => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
]

interface SourceOptions {
  cars: CarListItem[]
  intakes: IntakeListItem[]
  carsUnavailable: boolean
  intakesUnavailable: boolean
}

function useSourceOptions(
  loadCars: boolean,
  loadIntakes: boolean,
): SourceOptions {
  const [options, setOptions] = useState<SourceOptions>({
    cars: [],
    intakes: [],
    carsUnavailable: false,
    intakesUnavailable: false,
  })
  useEffect(() => {
    if (!loadCars) return
    const controller = new AbortController()
    void carsApi
      .list({ page: 1, pageSize: 100 }, { signal: controller.signal })
      .then(
        (page) => {
          if (!controller.signal.aborted)
            setOptions((current) => ({
              ...current,
              cars: page.items,
              carsUnavailable: false,
            }))
        },
        () => {
          if (!controller.signal.aborted)
            setOptions((current) => ({
              ...current,
              carsUnavailable: true,
            }))
        },
      )
    return () => controller.abort()
  }, [loadCars])
  useEffect(() => {
    if (!loadIntakes) return
    const controller = new AbortController()
    void intakesApi
      .list({ page: 1, pageSize: 100 }, { signal: controller.signal })
      .then(
        (page) => {
          if (!controller.signal.aborted)
            setOptions((current) => ({
              ...current,
              intakes: page.items,
              intakesUnavailable: false,
            }))
        },
        () => {
          if (!controller.signal.aborted)
            setOptions((current) => ({
              ...current,
              intakesUnavailable: true,
            }))
        },
      )
    return () => controller.abort()
  }, [loadIntakes])
  return options
}

const carLabel = (car: CarListItem) =>
  `${car.code} · ${car.brand} ${car.model} (${car.year})`
const intakeLabel = (intake: IntakeListItem) =>
  `${intake.name ?? 'Без назви'} · ${intake.supplier ?? 'Постачальника не вказано'}`

const accessState = (cabinet: ReturnType<typeof useCabinet>) =>
  cabinet.status === 'ready' && cabinet.snapshot
    ? { status: 'ready' as const, snapshot: cabinet.snapshot, error: null }
    : cabinet.status === 'error'
      ? { status: 'error' as const, snapshot: null, error: cabinet.error }
      : { status: 'loading' as const, snapshot: null, error: null }

const withoutQuota = (definition: CabinetModuleDefinition) => {
  const { quotaResource: _quotaResource, ...unmetered } = definition
  return unmetered
}

function AccessDenied({ decision }: { decision: ModuleAccessDecision }) {
  const message =
    decision.kind === 'quota-exhausted'
      ? 'Ліміт деталей вичерпано.'
      : decision.kind === 'subscription-blocked'
        ? 'Поточна підписка не дозволяє цю дію.'
        : decision.kind === 'access-loading'
          ? 'Перевіряємо доступ…'
          : decision.kind === 'access-error'
            ? 'Не вдалося перевірити доступ.'
            : 'Недостатньо прав.'
  return (
    <Notice role="alert" tone="warn">
      {message}
    </Notice>
  )
}

const allowedToView = (
  definition: CabinetModuleDefinition,
  cabinet: ReturnType<typeof useCabinet>,
) =>
  evaluateModuleAccess(
    { ...definition, released: true },
    accessState(cabinet),
    'view',
  ).kind === 'allowed'

export function PartsScreen({ definition }: CabinetModuleScreenProps) {
  const cabinet = useCabinet()
  const { requireLatestMutation } = useLatestMutationGuard(definition)
  const { partId } = useParams<{ partId: string }>()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [items, setItems] = useState<PartListItem[]>([])
  const [summary, setSummary] = useState<PartsSummary | null>(null)
  const [pageMeta, setPageMeta] = useState<{
    page: number
    totalPages: number
  } | null>(null)
  const [detail, setDetail] = useState<PartDetail | null>(null)
  const [history, setHistory] = useState<Awaited<
    ReturnType<typeof partsApi.history>
  > | null>(null)
  const [error, setError] = useState(false)
  const isNew = location.pathname.endsWith('/new')
  const isEdit = location.pathname.endsWith('/edit')
  const createDecision = evaluateModuleAccess(
    definition,
    accessState(cabinet),
    'mutation',
  )
  const manageDecision = evaluateModuleAccess(
    withoutQuota(definition),
    accessState(cabinet),
    'mutation',
  )
  const canManage = manageDecision.kind === 'allowed'
  const links = {
    cars: allowedToView(cabinetModules.cars, cabinet),
    intakes: allowedToView(cabinetModules.intakes, cabinet),
    orders: allowedToView(cabinetModules.orders, cabinet),
  }
  const sourceOptions = useSourceOptions(
    !partId && !isNew && links.cars,
    !partId && !isNew && links.intakes,
  )

  const filters = useMemo(
    () => ({
      ...(searchParams.get('q') ? { q: searchParams.get('q')! } : {}),
      ...(partStatuses.has(searchParams.get('status') ?? '')
        ? { status: searchParams.get('status')! }
        : {}),
      ...(searchParams.get('make') ? { make: searchParams.get('make')! } : {}),
      page: positiveInteger(searchParams.get('page'), 1),
      pageSize: pageSizeParam(searchParams.get('per_page'), 30),
      carIds: normalizedIds(searchParams.getAll('car_ids')),
      intakeIds: normalizedIds(searchParams.getAll('intake_ids')),
    }),
    [searchParams],
  )
  useEffect(() => {
    if (partId || isNew) return
    const next = new URLSearchParams(searchParams)
    const normalizeScalar = (name: 'q' | 'make') => {
      const raw = searchParams.get(name)
      if (raw === null) return
      const trimmed = raw.trim()
      if (trimmed) next.set(name, trimmed)
      else next.delete(name)
    }
    normalizeScalar('q')
    normalizeScalar('make')
    const rawStatus = searchParams.get('status')
    if (rawStatus !== null && !partStatuses.has(rawStatus))
      next.delete('status')
    const rawPage = searchParams.get('page')
    if (rawPage !== null && String(filters.page) !== rawPage)
      next.set('page', String(filters.page))
    const rawPageSize = searchParams.get('per_page')
    if (rawPageSize !== null && String(filters.pageSize) !== rawPageSize)
      next.set('per_page', String(filters.pageSize))
    for (const [name, values] of [
      ['car_ids', filters.carIds],
      ['intake_ids', filters.intakeIds],
    ] as const) {
      const rawValues = searchParams.getAll(name)
      if (
        rawValues.length === values.length &&
        rawValues.every((value, index) => value === values[index])
      )
        continue
      next.delete(name)
      values.forEach((value) => next.append(name, value))
    }
    if (next.toString() !== searchParams.toString())
      setSearchParams(next, { replace: true })
  }, [filters, isNew, partId, searchParams, setSearchParams])

  useEffect(() => {
    const controller = new AbortController()
    if (partId && !isEdit) {
      void Promise.all([
        partsApi.get(partId, { signal: controller.signal }),
        partsApi.history(partId, { signal: controller.signal }),
      ])
        .then(([result, nextHistory]) => {
          if (controller.signal.aborted) return
          setDetail(result)
          setHistory(nextHistory)
          setError(false)
        })
        .catch(() => {
          if (!controller.signal.aborted) setError(true)
        })
      return () => controller.abort()
    }
    if (!partId && !isNew) {
      void Promise.all([
        partsApi.list({ ...filters, signal: controller.signal }),
        partsApi.summary({ signal: controller.signal }),
      ])
        .then(([page, nextSummary]) => {
          if (controller.signal.aborted) return
          setItems(page.items)
          setPageMeta({ page: page.page, totalPages: page.totalPages })
          setSummary(nextSummary)
          setError(false)
        })
        .catch(() => {
          if (!controller.signal.aborted) setError(true)
        })
    }
    return () => controller.abort()
  }, [filters, isEdit, isNew, partId])

  if (isNew && createDecision.kind !== 'allowed')
    return <AccessDenied decision={createDecision} />
  if (isEdit && manageDecision.kind !== 'allowed')
    return <AccessDenied decision={manageDecision} />
  if (isNew)
    return (
      <PartForm
        canViewCars={links.cars}
        canViewIntakes={links.intakes}
        requireLatestMutation={requireLatestMutation}
        title="Нова деталь"
      />
    )
  if (isEdit && partId)
    return (
      <PartEdit
        canViewCars={links.cars}
        canViewIntakes={links.intakes}
        partId={partId}
        requireLatestMutation={requireLatestMutation}
      />
    )
  if (partId)
    return (
      <PartDetailScreen
        detail={detail}
        history={history}
        error={error}
        partId={partId}
        canManage={canManage}
        links={links}
        requireLatestMutation={requireLatestMutation}
        tenantSlug={cabinet.targetTenant?.slug ?? ''}
      />
    )

  const updatePage = (page: number) => {
    const next = new URLSearchParams(searchParams)
    next.set('page', String(page))
    setSearchParams(next)
  }
  const updateFilter = (name: string, value: string, list = false) => {
    const next = new URLSearchParams(searchParams)
    next.delete(name)
    if (list) {
      normalizedIds(value.split(',')).forEach((entry) =>
        next.append(name, entry),
      )
    } else if (value.trim()) {
      next.set(name, value.trim())
    }
    next.delete('page')
    setSearchParams(next)
  }
  const updateIdFilter = (name: 'car_ids' | 'intake_ids', values: string[]) => {
    const next = new URLSearchParams(searchParams)
    next.delete(name)
    normalizedIds(values).forEach((value) => next.append(name, value))
    next.delete('page')
    setSearchParams(next)
  }
  const clearFilter = (name: string) => {
    const next = new URLSearchParams(searchParams)
    next.delete(name)
    next.delete('page')
    setSearchParams(next)
  }
  const activeFilters = [
    ...(filters.q === undefined
      ? []
      : [
          {
            key: 'q',
            label: `Пошук: ${filters.q}`,
            onClear: () => clearFilter('q'),
          },
        ]),
    ...(filters.status === undefined
      ? []
      : [
          {
            key: 'status',
            label: `Стан: ${statusPresentation(filters.status).label}`,
            onClear: () => clearFilter('status'),
          },
        ]),
    ...(filters.make === undefined
      ? []
      : [
          {
            key: 'make',
            label: `Марка: ${filters.make}`,
            onClear: () => clearFilter('make'),
          },
        ]),
  ]

  return (
    <PageBody>
      <PageHeader
        actions={
          createDecision.kind === 'allowed' ? (
            <Button asChild variant="primary">
              <Link to="new">
                <Plus aria-hidden />
                Додати деталь
              </Link>
            </Button>
          ) : undefined
        }
        eyebrow="Склад"
        title="Деталі"
      />
      <Toolbar>
        <Field className="min-w-52 flex-1" label="Пошук">
          <SearchInput
            name="q"
            onChange={(event) => updateFilter('q', event.target.value)}
            value={filters.q ?? ''}
          />
        </Field>
        <Field className="min-w-40" label="Статус">
          <SelectInput
            aria-label="Статус"
            name="status"
            onChange={(event) => updateFilter('status', event.target.value)}
            value={filters.status ?? ''}
          >
            <option value="">Усі</option>
            <option value="available">Доступні</option>
            <option value="reserved">Зарезервовані</option>
            <option value="sold">Продані</option>
          </SelectInput>
        </Field>
        <Field className="min-w-36" label="Марка">
          <TextInput
            aria-label="Марка"
            name="make"
            onChange={(event) => updateFilter('make', event.target.value)}
            value={filters.make ?? ''}
          />
        </Field>
        {links.cars ? (
          <label className="text-app-muted grid gap-1.5 text-[12.5px]">
            Авто
            <select
              aria-label="Авто"
              multiple
              onChange={(event) =>
                updateIdFilter(
                  'car_ids',
                  Array.from(
                    event.target.selectedOptions,
                    (option) => option.value,
                  ),
                )
              }
              name="carIds"
              className="bg-app-input border-app-line-2 rounded-control text-app-ink min-h-11 border px-2 py-1.5 text-sm"
              value={filters.carIds}
            >
              {sourceOptions.cars.map((car) => (
                <option key={car.id} value={car.id}>
                  {carLabel(car)}
                </option>
              ))}
              {filters.carIds
                .filter(
                  (id) => !sourceOptions.cars.some((car) => car.id === id),
                )
                .map((id) => (
                  <option key={id} value={id}>
                    Автомобіль недоступний у поточній вибірці
                  </option>
                ))}
            </select>
            {sourceOptions.carsUnavailable ? (
              <span className="text-app-dim text-[11.5px]" role="status">
                Пошук автомобілів недоступний: список не завантажено.
              </span>
            ) : null}
          </label>
        ) : null}
        {links.intakes ? (
          <label className="text-app-muted grid gap-1.5 text-[12.5px]">
            Приймання
            <select
              aria-label="Приймання"
              multiple
              onChange={(event) =>
                updateIdFilter(
                  'intake_ids',
                  Array.from(
                    event.target.selectedOptions,
                    (option) => option.value,
                  ),
                )
              }
              name="intakeIds"
              className="bg-app-input border-app-line-2 rounded-control text-app-ink min-h-11 border px-2 py-1.5 text-sm"
              value={filters.intakeIds}
            >
              {sourceOptions.intakes.map((intake) => (
                <option key={intake.id} value={intake.id}>
                  {intakeLabel(intake)}
                </option>
              ))}
              {filters.intakeIds
                .filter(
                  (id) =>
                    !sourceOptions.intakes.some((intake) => intake.id === id),
                )
                .map((id) => (
                  <option key={id} value={id}>
                    Приймання недоступне у поточній вибірці
                  </option>
                ))}
            </select>
            {sourceOptions.intakesUnavailable ? (
              <span className="text-app-dim text-[11.5px]" role="status">
                Пошук приймань недоступний: список не завантажено.
              </span>
            ) : null}
          </label>
        ) : null}
        <Field className="min-w-40" label="Розмір сторінки">
          <SelectInput
            aria-label="Розмір сторінки"
            name="per_page"
            onChange={(event) => updateFilter('per_page', event.target.value)}
            value={String(filters.pageSize)}
          >
            <option value="10">10</option>
            <option value="30">30</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </SelectInput>
        </Field>
        <ActiveFilters
          filters={activeFilters}
          onReset={() => setSearchParams(new URLSearchParams())}
        />
      </Toolbar>
      {summary ? (
        <StatStrip
          items={[
            { label: 'усього', value: summary.total },
            { label: 'доступно', value: summary.available },
            { label: 'у резерві', value: summary.reserved },
          ]}
        />
      ) : null}
      {error ? (
        <ErrorState
          description="Не вдалося завантажити склад. Дані на місці — потрібно лише повторити запит."
          onRetry={() => setSearchParams(new URLSearchParams(searchParams))}
          title="Склад не завантажився"
        />
      ) : (
        <DataTable
          caption="Деталі на складі"
          columns={[
            {
              key: 'name',
              label: 'Деталь',
              variant: 'primary',
              cell: (part) => (
                <Link className="hover:text-brand block" to={part.id}>
                  {part.name}
                </Link>
              ),
            },
            {
              key: 'car',
              label: 'Авто-джерело',
              cell: (part) =>
                part.car
                  ? `${part.car.make} ${part.car.model} · ${String(part.car.year)}`
                  : '—',
            },
            {
              key: 'status',
              label: 'Стан',
              cell: (part) => {
                const presentation = statusPresentation(part.status ?? '')
                return presentation.label === '' ? (
                  '—'
                ) : (
                  <StatusPill tone={presentation.tone}>
                    {presentation.label}
                  </StatusPill>
                )
              },
            },
            {
              key: 'available',
              label: 'Доступно',
              align: 'end',
              cell: (part) => part.quantityAvailable,
            },
            {
              key: 'reserved',
              label: 'Резерв',
              align: 'end',
              cell: (part) => part.quantityReserved,
            },
          ]}
          empty={
            <EmptyState
              description={
                activeFilters.length > 0
                  ? 'За цими фільтрами нічого немає. Спробуйте прибрати частину умов.'
                  : 'Додайте першу деталь або розберіть авто — позиції з’являться тут.'
              }
              title={
                activeFilters.length > 0
                  ? 'Нічого не знайдено'
                  : 'Тут поки порожньо'
              }
            />
          }
          footer={
            pageMeta ? (
              <Pagination
                label="Пагінація деталей"
                onPage={updatePage}
                page={pageMeta.page}
                totalPages={pageMeta.totalPages}
              />
            ) : null
          }
          rowKey={(part) => part.id}
          rows={items}
        />
      )}
    </PageBody>
  )
}

function PartDetailScreen({
  detail,
  history,
  partId,
  error,
  canManage,
  links,
  requireLatestMutation,
  tenantSlug,
}: {
  detail: PartDetail | null
  history: Awaited<ReturnType<typeof partsApi.history>> | null
  partId: string
  error: boolean
  canManage: boolean
  links: { cars: boolean; intakes: boolean; orders: boolean }
  requireLatestMutation: ReturnType<
    typeof useLatestMutationGuard
  >['requireLatestMutation']
  tenantSlug: string
}) {
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const remove = async () => {
    if (deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const scope = requireLatestMutation({ quota: false })
      await partsApi.delete(partId, { signal: scope.signal })
      setConfirmingDelete(false)
      void navigate('..', { replace: true })
    } catch (failure) {
      const status =
        typeof failure === 'object' &&
        failure !== null &&
        'response' in failure &&
        typeof failure.response === 'object' &&
        failure.response !== null &&
        'status' in failure.response
          ? failure.response.status
          : undefined
      setDeleteError(
        status === 409
          ? 'Не вдалося видалити деталь через конфлікт.'
          : 'Не вдалося видалити деталь.',
      )
    } finally {
      setDeleting(false)
    }
  }
  return (
    <PageBody width="narrow">
      <PageHeader
        eyebrow="Склад · Деталі"
        title={detail === null ? 'Деталь' : detail.name}
      />
      {error ? (
        <ErrorState
          description="Деталь не вдалося завантажити. Спробуйте ще раз."
          title="Не вдалося завантажити деталь"
        />
      ) : detail ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill tone={statusPresentation(detail.status).tone}>
              {statusPresentation(detail.status).label}
            </StatusPill>
            <p className="text-app-muted text-sm tabular-nums">
              Усього: {detail.quantityTotal}; доступно:{' '}
              {detail.quantityAvailable}; у резерві: {detail.quantityReserved};
              продано: {detail.quantitySoldTotal}
            </p>
          </div>
          <p className="text-app-dim text-sm">
            Сумісність:{' '}
            {[
              detail.compatCarBrand,
              detail.compatCarModel,
              detail.compatCarYear,
            ]
              .filter(Boolean)
              .join(' ') || 'не вказано'}
          </p>
          <dl className="border-app-line rounded-panel bg-app-raised text-app-muted grid gap-1.5 border p-4 text-sm">
            <div>OEM: {detail.oemCode ?? '—'}</div>
            <div>Стан: {detail.condition}</div>
            <div>Статус: {detail.status}</div>
            <div>Ціна: {detail.effectiveSalePrice ?? '—'}</div>
            <div>Нотатки: {detail.notes ?? '—'}</div>
            <div>
              Створила/в: {detail.createdByName} · {detail.createdAt}
            </div>
            <div>
              Джерело:{' '}
              {detail.carId && detail.carCode && links.cars ? (
                <Link to={`/app/${tenantSlug}/cars/${detail.carId}`}>
                  {detail.carCode}
                </Link>
              ) : detail.intakeId && links.intakes ? (
                <Link to={`/app/${tenantSlug}/intakes/${detail.intakeId}`}>
                  Приймання
                </Link>
              ) : (
                (detail.carCode ??
                (detail.source === 'batch' ? 'Приймання' : detail.source))
              )}
            </div>
          </dl>
          {detail.photos.length ? (
            <ul aria-label="Фото деталі">
              {detail.photos.map((photo, index) => (
                <li key={photo.id}>
                  <a href={photo.url}>Фото {index + 1}</a>
                </li>
              ))}
            </ul>
          ) : (
            <p>Фото відсутні.</p>
          )}
          {detail.reservations?.length ? (
            <section>
              <h2>Резервування</h2>
              <ul>
                {detail.reservations.map((reservation) => (
                  <li key={reservation.orderId}>
                    {links.orders ? (
                      <Link
                        to={`/app/${tenantSlug}/orders/${reservation.orderId}`}
                      >
                        Замовлення {reservation.orderNumber}
                      </Link>
                    ) : (
                      <>Замовлення {reservation.orderNumber}</>
                    )}
                    : {reservation.quantity}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {detail.order ? (
            <p>
              Поточне замовлення:{' '}
              {links.orders ? (
                <Link to={`/app/${tenantSlug}/orders/${detail.order.id}`}>
                  {detail.order.number}
                </Link>
              ) : (
                detail.order.number
              )}
            </p>
          ) : null}
          {detail.soldOrders?.length ? (
            <section>
              <h2>Продажі</h2>
              <ul>
                {detail.soldOrders.map((order) => (
                  <li key={order.orderId}>
                    {links.orders ? (
                      <Link to={`/app/${tenantSlug}/orders/${order.orderId}`}>
                        Замовлення {order.orderNumber}
                      </Link>
                    ) : (
                      <>Замовлення {order.orderNumber}</>
                    )}
                    : {order.quantitySold} × {order.unitPrice}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {history ? (
            <section>
              <h2>Історія</h2>
              <ul>
                {history.events.map((event) => (
                  <li key={event.id}>
                    {event.eventType} · {event.data ?? '—'} · {event.user.name}{' '}
                    · {event.createdAt}
                    {event.order ? (
                      <>
                        {' · '}
                        {links.orders ? (
                          <Link
                            to={`/app/${tenantSlug}/orders/${event.order.id}`}
                          >
                            Замовлення {event.order.number}
                          </Link>
                        ) : (
                          <>Замовлення {event.order.number}</>
                        )}
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <p className="text-app-dim text-sm" role="status">
          Завантажуємо серверний стан…
        </p>
      )}
      <p className="text-app-dim text-[12.5px]">
        Сумісність недоступна для редагування
      </p>
      <p className="text-app-dim text-[12.5px]">
        Видалення деталі перевіряється сервером.
      </p>
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="primary">
            <Link to={`/app/${tenantSlug}/parts/${partId}/edit`}>
              Редагувати деталь
            </Link>
          </Button>
          <Button
            aria-busy={deleting}
            disabled={deleting}
            onClick={() => setConfirmingDelete(true)}
            variant="danger"
          >
            Видалити деталь
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        confirmLabel="Видалити"
        consequence="Історія продажів, резерви та фото цієї деталі зникнуть назавжди."
        error={deleteError}
        onConfirm={() => void remove()}
        onOpenChange={setConfirmingDelete}
        open={confirmingDelete}
        pending={deleting}
        title="Видалити деталь?"
      />
      {deleteError !== null && !confirmingDelete ? (
        <Notice tone="danger">{deleteError}</Notice>
      ) : null}
    </PageBody>
  )
}

interface PartFormValues {
  sourceType: string
  sourceId: string
  name: string
  quantity: string
  unit: string
  condition: string
  notes: string
  oemCode: string
  partType: string
  desiredSalePrice: string
  carBrand: string
  carModel: string
  carYear: string
}

const emptyPartForm: PartFormValues = {
  sourceType: 'free',
  sourceId: '',
  name: '',
  quantity: '1',
  unit: '',
  condition: '',
  notes: '',
  oemCode: '',
  partType: '',
  desiredSalePrice: '',
  carBrand: '',
  carModel: '',
  carYear: '',
}

type PartMediaStatus =
  | 'uploading'
  | 'uploaded'
  | 'upload-error'
  | 'removing'
  | 'remove-error'

interface PartMediaItem {
  id: string
  name: string
  status: PartMediaStatus
  existing: boolean
  file?: File
  storageKey?: string
  url?: string
}

const committedPhotoKeys = (items: PartMediaItem[]) =>
  items.flatMap((item) =>
    item.status === 'uploaded' && item.storageKey ? [item.storageKey] : [],
  )

const safeMediaUrl = (value: string | undefined) => {
  if (!value) return null
  try {
    const url = new URL(value, window.location.origin)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : null
  } catch {
    return null
  }
}

function PartMediaFields({
  items,
  requireLatestMutation,
  setItems,
}: {
  items: PartMediaItem[]
  requireLatestMutation: ReturnType<
    typeof useLatestMutationGuard
  >['requireLatestMutation']
  setItems: React.Dispatch<React.SetStateAction<PartMediaItem[]>>
}) {
  const sequenceRef = useRef(0)
  const mountedRef = useRef(true)
  useEffect(
    () => () => {
      mountedRef.current = false
    },
    [],
  )

  const updateItem = (id: string, update: Partial<PartMediaItem>) => {
    if (!mountedRef.current) return
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...update } : item)),
    )
  }
  const upload = async (item: PartMediaItem) => {
    if (!item.file) return
    updateItem(item.id, { status: 'uploading' })
    try {
      const scope = requireLatestMutation({ quota: false })
      const uploaded = await mediaApi.upload(item.file, 'parts', {
        signal: scope.signal,
      })
      updateItem(item.id, {
        status: 'uploaded',
        storageKey: uploaded.storageKey,
        url: uploaded.url,
      })
    } catch {
      updateItem(item.id, { status: 'upload-error' })
    }
  }
  const addFiles = (files: FileList | null) => {
    if (!files?.length) return
    const additions = Array.from(files, (file) => ({
      id: `new-media-${sequenceRef.current++}`,
      name: file.name,
      status: 'uploading' as const,
      existing: false,
      file,
    }))
    setItems((current) => [...current, ...additions])
    additions.forEach((item) => void upload(item))
  }
  const remove = async (item: PartMediaItem) => {
    if (item.existing || !item.storageKey) {
      setItems((current) => current.filter(({ id }) => id !== item.id))
      return
    }
    updateItem(item.id, { status: 'removing' })
    try {
      const scope = requireLatestMutation({ quota: false })
      await mediaApi.remove(item.storageKey, { signal: scope.signal })
      if (mountedRef.current)
        setItems((current) => current.filter(({ id }) => id !== item.id))
    } catch {
      updateItem(item.id, { status: 'remove-error' })
    }
  }
  const statusLabel = (item: PartMediaItem) => {
    if (item.status === 'uploading') return 'Завантаження…'
    if (item.status === 'uploaded') return 'Завантажено'
    if (item.status === 'upload-error') return 'Помилка завантаження'
    if (item.status === 'removing') return 'Видалення…'
    return 'Помилка видалення'
  }
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm text-neutral-300">Фото деталі</legend>
      <input
        accept="image/*"
        aria-label="Фото деталі"
        multiple
        onChange={(event) => {
          addFiles(event.currentTarget.files)
          event.currentTarget.value = ''
        }}
        type="file"
      />
      {items.length ? (
        <ul className="grid gap-2">
          {items.map((item) => {
            const url = safeMediaUrl(item.url)
            return (
              <li key={item.id}>
                <span>
                  {item.name} · {statusLabel(item)}
                </span>{' '}
                {url ? <a href={url}>{item.name}</a> : null}{' '}
                {item.status === 'upload-error' ? (
                  <button
                    aria-label={`Повторити ${item.name}`}
                    onClick={() => void upload(item)}
                    type="button"
                  >
                    Повторити
                  </button>
                ) : null}{' '}
                {item.status === 'remove-error' ? (
                  <button
                    aria-label={`Повторити видалення ${item.name}`}
                    onClick={() => void remove(item)}
                    type="button"
                  >
                    Повторити видалення
                  </button>
                ) : null}{' '}
                {item.status !== 'uploading' && item.status !== 'removing' ? (
                  <button
                    aria-label={`Прибрати ${item.name}`}
                    onClick={() => void remove(item)}
                    type="button"
                  >
                    Прибрати
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-neutral-400">Фото не вибрано.</p>
      )}
    </fieldset>
  )
}

function PartFields({
  values,
  setValues,
  sourceOptions,
  canViewCars,
  canViewIntakes,
  edit,
}: {
  values: PartFormValues
  setValues: (values: PartFormValues) => void
  sourceOptions: SourceOptions
  canViewCars: boolean
  canViewIntakes: boolean
  edit?: boolean
}) {
  const field =
    (name: keyof PartFormValues) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValues({ ...values, [name]: event.target.value })
  return (
    <>
      <label className="grid gap-1 text-sm text-neutral-300">
        Тип джерела
        <select
          aria-label="Тип джерела"
          disabled={edit}
          onChange={(event) =>
            setValues({
              ...values,
              sourceType: event.target.value,
              sourceId: '',
            })
          }
          value={values.sourceType}
        >
          <option value="free">Вільне</option>
          {canViewCars || values.sourceType === 'car' ? (
            <option value="car">Автомобіль</option>
          ) : null}
          {canViewIntakes || values.sourceType === 'batch' ? (
            <option value="batch">Приймання</option>
          ) : null}
        </select>
      </label>
      {values.sourceType === 'car' && !canViewCars ? (
        <p role="status">
          Вибір автомобіля недоступний без права перегляду автомобілів.
        </p>
      ) : values.sourceType === 'car' ? (
        <label className="grid gap-1 text-sm text-neutral-300">
          Автомобіль-джерело
          <select
            aria-label="Автомобіль-джерело"
            disabled={(edit ?? false) || sourceOptions.carsUnavailable}
            onChange={field('sourceId')}
            value={values.sourceId}
          >
            <option value="">Оберіть автомобіль</option>
            {sourceOptions.cars.map((car) => (
              <option key={car.id} value={car.id}>
                {carLabel(car)}
              </option>
            ))}
            {values.sourceId &&
            !sourceOptions.cars.some((car) => car.id === values.sourceId) ? (
              <option value={values.sourceId}>
                Автомобіль недоступний у поточній вибірці
              </option>
            ) : null}
          </select>
          {sourceOptions.carsUnavailable ? (
            <span role="status">
              Вибір автомобіля недоступний: список не завантажено.
            </span>
          ) : null}
        </label>
      ) : values.sourceType === 'batch' && !canViewIntakes ? (
        <p role="status">
          Вибір приймання недоступний без права перегляду приймань.
        </p>
      ) : values.sourceType === 'batch' ? (
        <label className="grid gap-1 text-sm text-neutral-300">
          Приймання-джерело
          <select
            aria-label="Приймання-джерело"
            disabled={(edit ?? false) || sourceOptions.intakesUnavailable}
            onChange={field('sourceId')}
            value={values.sourceId}
          >
            <option value="">Оберіть приймання</option>
            {sourceOptions.intakes.map((intake) => (
              <option key={intake.id} value={intake.id}>
                {intakeLabel(intake)}
              </option>
            ))}
            {values.sourceId &&
            !sourceOptions.intakes.some(
              (intake) => intake.id === values.sourceId,
            ) ? (
              <option value={values.sourceId}>
                Приймання недоступне у поточній вибірці
              </option>
            ) : null}
          </select>
          {sourceOptions.intakesUnavailable ? (
            <span role="status">
              Вибір приймання недоступний: список не завантажено.
            </span>
          ) : null}
        </label>
      ) : null}
      <label className="grid gap-1 text-sm text-neutral-300">
        Назва
        <input
          aria-label="Назва"
          onChange={field('name')}
          value={values.name}
        />
      </label>
      <label className="grid gap-1 text-sm text-neutral-300">
        Кількість
        <input
          aria-label="Кількість"
          min="1"
          onChange={field('quantity')}
          type="number"
          value={values.quantity}
        />
      </label>
      <label className="grid gap-1 text-sm text-neutral-300">
        Одиниця
        <input
          aria-label="Одиниця"
          onChange={field('unit')}
          value={values.unit}
        />
      </label>
      <label className="grid gap-1 text-sm text-neutral-300">
        Стан
        <input
          aria-label="Стан"
          onChange={field('condition')}
          value={values.condition}
        />
      </label>
      <label className="grid gap-1 text-sm text-neutral-300">
        Нотатки
        <input
          aria-label="Нотатки"
          onChange={field('notes')}
          value={values.notes}
        />
      </label>
      <label className="grid gap-1 text-sm text-neutral-300">
        OEM-код
        <input
          aria-label="OEM-код"
          disabled={edit}
          onChange={field('oemCode')}
          value={values.oemCode}
        />
      </label>
      <label className="grid gap-1 text-sm text-neutral-300">
        Тип деталі
        <input
          aria-label="Тип деталі"
          onChange={field('partType')}
          value={values.partType}
        />
      </label>
      <label className="grid gap-1 text-sm text-neutral-300">
        Бажана ціна
        <input
          aria-label="Бажана ціна"
          min="0"
          onChange={field('desiredSalePrice')}
          step="0.01"
          type="number"
          value={values.desiredSalePrice}
        />
      </label>
      {!edit && values.sourceType === 'free' ? (
        <>
          <label className="grid gap-1 text-sm text-neutral-300">
            Марка сумісності
            <input
              aria-label="Марка сумісності"
              onChange={field('carBrand')}
              value={values.carBrand}
            />
          </label>
          <label className="grid gap-1 text-sm text-neutral-300">
            Модель сумісності
            <input
              aria-label="Модель сумісності"
              onChange={field('carModel')}
              value={values.carModel}
            />
          </label>
          <label className="grid gap-1 text-sm text-neutral-300">
            Рік сумісності
            <input
              aria-label="Рік сумісності"
              onChange={field('carYear')}
              type="number"
              value={values.carYear}
            />
          </label>
        </>
      ) : null}
    </>
  )
}

function validFormNumbers(values: PartFormValues) {
  const quantity = Number(values.quantity)
  const price = optionalNumber(values.desiredSalePrice)
  const year = optionalNumber(values.carYear)
  return {
    quantity,
    price,
    year,
    valid:
      Number.isInteger(quantity) &&
      quantity > 0 &&
      (price === undefined || (Number.isFinite(price) && price >= 0)) &&
      (year === undefined || (Number.isInteger(year) && year > 0)),
  }
}

function PartForm({
  title,
  canViewCars,
  canViewIntakes,
  requireLatestMutation,
}: {
  title: string
  canViewCars: boolean
  canViewIntakes: boolean
  requireLatestMutation: ReturnType<
    typeof useLatestMutationGuard
  >['requireLatestMutation']
}) {
  const carMutation = useLatestMutationGuard(cabinetModules.cars)
  const intakeMutation = useLatestMutationGuard(cabinetModules.intakes)
  const [values, setValues] = useState(emptyPartForm)
  const [mediaItems, setMediaItems] = useState<PartMediaItem[]>([])
  const sourceOptions = useSourceOptions(
    canViewCars && values.sourceType === 'car',
    canViewIntakes && values.sourceType === 'batch',
  )
  const pendingRef = useRef(false)
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mediaPending = mediaItems.some((item) => item.status !== 'uploaded')
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (pendingRef.current || mediaPending) return
    const parsed = validFormNumbers(values)
    if (
      !values.name.trim() ||
      !parsed.valid ||
      (values.sourceType !== 'free' && !values.sourceId.trim())
    ) {
      setError('Перевірте обов’язкові поля та числові значення.')
      return
    }
    const unit = optional(values.unit)
    const condition = optional(values.condition)
    const notes = optional(values.notes)
    const oemCode = optional(values.oemCode)
    const partType = optional(values.partType)
    const carBrand = optional(values.carBrand)
    const carModel = optional(values.carModel)
    const request: CreatePartRequest = {
      sourceType: values.sourceType,
      ...(values.sourceType === 'car' ? { carId: values.sourceId.trim() } : {}),
      ...(values.sourceType === 'batch'
        ? { intakeId: values.sourceId.trim() }
        : {}),
      name: values.name.trim(),
      quantity: parsed.quantity,
      photoKeys: committedPhotoKeys(mediaItems),
      ...(unit !== undefined ? { unit } : {}),
      ...(condition !== undefined ? { condition } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(oemCode !== undefined ? { oemCode } : {}),
      ...(partType !== undefined ? { partType } : {}),
      ...(parsed.price !== undefined ? { desiredSalePrice: parsed.price } : {}),
      ...(carBrand !== undefined ? { carBrand } : {}),
      ...(carModel !== undefined ? { carModel } : {}),
      ...(parsed.year !== undefined ? { carYear: parsed.year } : {}),
    }
    pendingRef.current = true
    setPending(true)
    setStatus(null)
    setError(null)
    try {
      const scope = requireLatestMutation()
      if (request.sourceType === 'car')
        carMutation.requireLatestMutation({
          permission: 'cars.view',
          quota: false,
        })
      if (request.sourceType === 'batch')
        intakeMutation.requireLatestMutation({
          permission: 'intakes.view',
          quota: false,
        })
      await partsApi.create(request, { signal: scope.signal })
      setStatus('Деталь створено.')
    } catch {
      setError('Не вдалося створити деталь.')
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }
  return (
    <PageBody width="narrow">
      <PageHeader eyebrow="Склад · Деталі" title={title} />
      <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
        <PartFields
          canViewCars={canViewCars}
          canViewIntakes={canViewIntakes}
          setValues={setValues}
          sourceOptions={sourceOptions}
          values={values}
        />
        <PartMediaFields
          items={mediaItems}
          requireLatestMutation={requireLatestMutation}
          setItems={setMediaItems}
        />
        <div className="border-app-line rounded-panel bg-app-raised flex flex-wrap justify-end gap-2 border p-3">
          <Button
            aria-busy={pending || mediaPending}
            disabled={pending || mediaPending}
            type="submit"
            variant="primary"
          >
            Створити деталь
          </Button>
        </div>
      </form>
      {status ? <Notice tone="ok">{status}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <p className="text-app-dim text-[12.5px]">
        VIN та OEM-декодування недоступні: сервер не визначає операцію
        декодування.
      </p>
      <p className="text-app-dim text-[12.5px]">
        Сумісність недоступна для редагування
      </p>
    </PageBody>
  )
}

function PartEdit({
  partId,
  canViewCars,
  canViewIntakes,
  requireLatestMutation,
}: {
  partId: string
  canViewCars: boolean
  canViewIntakes: boolean
  requireLatestMutation: ReturnType<
    typeof useLatestMutationGuard
  >['requireLatestMutation']
}) {
  const [values, setValues] = useState<PartFormValues | null>(null)
  const [mediaItems, setMediaItems] = useState<PartMediaItem[]>([])
  const sourceOptions = useSourceOptions(
    canViewCars && values?.sourceType === 'car',
    canViewIntakes && values?.sourceType === 'batch',
  )
  const pendingRef = useRef(false)
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mediaPending = mediaItems.some((item) => item.status !== 'uploaded')
  useEffect(() => {
    const controller = new AbortController()
    void partsApi.get(partId, { signal: controller.signal }).then(
      (part) => {
        if (!part) {
          setError('Не вдалося завантажити деталь для редагування.')
          return
        }
        setValues({
          sourceType: part.source,
          sourceId: part.carId ?? part.intakeId ?? '',
          name: part.name,
          quantity: String(part.quantityTotal),
          unit: part.unit,
          condition: part.condition,
          notes: part.notes ?? '',
          oemCode: part.oemCode ?? '',
          partType: part.partType ?? '',
          desiredSalePrice:
            part.desiredSalePrice === null ? '' : String(part.desiredSalePrice),
          carBrand: '',
          carModel: '',
          carYear: '',
        })
        setMediaItems(
          (part.photos ?? []).map((photo, index) => ({
            id: `existing-media-${photo.id}`,
            name: `Існуюче фото ${index + 1}`,
            status: 'uploaded',
            existing: true,
            storageKey: photo.storageKey,
            url: photo.url,
          })),
        )
        setError(null)
      },
      () => {
        if (!controller.signal.aborted)
          setError('Не вдалося завантажити деталь для редагування.')
      },
    )
    return () => controller.abort()
  }, [partId])
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!values || pendingRef.current || mediaPending) return
    const parsed = validFormNumbers(values)
    if (!values.name.trim() || !parsed.valid) {
      setError('Перевірте обов’язкові поля та числові значення.')
      return
    }
    pendingRef.current = true
    setPending(true)
    setStatus(null)
    setError(null)
    try {
      const scope = requireLatestMutation({ quota: false })
      await partsApi.update(
        partId,
        {
          name: values.name.trim(),
          condition: optional(values.condition) ?? null,
          notes: optional(values.notes) ?? null,
          quantity: parsed.quantity,
          partType: optional(values.partType) ?? null,
          unit: optional(values.unit) ?? null,
          photoKeys: committedPhotoKeys(mediaItems),
          desiredSalePrice: {
            isSet: true,
            value: parsed.price ?? null,
          },
        },
        { signal: scope.signal },
      )
      setStatus('Зміни збережено.')
    } catch {
      setError('Не вдалося зберегти зміни.')
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }
  return (
    <PageBody width="narrow">
      <PageHeader eyebrow="Склад · Деталі" title="Редагувати деталь" />
      {values ? (
        <form className="grid gap-4" onSubmit={(event) => void save(event)}>
          <PartFields
            canViewCars={canViewCars}
            canViewIntakes={canViewIntakes}
            edit
            setValues={setValues}
            sourceOptions={sourceOptions}
            values={values}
          />
          <PartMediaFields
            items={mediaItems}
            requireLatestMutation={requireLatestMutation}
            setItems={setMediaItems}
          />
          <div className="border-app-line rounded-panel bg-app-raised flex flex-wrap justify-end gap-2 border p-3">
            <Button
              aria-busy={pending || mediaPending}
              disabled={pending || mediaPending}
              type="submit"
              variant="primary"
            >
              Зберегти зміни
            </Button>
          </div>
        </form>
      ) : !error ? (
        <p className="text-app-dim text-sm" role="status">
          Завантажуємо дані деталі…
        </p>
      ) : null}
      {status ? <Notice tone="ok">{status}</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <p className="text-app-dim text-[12.5px]">
        Сумісність недоступна для редагування
      </p>
      <p className="text-app-dim text-[12.5px]">
        Видалення деталі перевіряється сервером.
      </p>
    </PageBody>
  )
}
