import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router'
import { ChevronLeft, ExternalLink, Plus, Trash2 } from 'lucide-react'
import {
  ActionMenu,
  ActiveFilters,
  Amount,
  DateValue,
  FactRows,
  FileField,
  Gallery,
  Panel,
  Quantity,
  SectionPanel,
  SkeletonRows,
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
  TextArea,
  TextInput,
  Toolbar,
  type StatusTone,
} from '@/components/app'
import { cn, plural } from '@/lib/utils'
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
    inventory: allowedToView(cabinetModules.inventory, cabinet),
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

/**
 * Parts are priced in dollars, like the cars they are pulled off: the contract
 * sends bare numbers, so the currency is stated here until it carries one.
 */
const PART_CURRENCY = 'USD'

const conditionLabel = (value: string) =>
  ({
    new: 'Нова',
    used: 'Вживана',
    refurbished: 'Відновлена',
    damaged: 'Пошкоджена',
  })[value] ?? value

const sourceLabel = (value: string) =>
  ({ car: 'Авто', batch: 'Приймання', free: 'Без джерела' })[value] ?? value

/** Server event names, said the way a person would say them out loud. */
const historyLabel = (value: string) =>
  ({
    created: 'Створено',
    updated: 'Змінено',
    reserved: 'Зарезервовано',
    released: 'Резерв знято',
    sold: 'Продано',
    returned: 'Повернено',
    moved: 'Переміщено',
    deleted: 'Видалено',
  })[value] ?? value

/**
 * What a quantity is made of: free stock, stock promised to an order, and what
 * has already left. One number for the total hides the only question worth
 * asking — how much of it can still be sold.
 */
function QuantitySplit({
  available,
  reserved,
  sold,
  unit,
}: {
  available: number
  reserved: number
  sold: number
  unit: string | null
}) {
  const segments = [
    {
      key: 'available',
      label: 'Доступно',
      value: available,
      fill: 'bg-state-ok',
    },
    {
      key: 'reserved',
      label: 'У резерві',
      value: reserved,
      fill: 'bg-state-warn',
    },
    { key: 'sold', label: 'Продано', value: sold, fill: 'bg-app-line-2' },
  ]
  const scale = segments.reduce((sum, segment) => sum + segment.value, 0)

  return (
    <div className="grid gap-3">
      {scale > 0 ? (
        /* Decoration: the figures below carry the same split in text. */
        <span
          aria-hidden
          className="bg-app-input flex h-2 w-full overflow-hidden rounded-full"
        >
          {segments.map((segment) =>
            segment.value > 0 ? (
              <span
                className={cn('block h-full', segment.fill)}
                key={segment.key}
                style={{ width: `${String((segment.value / scale) * 100)}%` }}
              />
            ) : null,
          )}
        </span>
      ) : null}
      <dl className="grid grid-cols-3 gap-3">
        {segments.map((segment) => (
          <div className="grid gap-1" key={segment.key}>
            <dt className="text-app-dim flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.08em] uppercase">
              <span
                aria-hidden
                className={cn('size-1.5 rounded-full', segment.fill)}
              />
              {segment.label}
            </dt>
            <dd className="text-[22px] leading-none font-light tracking-[-0.02em] text-white">
              <Quantity unit={unit} value={segment.value} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** One order this part is promised to or was sold through. */
function OrderRow({
  number,
  href,
  detail,
  aside,
}: {
  number: number
  href: string | null
  detail: ReactNode
  aside?: ReactNode
}) {
  const label = `Замовлення ${String(number)}`
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        {href === null ? (
          <span className="text-sm font-medium text-white">{label}</span>
        ) : (
          <Link
            className="hover:text-brand text-sm font-medium text-white"
            to={href}
          >
            {label}
          </Link>
        )}
        <span className="text-app-dim text-[12.5px]">{detail}</span>
      </span>
      {aside === undefined ? null : (
        <span className="text-app-muted text-[12.5px] tabular-nums">
          {aside}
        </span>
      )}
    </div>
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
  links: {
    cars: boolean
    intakes: boolean
    orders: boolean
    inventory: boolean
  }
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

  const base = `/app/${tenantSlug}/parts`
  const orderHref = (id: string) =>
    links.orders ? `/app/${tenantSlug}/orders/${id}` : null
  const compat = detail
    ? [detail.compatCarBrand, detail.compatCarModel, detail.compatCarYear]
        .filter(Boolean)
        .join(' ')
    : ''
  const reservations = detail?.reservations ?? []
  const soldOrders = detail?.soldOrders ?? []
  const soldRevenue = soldOrders.reduce(
    (sum, order) => sum + order.quantitySold * order.unitPrice,
    0,
  )

  return (
    <PageBody className="max-w-6xl">
      <Button asChild className="justify-self-start" variant="quiet">
        <Link to={base}>
          <ChevronLeft aria-hidden />
          До складу
        </Link>
      </Button>
      <div className="grid gap-2">
        {detail ? (
          <StatusPill tone={statusPresentation(detail.status).tone}>
            {statusPresentation(detail.status).label}
          </StatusPill>
        ) : null}
        <PageHeader
          actions={
            <>
              {links.inventory ? (
                <Button asChild>
                  <Link to={`${base}/${partId}/inventory`}>
                    Розміщення на складі
                  </Link>
                </Button>
              ) : null}
              {canManage ? (
                <>
                  <Button asChild variant="primary">
                    <Link to={`${base}/${partId}/edit`}>Редагувати деталь</Link>
                  </Button>
                  <ActionMenu
                    actions={[
                      {
                        key: 'delete',
                        label: 'Видалити деталь',
                        icon: <Trash2 aria-hidden className="size-4" />,
                        destructive: true,
                        disabled: deleting,
                        onSelect: () => setConfirmingDelete(true),
                      },
                    ]}
                    label="Інші дії з деталлю"
                  />
                </>
              ) : null}
            </>
          }
          eyebrow="Склад · Деталі"
          title={detail === null ? 'Деталь' : detail.name}
        />
        {detail === null ? null : (
          /* What the part is, in the words someone would use to ask for it. */
          <p className="text-app-dim text-[12.5px]">
            {[
              detail.oemCode ? `OEM ${detail.oemCode}` : null,
              compat || null,
              conditionLabel(detail.condition),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </div>

      {deleteError !== null && !confirmingDelete ? (
        <Notice tone="danger">{deleteError}</Notice>
      ) : null}

      {error ? (
        <ErrorState
          description="Деталь не вдалося завантажити. Спробуйте ще раз."
          title="Не вдалося завантажити деталь"
        />
      ) : detail === null ? (
        <SkeletonRows columns={2} label="Завантажуємо деталь…" rows={4} />
      ) : (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div className="grid gap-4">
              <Panel>
                <FactRows
                  rows={[
                    { label: 'OEM', value: detail.oemCode ?? '—' },
                    { label: 'Тип', value: detail.partType ?? '—' },
                    { label: 'Стан', value: conditionLabel(detail.condition) },
                    {
                      label: 'Сумісність',
                      value: compat || 'не вказано',
                      action: (
                        <span className="text-app-dim text-[11.5px]">
                          Сумісність недоступна для редагування
                        </span>
                      ),
                    },
                    {
                      label: 'Джерело',
                      value:
                        detail.carId && detail.carCode && links.cars ? (
                          <Link
                            className="hover:text-brand"
                            to={`/app/${tenantSlug}/cars/${detail.carId}`}
                          >
                            {detail.carCode}
                          </Link>
                        ) : detail.intakeId && links.intakes ? (
                          <Link
                            className="hover:text-brand"
                            to={`/app/${tenantSlug}/intakes/${detail.intakeId}`}
                          >
                            Приймання
                          </Link>
                        ) : (
                          (detail.carCode ?? sourceLabel(detail.source))
                        ),
                    },
                    {
                      label: 'QR-код',
                      value: (
                        <span className="font-mono break-all">
                          {detail.qrCode || '—'}
                        </span>
                      ),
                    },
                    { label: 'Нотатки', value: detail.notes ?? '—' },
                    {
                      label: 'Створено',
                      value: (
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          {detail.createdByName}
                          <DateValue
                            className="text-app-dim text-[12.5px]"
                            value={detail.createdAt}
                          />
                        </span>
                      ),
                    },
                  ]}
                />
              </Panel>

              {detail.order || reservations.length > 0 ? (
                <SectionPanel
                  description="Скільки цієї деталі вже обіцяно покупцям."
                  title="Резерви"
                >
                  <div className="grid divide-y divide-[color:var(--color-app-line)]">
                    {detail.order ? (
                      <OrderRow
                        aside="поточне замовлення"
                        detail={
                          <>
                            {detail.order.customerName ?? 'без клієнта'} ·{' '}
                            {detail.order.status}
                          </>
                        }
                        href={orderHref(detail.order.id)}
                        number={detail.order.number}
                      />
                    ) : null}
                    {reservations.map((reservation) => (
                      <OrderRow
                        aside={
                          <Quantity
                            unit={detail.unit || null}
                            value={reservation.quantity}
                          />
                        }
                        detail={reservation.customerName ?? 'без клієнта'}
                        href={orderHref(reservation.orderId)}
                        key={reservation.orderId}
                        number={reservation.orderNumber}
                      />
                    ))}
                  </div>
                </SectionPanel>
              ) : null}

              {soldOrders.length > 0 ? (
                <SectionPanel
                  aside={
                    <>
                      Виручка{' '}
                      <Amount currency={PART_CURRENCY} value={soldRevenue} />
                    </>
                  }
                  title="Продажі"
                >
                  <div className="grid divide-y divide-[color:var(--color-app-line)]">
                    {soldOrders.map((order) => (
                      <OrderRow
                        aside={
                          <>
                            {order.quantitySold} ×{' '}
                            <Amount
                              currency={PART_CURRENCY}
                              value={order.unitPrice}
                            />
                          </>
                        }
                        detail={
                          <>
                            {order.customerName ?? 'без клієнта'}
                            {order.confirmedAt ? (
                              <>
                                {' · '}
                                <DateValue
                                  value={order.confirmedAt}
                                  withTime={false}
                                />
                              </>
                            ) : null}
                          </>
                        }
                        href={orderHref(order.orderId)}
                        key={order.orderId}
                        number={order.orderNumber}
                      />
                    ))}
                  </div>
                </SectionPanel>
              ) : null}
            </div>
            <div className="grid gap-4">
              <SectionPanel
                aside={`Усього ${String(detail.quantityTotal)} ${detail.unit || 'шт'}`}
                title="Наявність"
              >
                <QuantitySplit
                  available={detail.quantityAvailable}
                  reserved={detail.quantityReserved}
                  sold={detail.quantitySoldTotal}
                  unit={detail.unit || null}
                />
                <div className="border-app-line flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t pt-3">
                  <span className="text-app-muted text-[12.5px]">
                    Ціна продажу
                  </span>
                  <span className="grid justify-items-end gap-0.5">
                    <Amount
                      className="text-[17px] font-semibold text-white"
                      currency={PART_CURRENCY}
                      fallback="ціни ще немає"
                      value={detail.effectiveSalePrice}
                    />
                    {detail.desiredSalePrice !== null &&
                    detail.desiredSalePrice !== detail.effectiveSalePrice ? (
                      <span className="text-app-dim text-[11.5px]">
                        бажана{' '}
                        <Amount
                          currency={PART_CURRENCY}
                          value={detail.desiredSalePrice}
                        />
                      </span>
                    ) : null}
                  </span>
                </div>
              </SectionPanel>

              <SectionPanel
                aside={`${String(detail.photos.length)} ${plural(detail.photos.length, ['знімок', 'знімки', 'знімків'])}`}
                title="Фото"
              >
                <Gallery
                  emptyLabel="Фото цієї деталі ще немає — їх додають під час редагування."
                  label={`Фото деталі ${detail.name}`}
                  photos={detail.photos.map((photo, index) => ({
                    id: photo.id,
                    url: photo.url,
                    ...(photo.thumbnailUrl
                      ? { thumbnailUrl: photo.thumbnailUrl }
                      : {}),
                    alt: `Фото деталі ${detail.name} ${String(index + 1)}`,
                  }))}
                />
              </SectionPanel>
            </div>
          </div>

          <SectionPanel
            description="Кожна зміна кількості, ціни й розміщення, у порядку від найновішої."
            title="Історія"
          >
            {history === null ? (
              <SkeletonRows
                columns={1}
                label="Завантажуємо історію…"
                rows={3}
              />
            ) : history.events.length === 0 ? (
              <p className="text-app-dim text-[12.5px]">
                Подій ще немає — вони зʼявляться після першої зміни.
              </p>
            ) : (
              <ol className="grid">
                {history.events.map((event, index) => (
                  <li
                    className={cn(
                      'flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5',
                      index > 0 && 'border-app-line border-t',
                    )}
                    key={event.id}
                  >
                    <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-sm font-medium text-white">
                        {historyLabel(event.eventType)}
                      </span>
                      {event.data ? (
                        <span className="text-app-muted text-[12.5px] break-words">
                          {event.data}
                        </span>
                      ) : null}
                      {event.order ? (
                        <span className="text-[12.5px]">
                          {links.orders ? (
                            <Link
                              className="hover:text-brand text-app-muted"
                              to={`/app/${tenantSlug}/orders/${event.order.id}`}
                            >
                              Замовлення {event.order.number}
                            </Link>
                          ) : (
                            <span className="text-app-muted">
                              Замовлення {event.order.number}
                            </span>
                          )}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-app-dim flex flex-wrap items-baseline gap-x-2 text-[11.5px]">
                      {event.user.name}
                      <DateValue value={event.createdAt} />
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </SectionPanel>
        </>
      )}

      <ConfirmDialog
        confirmLabel="Видалити"
        consequence="Історія продажів, резерви та фото цієї деталі зникнуть назавжди. Сервер відхилить видалення, якщо деталь уже в замовленні."
        error={deleteError}
        onConfirm={() => void remove()}
        onOpenChange={setConfirmingDelete}
        open={confirmingDelete}
        pending={deleting}
        title="Видалити деталь?"
      />
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

const fileSizeLabel = (size: number) => {
  if (size < 1024) return `${String(size)} Б`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} КБ`
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`
}

const mediaMetaLabel = (item: PartMediaItem) =>
  item.file ? fileSizeLabel(item.file.size) : 'Збережене фото'

/** Section of a form: one heading, one purpose, one surface. */
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
  const failed = items.some(
    (item) => item.status === 'upload-error' || item.status === 'remove-error',
  )
  return (
    <SectionPanel
      description="Фото завантажуються одразу після вибору. Деталь можна зберегти, коли всі файли завантажені."
      title="Фото"
    >
      <Field
        hint="Формати зображень, кілька файлів за раз."
        label="Фото деталі"
      >
        <FileField
          accept="image/*"
          aria-label="Фото деталі"
          multiple
          onChange={(event) => {
            addFiles(event.currentTarget.files)
            event.currentTarget.value = ''
          }}
        />
      </Field>
      {failed ? (
        <Notice role="status" tone="warn">
          Частина фото не завантажилася. Повторіть завантаження або приберіть ці
          файли, щоб зберегти деталь.
        </Notice>
      ) : null}
      {items.length ? (
        <ul aria-label="Вибрані фото" className="grid gap-2">
          {items.map((item) => {
            const url = safeMediaUrl(item.url)
            return (
              <li
                className="border-app-line rounded-control flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border px-3 py-2"
                key={item.id}
              >
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-app-ink text-[13.5px] break-words">
                    {item.name} · {statusLabel(item)}
                  </p>
                  <p className="text-app-dim text-[11.5px]">
                    {mediaMetaLabel(item)}
                  </p>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {url ? (
                    <Button asChild variant="quiet">
                      <a className="min-w-0 max-w-full shrink" href={url}>
                        <ExternalLink aria-hidden />
                        <span className="truncate">{item.name}</span>
                      </a>
                    </Button>
                  ) : null}
                  {item.status === 'upload-error' ? (
                    <Button
                      aria-label={`Повторити ${item.name}`}
                      onClick={() => void upload(item)}
                    >
                      Повторити
                    </Button>
                  ) : null}
                  {item.status === 'remove-error' ? (
                    <Button
                      aria-label={`Повторити видалення ${item.name}`}
                      onClick={() => void remove(item)}
                    >
                      Повторити видалення
                    </Button>
                  ) : null}
                  {item.status !== 'uploading' && item.status !== 'removing' ? (
                    <Button
                      aria-label={`Прибрати ${item.name}`}
                      onClick={() => void remove(item)}
                      variant="danger"
                    >
                      Прибрати
                    </Button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-app-dim text-[12.5px]">
          Фото ще не вибрано. Додайте знімки — покупці бачать їх у картці
          деталі.
        </p>
      )}
    </SectionPanel>
  )
}

type PartFieldErrors = Partial<
  Record<
    'name' | 'quantity' | 'desiredSalePrice' | 'carYear' | 'sourceId',
    string
  >
>

function partFieldErrors(
  values: PartFormValues,
  { requireSource }: { requireSource: boolean },
): PartFieldErrors {
  const errors: PartFieldErrors = {}
  if (!values.name.trim())
    errors.name = 'Введіть назву деталі — за нею її знаходять на складі.'
  const quantity = Number(values.quantity)
  if (!Number.isInteger(quantity) || quantity <= 0)
    errors.quantity = 'Вкажіть ціле число від 1, наприклад 3.'
  const price = optionalNumber(values.desiredSalePrice)
  if (price !== undefined && (!Number.isFinite(price) || price < 0))
    errors.desiredSalePrice =
      'Вкажіть число від 0, наприклад 1250.50, або залиште поле порожнім.'
  const year = optionalNumber(values.carYear)
  if (year !== undefined && (!Number.isInteger(year) || year <= 0))
    errors.carYear =
      'Вкажіть рік чотирма цифрами, наприклад 2018, або залиште поле порожнім.'
  if (requireSource && !values.sourceId.trim())
    errors.sourceId =
      values.sourceType === 'car'
        ? 'Оберіть автомобіль зі списку.'
        : 'Оберіть приймання зі списку.'
  return errors
}

function PartFields({
  values,
  setValues,
  sourceOptions,
  canViewCars,
  canViewIntakes,
  errors,
  edit,
}: {
  values: PartFormValues
  setValues: (values: PartFormValues) => void
  sourceOptions: SourceOptions
  canViewCars: boolean
  canViewIntakes: boolean
  errors: PartFieldErrors
  edit?: boolean
}) {
  const field =
    (name: keyof PartFormValues) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setValues({ ...values, [name]: event.target.value })
  const showCompatibility = !edit && values.sourceType === 'free'
  return (
    <>
      <SectionPanel
        description="Звідки походить деталь. Після створення джерело не змінюється."
        title="Джерело"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            hint={
              edit
                ? 'Тип джерела задається під час створення деталі.'
                : 'Вільна деталь не прив’язана ні до авто, ні до приймання.'
            }
            label="Тип джерела"
          >
            <SelectInput
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
            </SelectInput>
          </Field>
          {values.sourceType === 'car' && canViewCars ? (
            <Field
              error={errors.sourceId}
              hint={
                edit
                  ? 'Автомобіль-джерело змінити не можна.'
                  : 'Деталь буде прив’язана до цього авто.'
              }
              label="Автомобіль-джерело"
              required={!edit}
            >
              <SelectInput
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
                !sourceOptions.cars.some(
                  (car) => car.id === values.sourceId,
                ) ? (
                  <option value={values.sourceId}>
                    Автомобіль недоступний у поточній вибірці
                  </option>
                ) : null}
              </SelectInput>
            </Field>
          ) : values.sourceType === 'batch' && canViewIntakes ? (
            <Field
              error={errors.sourceId}
              hint={
                edit
                  ? 'Приймання-джерело змінити не можна.'
                  : 'Деталь буде прив’язана до цього приймання.'
              }
              label="Приймання-джерело"
              required={!edit}
            >
              <SelectInput
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
              </SelectInput>
            </Field>
          ) : null}
        </div>
        {values.sourceType === 'car' && !canViewCars ? (
          <Notice role="status" tone="warn">
            Вибір автомобіля недоступний без права перегляду автомобілів.
            Попросіть власника кабінету відкрити доступ до автомобілів або
            оберіть інший тип джерела.
          </Notice>
        ) : null}
        {values.sourceType === 'batch' && !canViewIntakes ? (
          <Notice role="status" tone="warn">
            Вибір приймання недоступний без права перегляду приймань. Попросіть
            власника кабінету відкрити доступ до приймань або оберіть інший тип
            джерела.
          </Notice>
        ) : null}
        {values.sourceType === 'car' &&
        canViewCars &&
        sourceOptions.carsUnavailable ? (
          <Notice role="status" tone="warn">
            Вибір автомобіля недоступний: список не завантажено. Оновіть
            сторінку, щоб повторити запит.
          </Notice>
        ) : null}
        {values.sourceType === 'batch' &&
        canViewIntakes &&
        sourceOptions.intakesUnavailable ? (
          <Notice role="status" tone="warn">
            Вибір приймання недоступний: список не завантажено. Оновіть
            сторінку, щоб повторити запит.
          </Notice>
        ) : null}
      </SectionPanel>
      <SectionPanel
        description="Як деталь виглядає у списку складу та в пошуку."
        title="Опис деталі"
      >
        <Field error={errors.name} label="Назва" required>
          <TextInput
            aria-label="Назва"
            onChange={field('name')}
            value={values.name}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field hint="Наприклад: кузов, оптика, двигун" label="Тип деталі">
            <TextInput
              aria-label="Тип деталі"
              onChange={field('partType')}
              value={values.partType}
            />
          </Field>
          <Field
            hint={
              edit
                ? 'OEM-код не змінюється після створення.'
                : 'Каталожний номер виробника'
            }
            label="OEM-код"
          >
            <TextInput
              aria-label="OEM-код"
              disabled={edit}
              onChange={field('oemCode')}
              value={values.oemCode}
            />
          </Field>
        </div>
        <Field hint="Наприклад: б/в, після ремонту, нова" label="Стан">
          <TextInput
            aria-label="Стан"
            onChange={field('condition')}
            value={values.condition}
          />
        </Field>
        <Field hint="Дефекти, комплектність, місце зберігання" label="Нотатки">
          <TextArea
            aria-label="Нотатки"
            onChange={field('notes')}
            rows={3}
            value={values.notes}
          />
        </Field>
      </SectionPanel>
      <SectionPanel
        description="Скільки одиниць на складі та за скільки їх продавати."
        title="Кількість і ціна"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field error={errors.quantity} label="Кількість" required>
            <TextInput
              aria-label="Кількість"
              inputMode="numeric"
              min="1"
              onChange={field('quantity')}
              type="number"
              value={values.quantity}
            />
          </Field>
          <Field hint="Наприклад: шт, компл" label="Одиниця">
            <TextInput
              aria-label="Одиниця"
              onChange={field('unit')}
              value={values.unit}
            />
          </Field>
          <Field
            error={errors.desiredSalePrice}
            hint="У гривнях, можна залишити порожнім"
            label="Бажана ціна"
          >
            <TextInput
              aria-label="Бажана ціна"
              inputMode="decimal"
              min="0"
              onChange={field('desiredSalePrice')}
              step="0.01"
              type="number"
              value={values.desiredSalePrice}
            />
          </Field>
        </div>
      </SectionPanel>
      {showCompatibility ? (
        <SectionPanel
          description="До якого авто підходить деталь. Задається лише під час створення."
          title="Сумісність"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Марка сумісності">
              <TextInput
                aria-label="Марка сумісності"
                onChange={field('carBrand')}
                value={values.carBrand}
              />
            </Field>
            <Field label="Модель сумісності">
              <TextInput
                aria-label="Модель сумісності"
                onChange={field('carModel')}
                value={values.carModel}
              />
            </Field>
            <Field error={errors.carYear} label="Рік сумісності">
              <TextInput
                aria-label="Рік сумісності"
                inputMode="numeric"
                onChange={field('carYear')}
                type="number"
                value={values.carYear}
              />
            </Field>
          </div>
        </SectionPanel>
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
  const [showErrors, setShowErrors] = useState(false)
  const mediaPending = mediaItems.some((item) => item.status !== 'uploaded')
  const requireSource = values.sourceType !== 'free'
  const errors = showErrors ? partFieldErrors(values, { requireSource }) : {}
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (pendingRef.current || mediaPending) return
    const parsed = validFormNumbers(values)
    if (Object.keys(partFieldErrors(values, { requireSource })).length > 0) {
      setShowErrors(true)
      setStatus(null)
      setError('Деталь не створено: виправте позначені нижче поля.')
      return
    }
    setShowErrors(false)
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
      setError(
        'Не вдалося створити деталь. Перевірте зв’язок і надішліть форму ще раз.',
      )
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }
  return (
    <PageBody width="narrow">
      <PageHeader eyebrow="Склад · Деталі" title={title} />
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <PartFields
          canViewCars={canViewCars}
          canViewIntakes={canViewIntakes}
          errors={errors}
          setValues={setValues}
          sourceOptions={sourceOptions}
          values={values}
        />
        <PartMediaFields
          items={mediaItems}
          requireLatestMutation={requireLatestMutation}
          setItems={setMediaItems}
        />
        {status ? <Notice tone="ok">{status}</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="border-app-line rounded-panel bg-app-raised flex flex-wrap items-center justify-end gap-2 border p-3">
          {mediaPending ? (
            <p className="text-app-dim mr-auto text-[12.5px]">
              Дочекайтеся, доки завантажаться всі фото.
            </p>
          ) : null}
          <Button asChild>
            <Link to="..">Скасувати</Link>
          </Button>
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
      <div className="text-app-dim grid gap-1 text-[12.5px]">
        <p>
          VIN та OEM-декодування недоступні: сервер не визначає операцію
          декодування.
        </p>
        <p>Сумісність недоступна для редагування</p>
      </div>
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
  const [showErrors, setShowErrors] = useState(false)
  const mediaPending = mediaItems.some((item) => item.status !== 'uploaded')
  const errors =
    showErrors && values
      ? partFieldErrors(values, { requireSource: false })
      : {}
  useEffect(() => {
    const controller = new AbortController()
    void partsApi.get(partId, { signal: controller.signal }).then(
      (part) => {
        if (!part) {
          setError(
            'Не вдалося завантажити деталь для редагування. Оновіть сторінку або поверніться до списку.',
          )
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
          setError(
            'Не вдалося завантажити деталь для редагування. Оновіть сторінку або поверніться до списку.',
          )
      },
    )
    return () => controller.abort()
  }, [partId])
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!values || pendingRef.current || mediaPending) return
    const parsed = validFormNumbers(values)
    if (
      Object.keys(partFieldErrors(values, { requireSource: false })).length > 0
    ) {
      setShowErrors(true)
      setStatus(null)
      setError('Зміни не збережено: виправте позначені нижче поля.')
      return
    }
    setShowErrors(false)
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
      setError(
        'Не вдалося зберегти зміни. Перевірте зв’язок і надішліть форму ще раз.',
      )
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }
  return (
    <PageBody width="narrow">
      <PageHeader eyebrow="Склад · Деталі" title="Редагувати деталь" />
      {values ? (
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => void save(event)}
        >
          <PartFields
            canViewCars={canViewCars}
            canViewIntakes={canViewIntakes}
            edit
            errors={errors}
            setValues={setValues}
            sourceOptions={sourceOptions}
            values={values}
          />
          <PartMediaFields
            items={mediaItems}
            requireLatestMutation={requireLatestMutation}
            setItems={setMediaItems}
          />
          {status ? <Notice tone="ok">{status}</Notice> : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="border-app-line rounded-panel bg-app-raised flex flex-wrap items-center justify-end gap-2 border p-3">
            {mediaPending ? (
              <p className="text-app-dim mr-auto text-[12.5px]">
                Дочекайтеся, доки завантажаться всі фото.
              </p>
            ) : null}
            <Button asChild>
              <Link to="..">Скасувати</Link>
            </Button>
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
        <Notice role="status" tone="info">
          Завантажуємо дані деталі…
        </Notice>
      ) : null}
      {values ? null : error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="text-app-dim grid gap-1 text-[12.5px]">
        <p>Сумісність недоступна для редагування</p>
        <p>Видалення деталі перевіряється сервером.</p>
      </div>
    </PageBody>
  )
}
