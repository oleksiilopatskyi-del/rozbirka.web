import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Lock,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import {
  ActionMenu,
  Amount,
  DateValue,
  FileField,
  Gallery,
  Quantity,
  Card,
  SectionPanel,
  PillGroup,
  SkeletonRows,
  SpecGrid,
  SpecNote,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Notice,
  PageBody,
  PageHeader,
  SelectInput,
  StatusPill,
  TextArea,
  TextInput,
  type StatusTone,
} from '@/components/app'
import { cn, plural } from '@/lib/utils'
import {
  partsApi,
  type PartCondition,
  type PartFacets,
  type PartOrigin,
  type PartSearchItem,
  type PartSearchRequest,
  type CreatePartRequest,
  type PartDetail,
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
/** Every group the filter panel draws; the server counts each one for us. */
const FACET_DIMENSIONS = [
  'status',
  'condition',
  'origin',
  'make',
  'model',
  'warehouse',
  'zone',
] as const
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
  const [items, setItems] = useState<PartSearchItem[]>([])
  const [facets, setFacets] = useState<PartFacets | null>(null)
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
  const filters = useMemo(() => {
    const one = (name: string) => searchParams.get(name)?.trim() ?? ''
    const status = one('status')
    return {
      q: one('q'),
      status: partStatuses.has(status) ? status : '',
      condition: one('condition'),
      origin: one('origin'),
      makeId: one('make'),
      modelId: one('model'),
      warehouseId: one('warehouse'),
      zoneId: one('zone'),
      page: positiveInteger(searchParams.get('page'), 1),
      pageSize: pageSizeParam(searchParams.get('per_page'), 30),
      carIds: normalizedIds(searchParams.getAll('car_ids')),
      intakeIds: normalizedIds(searchParams.getAll('intake_ids')),
    }
  }, [searchParams])

  /** The screen's URL, said the way the search endpoint wants to hear it. */
  const searchRequest = useMemo<PartSearchRequest>(
    () => ({
      ...(filters.q ? { query: filters.q } : {}),
      ...(filters.status ? { statuses: [filters.status] } : {}),
      ...(filters.condition
        ? { conditions: [filters.condition as PartCondition] }
        : {}),
      ...(filters.origin
        ? { originTypes: [filters.origin as PartOrigin] }
        : {}),
      ...(filters.warehouseId ? { warehouseIds: [filters.warehouseId] } : {}),
      ...(filters.zoneId ? { zoneIds: [filters.zoneId] } : {}),
      ...(filters.carIds.length > 0 ? { carIds: filters.carIds } : {}),
      ...(filters.makeId || filters.modelId
        ? {
            compatibility: {
              ...(filters.makeId ? { makeIds: [filters.makeId] } : {}),
              ...(filters.modelId ? { modelIds: [filters.modelId] } : {}),
            },
          }
        : {}),
      page: filters.page,
      pageSize: filters.pageSize,
    }),
    [filters],
  )

  useEffect(() => {
    if (partId || isNew) return
    const next = new URLSearchParams(searchParams)
    for (const name of [
      'q',
      'condition',
      'origin',
      'make',
      'model',
      'warehouse',
      'zone',
    ] as const) {
      const raw = searchParams.get(name)
      if (raw === null) continue
      const trimmed = raw.trim()
      if (trimmed) next.set(name, trimmed)
      else next.delete(name)
    }
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
        partsApi.search(searchRequest, { signal: controller.signal }),
        partsApi.facets(searchRequest, FACET_DIMENSIONS, {
          signal: controller.signal,
        }),
        partsApi.summary({ signal: controller.signal }),
      ])
        .then(([page, nextFacets, nextSummary]) => {
          if (controller.signal.aborted) return
          setItems(page.items)
          setPageMeta({ page: page.page, totalPages: page.totalPages })
          setFacets(nextFacets)
          setSummary(nextSummary)
          setError(false)
        })
        .catch(() => {
          if (!controller.signal.aborted) setError(true)
        })
    }
    return () => controller.abort()
  }, [isEdit, isNew, partId, searchRequest])

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

  /** Counts arrive per dimension; a value with no row simply has none. */
  const facetCount = (dimension: keyof PartFacets, id: string) =>
    facets?.[dimension].find((value) => value.id === id)?.count
  const facetTotal = (dimension: keyof PartFacets) =>
    facets === null
      ? undefined
      : facets[dimension].reduce((sum, value) => sum + value.count, 0)
  const facetOptions = (dimension: keyof PartFacets) =>
    (facets?.[dimension] ?? []).map((value) => (
      <option key={value.id} value={value.id}>
        {value.name} ({value.count})
      </option>
    ))
  const statusTotal = facetTotal('statuses')

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
  /** Which filters are on, so the reset button knows whether it has work. */
  const activeFilters: string[] = (
    [
      ['q', filters.q],
      ['status', filters.status],
      ['condition', filters.condition],
      ['origin', filters.origin],
      ['make', filters.makeId],
      ['model', filters.modelId],
      ['warehouse', filters.warehouseId],
      ['zone', filters.zoneId],
    ] as const
  )
    .filter(([, value]) => value !== '')
    .map(([key]) => String(key))
    .concat(filters.carIds.length > 0 ? ['car_ids'] : [])
    .concat(filters.intakeIds.length > 0 ? ['intake_ids'] : [])

  return (
    <div className="type-redesign -mx-4 -mt-6 grid content-start sm:-mx-6 md:-mx-8 md:-mt-8 lg:-mx-10 lg:-mt-10">
      <div className="mx-auto grid w-full max-w-[1360px] gap-6 px-4 pt-8 pb-16 sm:px-6 md:px-8 md:pt-10 lg:px-12">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <p className="text-app-dim font-mono text-[11px] tracking-[0.14em] uppercase">
              Склад
            </p>
            <h1 className="mt-1.5 text-[38px] leading-[1.02] font-extrabold tracking-[-0.03em] text-white sm:text-[46px] lg:text-[54px]">
              Деталі
            </h1>
          </div>
          {createDecision.kind === 'allowed' ? (
            <Button
              asChild
              className="px-5 text-sm font-bold"
              variant="primary"
            >
              <Link to="new">
                <Plus aria-hidden />
                Додати деталь
              </Link>
            </Button>
          ) : null}
        </div>

        <span className="border-app-line bg-app-raised focus-within:border-app-line-2 flex h-13 items-center gap-3 rounded-[14px] border px-4">
          <Search aria-hidden className="text-app-dim size-4 shrink-0" />
          <input
            aria-label="Пошук деталей"
            className="text-app-ink placeholder:text-app-dim min-w-0 flex-1 bg-transparent text-sm outline-none"
            name="q"
            onChange={(event) => updateFilter('q', event.target.value)}
            placeholder="Пошук: назва, OEM або QR"
            value={filters.q ?? ''}
          />
        </span>

        <div className="flex flex-wrap items-start gap-6">
          <aside className="border-app-line bg-app-raised grid min-w-[260px] flex-[0_0_320px] gap-6 rounded-[20px] border p-5">
            <FilterGroup label="Статус">
              <FilterRow
                active={filters.status === ''}
                count={statusTotal}
                dot="bg-app-dim"
                label="Усі"
                onSelect={() => updateFilter('status', '')}
              />
              {[
                {
                  value: 'available',
                  label: 'В наявності',
                  dot: 'bg-state-ok',
                },
                { value: 'reserved', label: 'У резерві', dot: 'bg-state-warn' },
                { value: 'sold', label: 'Продано', dot: 'bg-app-line-2' },
              ].map((option) => (
                <FilterRow
                  active={filters.status === option.value}
                  count={facetCount('statuses', option.value)}
                  dot={option.dot}
                  key={option.value}
                  label={option.label}
                  onSelect={() => updateFilter('status', option.value)}
                />
              ))}
            </FilterGroup>

            <FilterGroup label="Сумісність">
              <SelectInput
                aria-label="Марка"
                name="make"
                onChange={(event) => {
                  const next = new URLSearchParams(searchParams)
                  if (event.target.value) next.set('make', event.target.value)
                  else next.delete('make')
                  next.delete('model')
                  next.delete('page')
                  setSearchParams(next)
                }}
                value={filters.makeId}
              >
                <option value="">Марка: будь-яка</option>
                {facetOptions('makes')}
              </SelectInput>
              <SelectInput
                aria-label="Модель"
                className={filters.makeId ? undefined : 'opacity-55'}
                disabled={!filters.makeId}
                name="model"
                onChange={(event) => updateFilter('model', event.target.value)}
                title={
                  filters.makeId
                    ? undefined
                    : 'Спершу оберіть марку автомобіля.'
                }
                value={filters.modelId}
              >
                <option value="">└ Модель: будь-яка</option>
                {facetOptions('models')}
              </SelectInput>
            </FilterGroup>

            <FilterGroup label="Розміщення">
              <SelectInput
                aria-label="Склад"
                name="warehouse"
                onChange={(event) => {
                  const next = new URLSearchParams(searchParams)
                  if (event.target.value)
                    next.set('warehouse', event.target.value)
                  else next.delete('warehouse')
                  next.delete('zone')
                  next.delete('page')
                  setSearchParams(next)
                }}
                value={filters.warehouseId}
              >
                <option value="">Склад: усі</option>
                {facetOptions('warehouses')}
              </SelectInput>
              <SelectInput
                aria-label="Зона"
                className={filters.warehouseId ? undefined : 'opacity-55'}
                disabled={!filters.warehouseId}
                name="zone"
                onChange={(event) => updateFilter('zone', event.target.value)}
                title={
                  filters.warehouseId ? undefined : 'Спершу оберіть склад.'
                }
                value={filters.zoneId}
              >
                <option value="">└ Зона: усі</option>
                {facetOptions('zones')}
              </SelectInput>
            </FilterGroup>

            <FilterGroup label="Стан деталі">
              <FilterRow
                active={filters.condition === ''}
                count={facetTotal('conditions')}
                dot="bg-transparent"
                label="Усі"
                onSelect={() => updateFilter('condition', '')}
              />
              {(facets?.conditions ?? []).map((value) => (
                <FilterRow
                  active={filters.condition === value.id}
                  count={value.count}
                  dot="bg-transparent"
                  key={value.id}
                  label={conditionLabel(value.name || value.id)}
                  onSelect={() => updateFilter('condition', value.id)}
                />
              ))}
            </FilterGroup>

            <FilterGroup label="Походження">
              <FilterRow
                active={filters.origin === ''}
                count={facetTotal('origins')}
                dot="bg-transparent"
                label="Усі"
                onSelect={() => updateFilter('origin', '')}
              />
              {(facets?.origins ?? []).map((value) => (
                <FilterRow
                  active={filters.origin === value.id}
                  count={value.count}
                  dot="bg-transparent"
                  key={value.id}
                  label={originLabel(value.id, value.name)}
                  onSelect={() => updateFilter('origin', value.id)}
                />
              ))}
            </FilterGroup>

            <Button
              className="w-full text-sm font-semibold"
              disabled={activeFilters.length === 0}
              onClick={() => setSearchParams(new URLSearchParams())}
            >
              Скинути фільтри
            </Button>
          </aside>

          <div className="grid min-w-[320px] flex-1 gap-4">
            <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
              <p className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <span className="text-app-muted flex items-baseline gap-2 text-sm">
                  <span className="text-[22px] font-bold text-white tabular-nums">
                    {summary?.total ?? 0}
                  </span>
                  усього
                </span>
                <span className="text-app-muted flex items-baseline gap-2 text-sm">
                  <span className="text-state-ok text-[22px] font-bold tabular-nums">
                    {summary?.available ?? 0}
                  </span>
                  доступно
                </span>
                <span className="text-app-muted flex items-baseline gap-2 text-sm">
                  <span className="text-state-warn text-[22px] font-bold tabular-nums">
                    {summary?.reserved ?? 0}
                  </span>
                  у резерві
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-app-dim font-mono text-[10px] tracking-[0.14em] uppercase">
                  Розмір сторінки
                </span>
                <PillGroup
                  label="Кількість деталей на сторінці"
                  onChange={(next) => updateFilter('per_page', next)}
                  options={[
                    { value: '30', label: '30' },
                    { value: '60', label: '60' },
                    { value: '100', label: '100' },
                  ]}
                  value={String(filters.pageSize)}
                />
              </div>
            </div>

            {error ? (
              <ErrorState
                description="Не вдалося завантажити склад. Дані на місці — потрібно лише повторити запит."
                onRetry={() =>
                  setSearchParams(new URLSearchParams(searchParams))
                }
                title="Склад не завантажився"
              />
            ) : (
              <div className="border-app-line bg-app-raised overflow-hidden rounded-[20px] border">
                <DataTable
                  caption="Деталі на складі"
                  columns={[
                    {
                      key: 'name',
                      label: 'Деталь',
                      variant: 'primary',
                      cell: (part) => (
                        <Link
                          className="hover:text-brand block font-semibold"
                          to={part.id}
                        >
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
                        const presentation = statusPresentation(
                          part.status ?? '',
                        )
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
                      <nav
                        aria-label="Пагінація деталей"
                        className="border-app-line flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4"
                      >
                        <p className="text-app-dim text-[13px]">
                          Сторінка {pageMeta.page} з {pageMeta.totalPages}
                        </p>
                        <span className="flex items-center gap-2.5">
                          <Button
                            aria-label="Попередня сторінка"
                            className="px-4 text-sm font-semibold"
                            disabled={pageMeta.page <= 1}
                            onClick={() => updatePage(pageMeta.page - 1)}
                          >
                            <ChevronLeft aria-hidden />
                            Назад
                          </Button>
                          <Button
                            aria-label="Наступна сторінка"
                            className="px-4 text-sm font-semibold"
                            disabled={pageMeta.page >= pageMeta.totalPages}
                            onClick={() => updatePage(pageMeta.page + 1)}
                          >
                            Далі
                            <ChevronRight aria-hidden />
                          </Button>
                        </span>
                      </nav>
                    ) : null
                  }
                  rowKey={(part) => part.id}
                  rows={items}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** A titled block of the filter rail. */
function FilterGroup({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <section aria-label={label} className="grid gap-2.5">
      <h2 className="text-app-dim font-mono text-[10px] tracking-[0.14em] uppercase">
        {label}
      </h2>
      {children}
    </section>
  )
}

/**
 * One value of a filter, with how many records carry it. The count is the
 * point: it says whether the click is worth making before it is made.
 */
function FilterRow({
  label,
  count,
  dot,
  active,
  disabled = false,
  hint,
  onSelect,
}: {
  label: string
  count?: number | undefined
  /** Colour class of the state this row stands for. */
  dot: string
  active: boolean
  /** The list endpoint cannot filter by this yet. */
  disabled?: boolean
  /** Said out loud by assistive technology when the row is out of reach. */
  hint?: string
  onSelect: () => void
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        'focus-visible:outline-brand flex min-h-10 w-full items-center justify-between gap-3 rounded-[10px] px-3 text-sm transition-colors',
        disabled
          ? 'text-app-dim cursor-not-allowed opacity-55'
          : active
            ? 'bg-app-input cursor-pointer font-semibold text-white'
            : 'text-app-muted hover:bg-white/[0.03] hover:text-app-ink cursor-pointer',
      )}
      disabled={disabled}
      onClick={onSelect}
      title={hint}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className={cn('size-1.5 shrink-0 rounded-full', dot)}
        />
        <span className="truncate">{label}</span>
      </span>
      {count === undefined ? null : (
        <span
          className={cn(
            'text-[13px] tabular-nums',
            active ? 'text-white' : 'text-app-dim',
          )}
        >
          {count}
        </span>
      )}
    </button>
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

const originLabel = (id: string, name: string) =>
  (({ car: 'З авто', batch: 'З партії', free: 'Вільна' })[id] ?? name) || id

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
    edited: 'Змінено',
    placed: 'Розміщено',
    unplaced: 'Знято з місця',
  })[value] ?? value

const historyFieldLabels: Record<string, string> = {
  quantity: 'кількість',
  price: 'ціна',
  unit_price: 'ціна',
  sale_price: 'ціна продажу',
  status: 'статус',
  name: 'назва',
  condition: 'стан',
  zone: 'зона',
  location: 'місце',
}

/**
 * History events carry their payload as a JSON string. Printed raw it puts
 * storage ids and braces on screen; this turns it into the two or three facts
 * a person actually reads, and says nothing when the payload is empty.
 *
 * Ids are dropped on purpose — the order is already a link on the same row.
 */
const historyDetails = (raw: string | null): string[] => {
  const trimmed = raw?.trim()
  if (!trimmed) return []
  if (!trimmed.startsWith('{')) return [trimmed]
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return [trimmed]
  }
  if (typeof parsed !== 'object' || parsed === null) return [trimmed]
  return Object.entries(parsed as Record<string, unknown>)
    .filter(
      ([key, value]) =>
        value !== null &&
        value !== '' &&
        typeof value !== 'object' &&
        !/(^|_)id$/.test(key) &&
        key !== 'order_number',
    )
    .map(
      ([key, value]) =>
        `${historyFieldLabels[key] ?? key.replaceAll('_', ' ')} ${String(value)}`,
    )
}

/** Two letters standing in for a person where a photo would be. */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '—'

/** The three states a quantity can be in, with the colour each one owns. */
const stockSegments = (available: number, reserved: number, sold: number) => [
  {
    key: 'available',
    label: 'Доступно',
    value: available,
    fill: 'bg-state-ok',
    ink: 'text-state-ok',
  },
  {
    key: 'reserved',
    label: 'У резерві',
    value: reserved,
    fill: 'bg-state-warn',
    ink: 'text-state-warn',
  },
  {
    key: 'sold',
    label: 'Продано',
    value: sold,
    fill: 'bg-app-line-2',
    ink: 'text-app-dim',
  },
]

/**
 * The stock figures beside the title, where they answer the question people
 * open a part for — how much of it can still be sold — before anything has to
 * be scrolled. Zero is greyed rather than hidden: a part with nothing reserved
 * and nothing sold should say so.
 */
function StockStats({
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
  return (
    <dl className="border-app-line bg-app-raised grid grid-cols-3 gap-x-8 gap-y-3 rounded-[16px] border px-7 py-5">
      {stockSegments(available, reserved, sold).map((segment) => (
        <div className="grid gap-2" key={segment.key}>
          <dt
            className={cn(
              'flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] whitespace-nowrap uppercase',
              segment.value > 0 ? segment.ink : 'text-app-dim',
            )}
          >
            <span
              aria-hidden
              className={cn('size-1.5 rounded-full', segment.fill)}
            />
            {segment.label}
          </dt>
          <dd
            className={cn(
              'flex items-baseline gap-1.5 text-[30px] leading-none font-bold tracking-[-0.02em] tabular-nums',
              segment.value > 0 ? 'text-white' : 'text-app-dim',
            )}
          >
            {segment.value}
            <span
              className={cn(
                'text-[15px] font-semibold',
                segment.value > 0 ? 'text-app-muted' : 'text-app-dim',
              )}
            >
              {unit ?? 'шт'}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The same split as a bar. Decoration on purpose: the figures above carry the
 * numbers, so this only has to show the proportion at a glance.
 */
function StockBar({
  available,
  reserved,
  sold,
}: {
  available: number
  reserved: number
  sold: number
}) {
  const segments = stockSegments(available, reserved, sold)
  const scale = segments.reduce((sum, segment) => sum + segment.value, 0)
  if (scale === 0) return null

  return (
    <span aria-hidden className="flex h-2 w-full gap-[3px]">
      {segments.map((segment) =>
        segment.value > 0 ? (
          <span
            className={cn('block h-full rounded-full', segment.fill)}
            key={segment.key}
            style={{ width: `${String((segment.value / scale) * 100)}%` }}
          />
        ) : null,
      )}
    </span>
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
  const allReservations = detail?.reservations ?? []
  const currentOrderId = detail?.order?.id
  const currentReservation = currentOrderId
    ? allReservations.find(
        (reservation) => reservation.orderId === currentOrderId,
      )
    : undefined
  const reservations = allReservations.filter(
    (reservation) => reservation.orderId !== currentOrderId,
  )
  const soldOrders = detail?.soldOrders ?? []
  const soldRevenue = soldOrders.reduce(
    (sum, order) => sum + order.quantitySold * order.unitPrice,
    0,
  )

  return (
    <div className="type-redesign -mx-4 -mt-6 grid content-start sm:-mx-6 md:-mx-8 md:-mt-8 lg:-mx-10 lg:-mt-10">
      <div className="border-app-line bg-app-canvas/80 sticky top-0 z-20 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b px-4 py-3 backdrop-blur-[14px] sm:px-6 md:px-8 lg:px-12">
        <div className="flex min-w-0 items-center gap-5">
          <Link
            className="border-app-line-2 text-app-muted hover:text-app-ink flex items-center gap-2 rounded-full border py-2 pr-3.5 pl-2.5 text-sm font-semibold hover:bg-white/[0.05]"
            to={base}
          >
            <ChevronLeft aria-hidden className="size-3.5" />
            До складу
          </Link>
          <p className="text-app-dim hidden items-center gap-2.5 font-mono text-[11px] tracking-[0.14em] uppercase sm:flex">
            <span>Склад</span>
            <span aria-hidden className="text-white/20">
              /
            </span>
            <span>Деталі</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {links.inventory ? (
            <Button asChild className="px-[18px] text-sm font-semibold">
              <Link to={`${base}/${partId}/inventory`}>
                Розміщення на складі
              </Link>
            </Button>
          ) : null}
          {canManage ? (
            <>
              <Button
                asChild
                className="px-5 text-sm font-bold"
                variant="primary"
              >
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
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-[1360px] gap-6 px-4 pt-8 pb-16 sm:px-6 md:px-8 md:pt-11 lg:px-12">
        {deleteError !== null && !confirmingDelete ? (
          <Notice tone="danger">{deleteError}</Notice>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
          <div className="min-w-0">
            {detail === null ? null : (
              <StatusPill tone={statusPresentation(detail.status).tone}>
                {statusPresentation(detail.status).label}
              </StatusPill>
            )}
            <h1 className="mt-4 text-[38px] leading-[1.02] font-extrabold tracking-[-0.03em] text-white sm:text-[46px] lg:text-[54px]">
              {detail === null ? 'Деталь' : detail.name}
            </h1>
            {detail === null ? null : (
              <p className="text-app-muted mt-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-2 text-sm font-medium">
                {detail.qrCode ? (
                  <span className="border-app-line bg-app-input text-app-ink rounded-[7px] border px-2.5 py-1 font-mono text-[13px]">
                    {detail.qrCode}
                  </span>
                ) : null}
                <span>Стан: {conditionLabel(detail.condition)}</span>
              </p>
            )}
          </div>
          {detail === null ? null : (
            <StockStats
              available={detail.quantityAvailable}
              reserved={detail.quantityReserved}
              sold={detail.quantitySoldTotal}
              unit={detail.unit || null}
            />
          )}
        </div>

        {error ? (
          <ErrorState
            description="Деталь не вдалося завантажити. Спробуйте ще раз."
            title="Не вдалося завантажити деталь"
          />
        ) : detail === null ? (
          <SkeletonRows columns={2} label="Завантажуємо деталь…" rows={4} />
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-start gap-6">
              <Card
                aside={
                  <span className="text-app-dim font-mono text-[11px] tracking-[0.1em] uppercase">
                    {detail.photos.length}{' '}
                    {plural(detail.photos.length, [
                      'знімок',
                      'знімки',
                      'знімків',
                    ])}
                  </span>
                }
                bodyClassName="p-0"
                className="min-w-[320px] flex-[1_1_620px]"
                headerClassName="pb-4"
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
                  variant="framed"
                />
              </Card>

              <div className="flex min-w-[320px] flex-[1_1_460px] flex-col gap-6">
                <Card
                  aside={
                    <span className="text-app-muted text-[13px] font-semibold">
                      Усього {detail.quantityTotal} {detail.unit || 'шт'}
                    </span>
                  }
                  title="Наявність"
                >
                  <StockBar
                    available={detail.quantityAvailable}
                    reserved={detail.quantityReserved}
                    sold={detail.quantitySoldTotal}
                  />
                  <div className="border-app-line mt-[22px] flex flex-wrap items-center justify-between gap-3 border-t pt-5">
                    <span className="text-app-muted text-sm font-semibold">
                      Ціна продажу
                    </span>
                    {detail.effectiveSalePrice === null ? (
                      <span className="flex flex-wrap items-center gap-2.5">
                        <span className="text-state-warn text-[15px] font-bold">
                          ціни ще немає
                        </span>
                        {canManage ? (
                          <Button
                            asChild
                            className="min-h-9 px-3 text-xs font-bold"
                          >
                            <Link to={`${base}/${partId}/edit`}>Додати</Link>
                          </Button>
                        ) : null}
                      </span>
                    ) : (
                      <span className="grid justify-items-end gap-0.5">
                        <Amount
                          className="text-[17px] font-bold text-white"
                          currency={PART_CURRENCY}
                          value={detail.effectiveSalePrice}
                        />
                        {detail.desiredSalePrice !== null &&
                        detail.desiredSalePrice !==
                          detail.effectiveSalePrice ? (
                          <span className="text-app-dim text-[11.5px]">
                            бажана{' '}
                            <Amount
                              currency={PART_CURRENCY}
                              value={detail.desiredSalePrice}
                            />
                          </span>
                        ) : null}
                      </span>
                    )}
                  </div>
                </Card>

                <Card title="Характеристики">
                  <SpecGrid
                    specs={[
                      { label: 'OEM', value: detail.oemCode ?? '—' },
                      { label: 'Тип', value: detail.partType ?? '—' },
                      {
                        label: 'Стан',
                        value: conditionLabel(detail.condition),
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
                        label: 'Сумісність',
                        value: compat || 'не вказано',
                        wide: true,
                        note: (
                          <SpecNote
                            icon={<Lock aria-hidden className="size-3" />}
                          >
                            Сумісність недоступна для редагування
                          </SpecNote>
                        ),
                      },
                      {
                        label: 'QR-код',
                        value: (
                          <span className="font-mono font-normal break-all">
                            {detail.qrCode || '—'}
                          </span>
                        ),
                        wide: true,
                      },
                      {
                        label: 'Нотатки',
                        value: (
                          <span className="text-app-ink font-normal">
                            {detail.notes ?? '—'}
                          </span>
                        ),
                        wide: true,
                      },
                    ]}
                  />
                  {detail.createdByName ? (
                    <div className="text-app-muted mt-[18px] flex flex-wrap items-center gap-3 text-[13px]">
                      <span
                        aria-hidden
                        className="text-app-ink grid size-[30px] place-items-center rounded-full bg-white/[0.07] text-[12px] font-bold"
                      >
                        {initials(detail.createdByName)}
                      </span>
                      <span>
                        Створено{' '}
                        <span className="text-app-ink font-semibold">
                          {detail.createdByName}
                        </span>{' '}
                        · <DateValue value={detail.createdAt} />
                      </span>
                    </div>
                  ) : null}
                </Card>

                {detail.order || reservations.length > 0 ? (
                  <Card title="Резерви">
                    <div className="divide-app-line grid divide-y">
                      {detail.order ? (
                        <OrderRow
                          aside={
                            <span className="flex flex-wrap items-baseline gap-2">
                              {currentReservation ? (
                                <Quantity
                                  unit={detail.unit || null}
                                  value={currentReservation.quantity}
                                />
                              ) : null}
                              <span className="text-app-dim">поточне</span>
                            </span>
                          }
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
                  </Card>
                ) : null}

                {soldOrders.length > 0 ? (
                  <Card
                    aside={
                      <span className="text-app-muted text-[13px] font-semibold">
                        Виручка{' '}
                        <Amount currency={PART_CURRENCY} value={soldRevenue} />
                      </span>
                    }
                    title="Продажі"
                  >
                    <div className="divide-app-line grid divide-y">
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
                  </Card>
                ) : null}
              </div>
            </div>

            <Card title="Історія">
              {history === null ? (
                <SkeletonRows
                  columns={1}
                  label="Завантажуємо історію…"
                  rows={3}
                />
              ) : history.events.length === 0 ? (
                <p className="text-app-dim text-[13px]">
                  Подій ще немає — вони зʼявляться після першої зміни.
                </p>
              ) : (
                <ol className="grid">
                  {history.events.map((event, index) => (
                    <li
                      className={cn(
                        'flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3',
                        index > 0 && 'border-app-line border-t',
                      )}
                      key={event.id}
                    >
                      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <span className="text-[15px] font-semibold text-white">
                          {historyLabel(event.eventType)}
                        </span>
                        {historyDetails(event.data).map((fact) => (
                          <span
                            className="text-app-muted text-[13px] break-words"
                            key={fact}
                          >
                            {fact}
                          </span>
                        ))}
                        {event.order ? (
                          <span className="text-[13px]">
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
                      <span className="text-app-dim flex flex-wrap items-baseline gap-x-2.5 text-[12px]">
                        {event.user.name}
                        <DateValue value={event.createdAt} />
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </>
        )}
      </div>

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
    </div>
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
