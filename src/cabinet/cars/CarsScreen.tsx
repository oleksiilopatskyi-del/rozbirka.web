import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router'
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Copy,
  CarFront,
  Search,
  ImagePlus,
  Pencil,
  Plus,
  Trash2,
  Wallet,
  Wrench,
} from 'lucide-react'
import { cn, plural } from '@/lib/utils'
import {
  ActionMenu,
  Amount,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  DateValue,
  FormDialog,
  Gallery,
  SectionPanel,
  EmptyState,
  Field,
  ErrorState,
  Notice,
  PageBody,
  PageHeader,
  PillGroup,
  SkeletonRows,
  SpecGrid,
  StatusPill,
  TextArea,
  TextInput,
  type StatusTone,
} from '@/components/app'
import {
  carsApi,
  type Car,
  type CarExpense,
  type CarListItem,
  type CarListParams,
  type CarPartListItem,
  type CreateCarRequest,
  type UpdateCarRequest,
  isCarStatus,
} from '@/api/cars'
import { normalizeApiProblem } from '@/api/errors'
import {
  mediaApi,
  type MediaEntityType,
  type MediaUploadResult,
} from '@/api/media'
import { useCabinet } from '../CabinetContext'
import type { Permission } from '../access-types'
import type { CabinetModuleScreenProps } from '../ModuleBoundary'
import {
  cabinetModules,
  type CabinetModuleDefinition,
} from '../module-registry'
import { evaluateModuleAccess } from '../policy'
import type { ModuleAccessDecision } from '../policy'
import { useLatestMutationGuard } from '../use-latest-mutation-guard'

/**
 * The shots that make a car card usable to someone who never saw the car. The
 * order is the upload order: photo N carries suggestion N, so the labels guide
 * without pretending the server stores a slot per shot.
 */
const CAR_SHOTS = [
  'Передня частина',
  'Задня чверть',
  'Бік',
  'Салон',
  'Дисплей',
  'Табличка VIN',
] as const

/**
 * Car economics are quoted in dollars: the dashboard contract names the same
 * figures `revenueUsd`, while only the till (`totalBalanceUah`) is hryvnia.
 * The car endpoints send bare numbers, so the currency lives here until the
 * contract carries one.
 */
const CAR_CURRENCY = 'USD'

const money = (value: number) =>
  new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    // A round headline sum reads as 10 380 $; only real cents earn decimals.
    trailingZeroDisplay: 'stripIfInteger',
  }).format(value)

/**
 * The same money with its cents kept. Used where the figure is a running total
 * of what people typed in — an expense sum of 0,00 $ says the field is empty
 * and waiting, where a bare 0 $ reads as a rounded-off headline.
 */
const moneyExact = (value: number) =>
  new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
/** Dates arrive as ISO strings; anything unparsable is shown as it came. */
const day = (value: string) => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium' }).format(parsed)
}
const partStatus = (status: string): { label: string; tone: StatusTone } => {
  if (status === 'available') return { label: 'Доступна', tone: 'ok' }
  if (status === 'reserved') return { label: 'У резерві', tone: 'warn' }
  if (status === 'sold') return { label: 'Продана', tone: 'neutral' }
  return { label: status, tone: 'neutral' }
}
const positiveInteger = (value: string | null, fallback: number) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
const pageSizeParam = (value: string | null, fallback: number) => {
  const parsed = positiveInteger(value, fallback)
  return parsed <= 100 ? parsed : fallback
}

function useAccess() {
  const cabinet = useCabinet()
  const access =
    cabinet.status === 'ready' && cabinet.snapshot
      ? { status: 'ready' as const, snapshot: cabinet.snapshot, error: null }
      : cabinet.status === 'error'
        ? { status: 'error' as const, snapshot: null, error: cabinet.error }
        : { status: 'loading' as const, snapshot: null, error: null }
  const decision = (
    definition: CabinetModuleDefinition,
    permission: Permission,
    quota: boolean,
  ): ModuleAccessDecision => {
    const { quotaResource, ...definitionWithoutQuota } = definition
    return evaluateModuleAccess(
      {
        ...definitionWithoutQuota,
        released: true,
        mutationPermission: permission,
        ...(quota && quotaResource !== undefined ? { quotaResource } : {}),
      },
      access,
      'mutation',
    )
  }
  const viewAllowed = (
    definition: CabinetModuleDefinition,
    permission: Permission,
  ) =>
    evaluateModuleAccess(
      { ...definition, released: true, viewPermission: permission },
      access,
      'view',
    ).kind === 'allowed'
  const carCreateDecision = decision(cabinetModules.cars, 'cars.manage', true)
  const financeManageDecision = decision(
    cabinetModules.cars,
    'finance.manage',
    false,
  )
  return {
    cabinet,
    createDecision:
      carCreateDecision.kind === 'allowed'
        ? financeManageDecision
        : carCreateDecision,
    manageDecision: decision(cabinetModules.cars, 'cars.manage', false),
    partsView: viewAllowed(cabinetModules.parts, 'parts.view'),
    financeView: viewAllowed(cabinetModules.cars, 'finance.view'),
    financeManage: financeManageDecision.kind === 'allowed',
  }
}

function Denied({ decision }: { decision: ModuleAccessDecision }) {
  const message =
    decision.kind === 'quota-exhausted'
      ? 'Ліміт автомобілів вичерпано.'
      : decision.kind === 'subscription-blocked'
        ? 'Поточна підписка не дозволяє цю дію.'
        : 'Недостатньо прав.'
  return (
    <Notice role="alert" tone="warn">
      {message}
    </Notice>
  )
}

export function CarsScreen(_props: Partial<CabinetModuleScreenProps> = {}) {
  const { cabinet, createDecision, manageDecision } = useAccess()
  const { tenant, carId } = useParams<{ tenant: string; carId: string }>()
  const location = useLocation()
  const base = `/app/${tenant ?? cabinet.targetTenant?.slug ?? ''}/cars`
  if (location.pathname.endsWith('/new') && createDecision.kind !== 'allowed')
    return <Denied decision={createDecision} />
  if (location.pathname.endsWith('/edit') && manageDecision.kind !== 'allowed')
    return <Denied decision={manageDecision} />
  if (location.pathname.endsWith('/new'))
    return <CarForm title="Новий автомобіль" />
  if (carId && location.pathname.endsWith('/edit'))
    return <CarForm carId={carId} title="Редагувати автомобіль" />
  return carId ? (
    <CarDetail base={base} carId={carId} />
  ) : (
    <CarsList base={base} />
  )
}

/** How the grid is ordered. The list endpoint has no sort yet, so this orders
 *  the page that came back — the control says «на цій сторінці» when there is
 *  more than one, rather than pretending it reordered the whole yard. */
type CarSort = 'payback' | 'parts'
const isCarSort = (value: string | null): value is CarSort =>
  value === 'payback' || value === 'parts'

const sortCars = (cars: readonly CarListItem[], sort: CarSort) =>
  [...cars].sort((left, right) =>
    sort === 'parts'
      ? right.partsCount - left.partsCount
      : (right.profitability?.recoupedPercent ?? -1) -
        (left.profitability?.recoupedPercent ?? -1),
  )

/** One car in the grid: what it looks like, what came back, how far it is. */
function CarCard({
  car,
  href,
  showMoney,
}: {
  car: CarListItem
  href: string
  showMoney: boolean
}) {
  const percent = car.profitability?.recoupedPercent ?? null
  const paidOff = percent !== null && percent >= 100

  return (
    <Link
      className="border-app-line bg-app-raised hover:border-app-line-2 flex flex-col overflow-hidden rounded-[20px] border transition-colors"
      to={href}
    >
      <span className="bg-app-input relative block aspect-4/3">
        {car.coverPhotoUrl ? (
          <img
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            src={car.coverPhotoUrl}
          />
        ) : (
          <span className="text-app-dim grid h-full place-items-center">
            <CarFront aria-hidden className="size-8" />
          </span>
        )}
        <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/65 px-2.5 py-1 text-[12px] font-semibold text-white backdrop-blur-sm">
          <span
            aria-hidden
            className={cn(
              'size-1.5 rounded-full',
              car.status === 'active' ? 'bg-state-ok' : 'bg-app-dim',
            )}
          />
          {car.status === 'active' ? 'Активний' : 'Архів'}
        </span>
        {showMoney && percent !== null ? (
          <span
            className={cn(
              'absolute top-3 right-3 rounded-full border border-white/10 bg-black/65 px-2.5 py-1 font-mono text-[12px] font-semibold tabular-nums backdrop-blur-sm',
              paidOff ? 'text-state-ok' : 'text-brand',
            )}
          >
            {percent}%
          </span>
        ) : null}
      </span>

      <span className="grid gap-2.5 p-4">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[17px] font-bold text-white">
            {car.code}
          </span>
          {showMoney ? (
            <span className="text-[17px] font-bold whitespace-nowrap text-white tabular-nums">
              {money(car.profitability?.recouped ?? 0)}
            </span>
          ) : null}
        </span>
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-app-muted truncate text-[13px]">
            {car.brand} {car.model} ({car.year})
          </span>
          {showMoney ? (
            <span className="text-app-dim font-mono text-[10px] tracking-[0.14em] whitespace-nowrap uppercase">
              Повернено
            </span>
          ) : null}
        </span>
        {showMoney ? (
          <span
            aria-hidden
            className="bg-app-input mt-0.5 block h-1 overflow-hidden rounded-full"
          >
            <span
              className={cn(
                'block h-full rounded-full',
                paidOff ? 'bg-state-ok' : 'bg-brand',
              )}
              style={{ width: `${String(Math.min(percent ?? 0, 100))}%` }}
            />
          </span>
        ) : null}
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-app-muted text-[13px]">
            Запчастин{' '}
            <span className="font-semibold text-white tabular-nums">
              {car.partsCount}
            </span>
          </span>
          <span className="text-app-muted text-[13px]">
            Продано{' '}
            <span className="font-semibold text-white tabular-nums">
              {car.soldPartsCount}
            </span>
          </span>
        </span>
      </span>
    </Link>
  )
}

function CarsList({ base }: { base: string }) {
  const { createDecision, financeView } = useAccess()
  const [params, setParams] = useSearchParams()
  const selected = useMemo<CarListParams>(
    () => ({
      search: params.get('search') ?? undefined,
      status: isCarStatus(params.get('status'))
        ? (params.get('status') as CarListParams['status'])
        : undefined,
      page: positiveInteger(params.get('page'), 1),
      pageSize: pageSizeParam(params.get('pageSize'), 20),
    }),
    [params],
  )
  const sort: CarSort = isCarSort(params.get('sort'))
    ? (params.get('sort') as CarSort)
    : 'payback'
  const [query, setQuery] = useState(params.get('search') ?? '')
  const [data, setData] = useState<Awaited<
    ReturnType<typeof carsApi.list>
  > | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void carsApi.list(selected, { signal: controller.signal }).then(
      (page) => {
        setData(page)
        setProblem(null)
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setProblem(normalizeApiProblem(error).message)
      },
    )
    return () => controller.abort()
  }, [selected])
  const change = (values: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    )
    setParams(next)
  }
  const page = data?.page ?? selected.page ?? 1
  const totalPages = data?.totalPages ?? 1
  const cars = sortCars(data?.items ?? [], sort)

  return (
    <div className="type-redesign -mx-4 -mt-6 grid content-start sm:-mx-6 md:-mx-8 md:-mt-8 lg:-mx-10 lg:-mt-10">
      <div className="mx-auto grid w-full max-w-[1360px] gap-6 px-4 pt-8 pb-16 sm:px-6 md:px-8 md:pt-10 lg:px-12">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <p className="text-app-dim font-mono text-[11px] tracking-[0.14em] uppercase">
              Склад
            </p>
            <h1 className="mt-1.5 text-[38px] leading-[1.02] font-extrabold tracking-[-0.03em] text-white sm:text-[46px] lg:text-[54px]">
              Автомобілі
            </h1>
          </div>
          {createDecision.kind === 'allowed' ? (
            <Button
              asChild
              className="px-5 text-sm font-bold"
              variant="primary"
            >
              <Link to={`${base}/new`}>
                <Plus aria-hidden />
                Додати автомобіль
              </Link>
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form
            className="min-w-[240px] flex-1"
            onSubmit={(event) => {
              event.preventDefault()
              change({ search: query.trim() || undefined, page: '1' })
            }}
          >
            <span className="border-app-line bg-app-raised focus-within:border-app-line-2 flex h-13 items-center gap-3 rounded-[14px] border px-4">
              <Search aria-hidden className="text-app-dim size-4 shrink-0" />
              <input
                aria-label="Пошук автомобілів"
                className="text-app-ink placeholder:text-app-dim min-w-0 flex-1 bg-transparent text-sm outline-none"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Пошук автомобілів"
                value={query}
              />
              <button className="sr-only" type="submit">
                Шукати
              </button>
            </span>
          </form>
          <PillGroup
            label="Статус автомобілів"
            onChange={(next) =>
              change({ status: next || undefined, page: '1' })
            }
            options={[
              { value: '', label: 'Усі' },
              { value: 'active', label: 'Активні' },
              { value: 'archived', label: 'Архів' },
            ]}
            value={selected.status ?? ''}
          />
          {financeView ? (
            <PillGroup
              label={
                totalPages > 1
                  ? 'Порядок карток на цій сторінці'
                  : 'Порядок карток'
              }
              onChange={(next) => change({ sort: next })}
              options={[
                { value: 'payback', label: 'Окупність' },
                { value: 'parts', label: 'Запчастини' },
              ]}
              value={sort}
            />
          ) : null}
        </div>

        {problem ? <Notice tone="danger">{problem}</Notice> : null}

        <p className="text-app-muted text-sm">
          <span className="text-[17px] font-bold text-white tabular-nums">
            {data?.total ?? 0}
          </span>{' '}
          знайдено
        </p>

        {cars.length === 0 ? (
          <EmptyState
            description="Додайте перше авто — після розбирання його деталі потраплять на склад."
            title="Автомобілів поки немає"
          />
        ) : (
          <ul
            aria-label="Список автомобілів"
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {cars.map((car) => (
              <li className="grid" key={car.id}>
                <CarCard
                  car={car}
                  href={`${base}/${car.id}`}
                  showMoney={financeView}
                />
              </li>
            ))}
          </ul>
        )}

        <nav
          aria-label="Пагінація автомобілів"
          className="border-app-line flex flex-wrap items-center justify-between gap-3 border-t pt-5"
        >
          <p className="text-app-dim text-[13px]">
            Сторінка {page} з {totalPages}
          </p>
          <span className="flex items-center gap-2.5">
            <Button
              aria-label="Попередня сторінка"
              className="px-4 text-sm font-semibold"
              disabled={page <= 1}
              onClick={() => change({ page: String(page - 1) })}
            >
              <ChevronLeft aria-hidden />
              Назад
            </Button>
            <Button
              aria-label="Наступна сторінка"
              className="px-4 text-sm font-semibold"
              disabled={page >= totalPages}
              onClick={() => change({ page: String(page + 1) })}
            >
              Далі
              <ChevronRight aria-hidden />
            </Button>
          </span>
        </nav>
      </div>
    </div>
  )
}

/**
 * Common colour names to a swatch. Unknown names get a neutral chip rather
 * than a guess — a wrong colour dot is worse than none.
 */
const carColors: Record<string, string> = {
  blue: '#3b6fd4',
  black: '#1c1c1e',
  white: '#e9e7e4',
  silver: '#b9b7b4',
  grey: '#7c7a77',
  gray: '#7c7a77',
  red: '#c8443c',
  green: '#3f9a63',
  yellow: '#d7b13a',
  orange: '#d9762f',
  brown: '#7a5a3c',
  beige: '#cbbfa6',
  синій: '#3b6fd4',
  чорний: '#1c1c1e',
  білий: '#e9e7e4',
  сірий: '#7c7a77',
  червоний: '#c8443c',
  зелений: '#3f9a63',
  жовтий: '#d7b13a',
  срібний: '#b9b7b4',
}
const colorSwatch = (value: string) =>
  carColors[value.trim().toLowerCase()] ?? 'var(--color-app-line-2)'

/**
 * Payback against the money that went in. The track is the investment, and
 * what came back fills it; anything past it is drawn beyond the limit line in
 * green, so a car that made money never looks the same as one that broke even.
 *
 * Both figures are written on the bar — colour alone says nothing.
 */
function PayoffBar({
  invested,
  recouped,
  investedLabel,
  excessLabel,
  className,
}: {
  invested: number
  recouped: number
  /** Sits inside the track: what the full bar is worth. */
  investedLabel: string
  /** Sits in the green tail when the car is past its investment. */
  excessLabel: string | null
  className?: string
}) {
  if (invested <= 0) return null
  const percent = Math.round((recouped / invested) * 100)
  const scale = Math.max(percent, 100)
  const base = (Math.min(percent, 100) / scale) * 100
  const excess = (Math.max(0, percent - 100) / scale) * 100

  return (
    <div
      aria-label={`Окупність ${String(percent)}%`}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent}
      aria-valuetext={`${String(percent)}%`}
      className={cn(
        'bg-app-input border-app-line flex h-11 items-stretch overflow-hidden rounded-[12px] border',
        className,
      )}
      role="progressbar"
    >
      <span
        className="relative flex min-w-0 items-center px-4"
        style={{ width: `${String(base)}%` }}
      >
        <span aria-hidden className="bg-app-line-2/40 absolute inset-0 block" />
        <span className="text-app-muted relative truncate font-mono text-[11px] tracking-[0.08em] uppercase">
          {investedLabel}
        </span>
      </span>
      {excess > 0 ? (
        <span
          className="bg-state-ok/90 flex shrink-0 items-center justify-center px-3"
          style={{ width: `max(${String(excess)}%, 6.75rem)` }}
        >
          {excessLabel === null ? null : (
            <span className="truncate font-mono text-[11px] font-semibold tracking-[0.08em] text-black">
              {excessLabel}
            </span>
          )}
        </span>
      ) : null}
    </div>
  )
}

function CarDetail({ base, carId }: { base: string; carId: string }) {
  const { manageDecision, partsView, financeView, financeManage } = useAccess()
  const manage = manageDecision.kind === 'allowed'
  const navigate = useNavigate()
  const [car, setCar] = useState<Car | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingAction, setPendingAction] = useState<
    'archive' | 'delete' | null
  >(null)
  const { requireLatestMutation } = useLatestMutationGuard(cabinetModules.cars)
  const load = async () => {
    try {
      setCar(await carsApi.get(carId))
      setProblem(null)
    } catch (error: unknown) {
      setProblem(normalizeApiProblem(error).message)
    }
  }
  useEffect(() => {
    const controller = new AbortController()
    void carsApi.get(carId).then(
      (value) => {
        if (!controller.signal.aborted) setCar(value)
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setProblem(normalizeApiProblem(error).message)
      },
    )
    return () => controller.abort()
  }, [carId])
  const lifecycle = async (action: 'archive' | 'delete') => {
    if (busy) return
    setPendingAction(null)
    setBusy(true)
    try {
      const scope = requireLatestMutation({ quota: false })
      if (action === 'archive')
        await carsApi.archive(carId, { signal: scope.signal })
      else await carsApi.remove(carId, { signal: scope.signal })
      void navigate(base)
    } catch (error: unknown) {
      setProblem(normalizeApiProblem(error).message)
      setBusy(false)
    }
  }
  const copyVin = async (vin: string) => {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(vin)
      setCopyStatus('VIN скопійовано.')
    } catch {
      setProblem('Не вдалося скопіювати VIN.')
    }
  }
  if (!car)
    return problem ? (
      <PageBody width="narrow">
        <ErrorState
          description={problem}
          onRetry={() => void load()}
          title="Не вдалося завантажити автомобіль"
        />
      </PageBody>
    ) : (
      <PageBody width="narrow">
        <SkeletonRows label="Завантажуємо автомобіль…" rows={4} />
      </PageBody>
    )
  const profit = car.profitability
  const paidOff =
    profit !== null && profit !== undefined && profit.remaining <= 0
  // What "invested" is made of, so the figure is not a number to take on trust.
  const expensesTotal = (car.expenses ?? []).reduce(
    (sum, expense) => sum + expense.amount,
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
            До автомобілів
          </Link>
          <p className="text-app-dim hidden items-center gap-2.5 font-mono text-[11px] tracking-[0.14em] uppercase sm:flex">
            <span>Склад</span>
            <span aria-hidden className="text-white/20">
              /
            </span>
            <span>Автомобілі</span>
          </p>
        </div>
        {manage ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              asChild
              className="px-5 text-sm font-bold"
              variant="primary"
            >
              <Link to={`${base}/${car.id}/edit`}>Редагувати автомобіль</Link>
            </Button>
            <ActionMenu
              actions={[
                {
                  key: 'archive',
                  label: 'Архівувати',
                  icon: <Archive aria-hidden className="size-4" />,
                  disabled: busy,
                  onSelect: () => setPendingAction('archive'),
                },
                {
                  key: 'delete',
                  label: 'Видалити',
                  icon: <Trash2 aria-hidden className="size-4" />,
                  destructive: true,
                  disabled: busy,
                  onSelect: () => setPendingAction('delete'),
                },
              ]}
              label="Інші дії з автомобілем"
            />
          </div>
        ) : null}
      </div>

      <div className="mx-auto grid w-full max-w-[1360px] gap-6 px-4 pt-8 pb-16 sm:px-6 md:px-8 md:pt-11 lg:px-12">
        {problem ? <Notice tone="danger">{problem}</Notice> : null}
        {copyStatus ? <Notice tone="ok">{copyStatus}</Notice> : null}

        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
          <div className="min-w-0 flex-1">
            <StatusPill tone={car.status === 'active' ? 'ok' : 'neutral'}>
              {car.status === 'active' ? 'Активний' : 'Архівний'}
            </StatusPill>
            <h1 className="mt-4 text-[38px] leading-[1.02] font-extrabold tracking-[-0.03em] text-white sm:text-[46px] lg:text-[54px]">
              {car.code} · {car.brand} {car.model}
            </h1>
            <div className="text-app-muted mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-medium">
              {car.vin ? (
                <>
                  <span className="border-app-line bg-app-input text-app-ink rounded-[7px] border px-2.5 py-1 font-mono text-[13px]">
                    {car.vin}
                  </span>
                  <Button
                    className="min-h-9 px-3 text-[13px] font-semibold"
                    onClick={() => {
                      void copyVin(car.vin ?? '')
                    }}
                  >
                    <Copy aria-hidden />
                    Копіювати VIN
                  </Button>
                </>
              ) : null}
              <span>
                {car.year}
                {car.color ? ` · ${car.color}` : ''}
              </span>
            </div>
          </div>
          {financeView && profit ? (
            <dl className="border-app-line bg-app-raised grid shrink-0 grid-cols-3 gap-x-8 gap-y-3 rounded-[16px] border px-7 py-5">
              {[
                {
                  key: 'invested',
                  label: 'Інвестовано',
                  value: money(profit.invested),
                  tone: 'text-white',
                },
                {
                  key: 'recouped',
                  label: 'Повернено',
                  value: money(profit.recouped),
                  tone: 'text-white',
                },
                {
                  key: 'result',
                  label: paidOff ? 'Прибуток' : 'Лишилось',
                  value: paidOff
                    ? `+${money(-profit.remaining)}`
                    : money(profit.remaining),
                  tone: paidOff ? 'text-state-ok' : 'text-white',
                },
              ].map((stat) => (
                <div className="grid gap-2" key={stat.key}>
                  <dt
                    className={cn(
                      'font-mono text-[10px] tracking-[0.14em] whitespace-nowrap uppercase',
                      stat.key === 'result' && paidOff
                        ? 'text-state-ok'
                        : 'text-app-dim',
                    )}
                  >
                    {stat.label}
                  </dt>
                  <dd
                    className={cn(
                      'text-[30px] leading-none font-bold tracking-[-0.02em] whitespace-nowrap tabular-nums',
                      stat.tone,
                    )}
                  >
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-start gap-6">
          <Card
            aside={
              <span className="text-app-dim font-mono text-[11px] tracking-[0.1em] uppercase">
                {car.photos.length}{' '}
                {plural(car.photos.length, ['знімок', 'знімки', 'знімків'])}
              </span>
            }
            bodyClassName="p-0"
            className="min-w-[320px] flex-[1_1_620px]"
            headerClassName="pb-4"
            title="Фото"
          >
            <Gallery
              emptyLabel={
                <span className="grid gap-1">
                  <span>Фото цього авто ще немає.</span>
                  <span>
                    Радимо зняти{' '}
                    {CAR_SHOTS.slice(0, 3).join(', ').toLowerCase()} — і додати
                    їх у редагуванні автомобіля.
                  </span>
                </span>
              }
              label={`Фото автомобіля ${car.code}`}
              photos={car.photos.map((photo, index) => ({
                id: photo.id,
                url: photo.url,
                ...(photo.thumbnailUrl
                  ? { thumbnailUrl: photo.thumbnailUrl }
                  : {}),
                alt: `${CAR_SHOTS[index] ?? `Знімок ${String(index + 1)}`} — фото автомобіля ${car.code}`,
              }))}
              variant="framed"
            />
          </Card>

          <div className="flex min-w-[320px] flex-[1_1_460px] flex-col gap-6">
            {financeView && profit ? (
              <Card
                aside={
                  <span className="text-app-muted text-[13px] font-semibold">
                    {profit.partsTotal}{' '}
                    {plural(profit.partsTotal, [
                      'запчастина',
                      'запчастини',
                      'запчастин',
                    ])}{' '}
                    · {profit.partsSold}{' '}
                    {plural(profit.partsSold, [
                      'продана',
                      'продані',
                      'продано',
                    ])}
                  </span>
                }
                title="Прибутковість авто"
              >
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-0.5">
                  <p className="flex items-baseline text-[46px] leading-none font-extrabold tracking-[-0.03em] text-white tabular-nums">
                    {profit.recoupedPercent ?? 0}
                    <span className="text-app-muted text-[22px] font-bold">
                      %
                    </span>
                  </p>
                  <p className="text-app-muted grid text-[13px]">
                    <span className="font-semibold">окупності</span>
                    <span className="text-app-dim">
                      Повернення проти вкладеного
                    </span>
                  </p>
                </div>

                <PayoffBar
                  className="mt-[18px]"
                  excessLabel={paidOff ? `+${money(-profit.remaining)}` : null}
                  investedLabel={`Вкладено ${money(profit.invested)}`}
                  invested={profit.invested}
                  recouped={profit.recouped}
                />

                <p
                  className={cn(
                    'mt-2.5 text-[13px] font-semibold',
                    paidOff ? 'text-state-ok' : 'text-app-muted',
                  )}
                >
                  {paidOff
                    ? `окупилось, і ще ${moneyExact(-profit.remaining)} понад вкладене`
                    : `лишилось повернути ${moneyExact(profit.remaining)}`}
                </p>

                <dl className="border-app-line mt-[22px] grid grid-cols-3 gap-x-6 gap-y-3 border-t pt-5">
                  {[
                    {
                      key: 'sold',
                      label: 'Продано',
                      value: `${String(profit.partsSold)} ${plural(profit.partsSold, ['позиція', 'позиції', 'позицій'])}`,
                      muted: profit.partsSold === 0,
                    },
                    {
                      key: 'stock',
                      label: 'На складі',
                      value: `${String(profit.partsAvailable)} ${plural(profit.partsAvailable, ['позиція', 'позиції', 'позицій'])}`,
                      muted: profit.partsAvailable === 0,
                    },
                    {
                      key: 'expenses',
                      label: 'Витрати',
                      value: moneyExact(expensesTotal),
                      muted: expensesTotal === 0,
                    },
                  ].map((stat) => (
                    <div className="grid gap-1.5" key={stat.key}>
                      <dt className="text-app-dim font-mono text-[10px] tracking-[0.14em] uppercase">
                        {stat.label}
                      </dt>
                      <dd
                        className={cn(
                          'text-[15px] font-semibold tabular-nums',
                          stat.muted ? 'text-app-dim' : 'text-white',
                        )}
                      >
                        {stat.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Card>
            ) : null}

            <Card title="Характеристики">
              <SpecGrid
                specs={[
                  { label: 'Рік', value: String(car.year) },
                  {
                    label: 'Колір',
                    value: car.color ? (
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="border-app-line-2 size-2.5 rounded-full border"
                          style={{ background: colorSwatch(car.color) }}
                        />
                        {car.color}
                      </span>
                    ) : (
                      'не вказано'
                    ),
                  },
                  {
                    label: 'Дата придбання',
                    value: (
                      <DateValue value={car.acquiredAt} withTime={false} />
                    ),
                  },
                  ...(financeView
                    ? [
                        {
                          label: 'Ціна придбання',
                          value: (
                            <Amount
                              currency={CAR_CURRENCY}
                              value={car.purchasePrice}
                            />
                          ),
                        },
                      ]
                    : []),
                  {
                    label: 'VIN',
                    value: (
                      <span className="font-mono font-normal break-all">
                        {car.vin ?? 'не вказано'}
                      </span>
                    ),
                    wide: true,
                  },
                  {
                    label: 'Нотатки',
                    value: (
                      <span className="text-app-ink font-normal">
                        {car.notes ?? 'немає'}
                      </span>
                    ),
                    wide: true,
                  },
                ]}
              />
            </Card>

            {financeView ? (
              <Expenses
                car={car}
                canManage={financeManage}
                onChanged={load}
                onProblem={setProblem}
              />
            ) : null}
          </div>
        </div>

        {partsView ? (
          <CarParts
            carId={car.id}
            partsHref={`${base.replace(/\/cars$/, '/parts')}?car_ids=${car.id}`}
          />
        ) : null}
      </div>

      <ConfirmDialog
        confirmLabel={pendingAction === 'archive' ? 'Архівувати' : 'Видалити'}
        consequence={
          pendingAction === 'archive'
            ? 'Автомобіль зникне з активного списку. Його деталі лишаться на складі.'
            : 'Автомобіль, його витрати та звʼязок із деталями зникнуть назавжди.'
        }
        destructive={pendingAction === 'delete'}
        onConfirm={() => void lifecycle(pendingAction ?? 'archive')}
        onOpenChange={(open) => setPendingAction(open ? pendingAction : null)}
        open={pendingAction !== null}
        pending={busy}
        title={
          pendingAction === 'archive'
            ? 'Архівувати автомобіль?'
            : 'Видалити автомобіль?'
        }
      />
    </div>
  )
}

function Expenses({
  car,
  canManage,
  onChanged,
  onProblem,
}: {
  car: Car
  canManage: boolean
  onChanged: () => Promise<void>
  onProblem: (message: string) => void
}) {
  const { requireLatestMutation } = useLatestMutationGuard(cabinetModules.cars)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [editing, setEditing] = useState<CarExpense | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<CarExpense | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const create = async (event: FormEvent) => {
    event.preventDefault()
    const value = Number(amount)
    if (!canManage || busy) return
    if (!name.trim()) {
      setFormError('Впишіть назву витрати — наприклад, «Транспортування».')
      return
    }
    if (!Number.isFinite(value) || value <= 0) {
      setFormError('Сума має бути числом більшим за нуль — наприклад, 500.')
      return
    }
    setFormError(null)
    setBusy(true)
    try {
      requireLatestMutation({ permission: 'cars.view', quota: false })
      const scope = requireLatestMutation({
        permission: 'finance.manage',
        quota: false,
      })
      if (editing) {
        await carsApi.updateExpense(
          car.id,
          editing.id,
          {
            name: name.trim(),
            amount: value,
          },
          { signal: scope.signal },
        )
      } else {
        await carsApi.createExpense(
          car.id,
          {
            name: name.trim(),
            amount: value,
          },
          { signal: scope.signal },
        )
      }
      setName('')
      setAmount('')
      setEditing(null)
      setFormOpen(false)
      await onChanged()
    } catch (error: unknown) {
      onProblem(normalizeApiProblem(error).message)
    } finally {
      setBusy(false)
    }
  }
  const remove = async (expense: CarExpense) => {
    if (!canManage || busy) return
    setPendingRemoval(null)
    setBusy(true)
    try {
      requireLatestMutation({ permission: 'cars.view', quota: false })
      const scope = requireLatestMutation({
        permission: 'finance.manage',
        quota: false,
      })
      await carsApi.removeExpense(car.id, expense.id, { signal: scope.signal })
      await onChanged()
    } catch (error: unknown) {
      onProblem(normalizeApiProblem(error).message)
    } finally {
      setBusy(false)
    }
  }
  const expenses = car.expenses ?? []
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0)
  const openForm = (expense: CarExpense | null) => {
    setFormError(null)
    setEditing(expense)
    setName(expense?.name ?? '')
    setAmount(expense === null ? '' : String(expense.amount))
    setFormOpen(true)
  }
  return (
    <Card
      aside={
        <span className="text-app-muted text-[13px] font-semibold">
          Разом понад ціну придбання: {moneyExact(total)}
        </span>
      }
      title="Витрати"
    >
      <p className="text-app-dim text-[13px] leading-[1.5]">
        Транспортування, мийка, розмитнення — усе, що ви вклали в авто понад
        ціну придбання. Кожна витрата збільшує інвестовану суму.
      </p>
      {expenses.length === 0 ? (
        <div className="border-app-line flex flex-wrap items-center justify-between gap-3 rounded-[14px] border p-4">
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <span
              aria-hidden
              className="bg-brand/12 text-brand grid size-11 shrink-0 place-items-center rounded-[12px]"
            >
              <Wallet className="size-5" />
            </span>
            <span className="grid gap-0.5">
              <span className="text-[15px] font-bold text-white">
                Витрат ще немає
              </span>
              <span className="text-app-dim text-[13px]">
                Додайте першу, щоб бачити реальну окупність.
              </span>
            </span>
          </div>
          {canManage ? (
            <Button
              className="min-h-12 shrink-0 px-5 text-sm font-bold whitespace-nowrap"
              disabled={busy}
              onClick={() => openForm(null)}
              variant="primary"
            >
              <Plus aria-hidden />
              Додати витрату
            </Button>
          ) : null}
        </div>
      ) : (
        <DataTable
          caption="Витрати автомобіля"
          columns={[
            {
              key: 'name',
              label: 'Витрата',
              variant: 'primary',
              cell: (expense: CarExpense) => expense.name,
            },
            {
              key: 'createdAt',
              label: 'Додано',
              cell: (expense: CarExpense) => day(expense.createdAt),
            },
            {
              key: 'amount',
              label: 'Сума',
              align: 'end',
              cell: (expense: CarExpense) => money(expense.amount),
            },
            ...(canManage
              ? [
                  {
                    key: 'actions',
                    label: 'Дії',
                    align: 'end' as const,
                    headerHidden: true,
                    cell: (expense: CarExpense) => (
                      <ActionMenu
                        actions={[
                          {
                            key: 'edit',
                            label: 'Редагувати',
                            icon: <Pencil aria-hidden className="size-4" />,
                            disabled: busy,
                            onSelect: () => openForm(expense),
                          },
                          {
                            key: 'remove',
                            label: 'Видалити',
                            icon: <Trash2 aria-hidden className="size-4" />,
                            destructive: true,
                            disabled: busy,
                            onSelect: () => setPendingRemoval(expense),
                          },
                        ]}
                        label={`Дії з витратою ${expense.name}`}
                      />
                    ),
                  },
                ]
              : []),
          ]}
          empty={
            <EmptyState
              description="Транспортування, мийка, розмитнення — усе, що ви вклали в авто понад ціну придбання."
              icon={<Wallet aria-hidden />}
              title="Витрат ще немає"
            />
          }
          footer={
            expenses.length === 0 ? undefined : (
              <div className="border-app-line flex flex-wrap items-baseline justify-between gap-2 border-t px-3.5 py-2.5">
                <span className="text-app-dim text-[12.5px]">
                  Разом {expenses.length}{' '}
                  {plural(expenses.length, ['витрата', 'витрати', 'витрат'])}
                </span>
                <span className="text-[15px] font-semibold tabular-nums text-white">
                  {money(total)}
                </span>
              </div>
            )
          }
          rowKey={(expense: CarExpense) => expense.id}
          rows={expenses}
        />
      )}
      {canManage && expenses.length > 0 ? (
        <div className="flex flex-wrap justify-end">
          <Button
            className="px-4 text-sm font-bold"
            disabled={busy}
            onClick={() => openForm(null)}
            variant="primary"
          >
            <Plus aria-hidden />
            Додати витрату
          </Button>
        </div>
      ) : null}

      <FormDialog
        description={
          editing
            ? 'Сума й назва змінюються разом; прибутковість авто перерахується одразу.'
            : 'Витрата збільшує інвестовану суму й змінює прибутковість авто.'
        }
        error={formError}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) {
            setEditing(null)
            setFormError(null)
          }
        }}
        onSubmit={(event) => void create(event)}
        open={formOpen}
        pending={busy}
        submitLabel={editing ? 'Зберегти витрату' : 'Додати витрату'}
        title={
          editing ? `Редагування витрати «${editing.name}»` : 'Нова витрата'
        }
      >
        <Field label="Назва витрати">
          <TextInput
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </Field>
        <Field hint="У доларах" label="Сума витрати">
          <TextInput
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            value={amount}
          />
        </Field>
      </FormDialog>

      <ConfirmDialog
        confirmLabel="Видалити витрату"
        consequence={
          pendingRemoval
            ? `Витрата «${pendingRemoval.name}» на ${money(pendingRemoval.amount)} зникне назавжди, а інвестована сума зменшиться.`
            : ''
        }
        onConfirm={() => {
          if (pendingRemoval) void remove(pendingRemoval)
        }}
        onOpenChange={(open) => setPendingRemoval(open ? pendingRemoval : null)}
        open={pendingRemoval !== null}
        pending={busy}
        title="Видалити витрату?"
      />
    </Card>
  )
}

function CarForm({ carId, title }: { carId?: string; title: string }) {
  const { tenant } = useParams<{ tenant: string }>()
  const { cabinet, financeManage } = useAccess()
  const navigate = useNavigate()
  const base = `/app/${tenant ?? cabinet.targetTenant?.slug ?? ''}/cars`
  const [values, setValues] = useState({
    code: '',
    brand: '',
    model: '',
    year: '',
    color: '',
    vin: '',
    acquiredAt: '',
    purchasePrice: '',
    notes: '',
  })
  const [media, setMedia] = useState<MediaUploadResult[]>([])
  const [expenses, setExpenses] = useState<
    { id: number; name: string; amount: string }[]
  >([])
  const [createdCarId, setCreatedCarId] = useState<string | null>(null)
  // Shown while typing, so the invested sum is not a surprise after saving.
  const initialExpensesTotal = expenses.reduce((sum, expense) => {
    const value = Number(expense.amount)
    return Number.isFinite(value) && value > 0 ? sum + value : sum
  }, 0)
  const [completedExpenseIds, setCompletedExpenseIds] = useState<Set<number>>(
    new Set(),
  )
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(carId !== undefined)
  const [problem, setProblem] = useState<string | null>(null)
  const { requireLatestMutation } = useLatestMutationGuard(cabinetModules.cars)
  useEffect(() => {
    if (!carId) return
    void carsApi.get(carId).then(
      (car) => {
        setLoading(false)
        setValues({
          code: car.code,
          brand: car.brand,
          model: car.model,
          year: String(car.year),
          color: car.color ?? '',
          vin: car.vin ?? '',
          acquiredAt: car.acquiredAt,
          purchasePrice: String(car.purchasePrice),
          notes: car.notes ?? '',
        })
        setMedia(
          car.photos.map((photo) => ({
            storageKey: photo.storageKey,
            url: photo.url,
          })),
        )
      },
      (error: unknown) => {
        setLoading(false)
        setProblem(normalizeApiProblem(error).message)
      },
    )
  }, [carId])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const purchasePrice = Number(values.purchasePrice)
    const request = {
      code: values.code.trim(),
      brand: values.brand.trim(),
      model: values.model.trim(),
      year: Number(values.year),
      color: values.color.trim() || null,
      vin: values.vin.trim() || null,
      acquiredAt: values.acquiredAt || null,
      notes: values.notes.trim() || null,
    }
    if (
      !request.code ||
      !request.brand ||
      !request.model ||
      !Number.isInteger(request.year) ||
      ((!carId || financeManage) && !Number.isFinite(purchasePrice))
    ) {
      setProblem(
        'Заповніть обовʼязкові поля: код, марку, модель, рік числом і ціну придбання числом.',
      )
      return
    }
    const preparedExpenses = expenses.map((expense) => ({
      id: expense.id,
      name: expense.name.trim(),
      amount: Number(expense.amount),
    }))
    if (
      !carId &&
      preparedExpenses.some(
        (expense) =>
          !expense.name ||
          expense.name.length > 200 ||
          !Number.isFinite(expense.amount) ||
          expense.amount <= 0,
      )
    ) {
      setProblem(
        'Перевірте правильність початкових витрат. Кожна потребує назви до 200 символів і суми більшої за нуль.',
      )
      return
    }
    setProblem(null)
    setBusy(true)
    try {
      let savedCarId = carId ?? createdCarId
      if (carId) {
        const updateRequest: UpdateCarRequest = {
          ...request,
          ...(financeManage ? { purchasePrice } : {}),
        }
        const scope = requireLatestMutation({ quota: false })
        if ('purchasePrice' in updateRequest)
          requireLatestMutation({
            permission: 'finance.manage',
            quota: false,
          })
        const car = await carsApi.update(carId, updateRequest, {
          signal: scope.signal,
        })
        savedCarId = car.id
      } else {
        if (!savedCarId) {
          const createRequest: CreateCarRequest = {
            ...request,
            purchasePrice,
            photoKeys: media.map((item) => item.storageKey),
          }
          const scope = requireLatestMutation()
          requireLatestMutation({
            permission: 'finance.manage',
            quota: false,
          })
          const car = await carsApi.create(createRequest, {
            signal: scope.signal,
          })
          savedCarId = car.id
          setCreatedCarId(car.id)
        }
        const completed = new Set(completedExpenseIds)
        for (const expense of preparedExpenses) {
          if (completed.has(expense.id)) continue
          try {
            requireLatestMutation({ permission: 'cars.view', quota: false })
            const scope = requireLatestMutation({
              permission: 'finance.manage',
              quota: false,
            })
            await carsApi.createExpense(
              savedCarId,
              {
                name: expense.name,
                amount: expense.amount,
              },
              { signal: scope.signal },
            )
            completed.add(expense.id)
            setCompletedExpenseIds(new Set(completed))
          } catch (error: unknown) {
            setProblem(
              `Автомобіль створено, але не всі витрати збережено: ${normalizeApiProblem(error).message} Виправте дані витрати й надішліть форму ще раз — автомобіль не створиться повторно.`,
            )
            setBusy(false)
            return
          }
        }
      }
      void navigate(`${base}/${savedCarId}`)
    } catch (error: unknown) {
      setProblem(normalizeApiProblem(error).message)
      setBusy(false)
    }
  }
  const priceLocked = carId !== undefined && !financeManage
  const bind = (key: keyof typeof values) => ({
    disabled: busy,
    name: key,
    onChange: (
      event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ): void => {
      setValues((current) => ({ ...current, [key]: event.target.value }))
    },
    value: values[key],
  })
  if (loading)
    return (
      <PageBody width="narrow">
        <PageHeader eyebrow="Склад · Автомобілі" title={title} />
        <SkeletonRows
          columns={2}
          label="Завантажуємо дані автомобіля…"
          rows={5}
        />
      </PageBody>
    )
  return (
    <PageBody width="narrow">
      <Button asChild className="justify-self-start" variant="quiet">
        <Link to={carId ? `${base}/${carId}` : base}>
          <ChevronLeft aria-hidden />
          {carId ? 'До автомобіля' : 'До автомобілів'}
        </Link>
      </Button>
      <PageHeader eyebrow="Склад · Автомобілі" title={title} />
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      {createdCarId ? (
        <div className="grid gap-2">
          <Notice tone="ok">
            Автомобіль створено. Решту витрат можна додати на його сторінці.
          </Notice>
          <div className="flex flex-wrap">
            <Button asChild>
              <Link to={`${base}/${createdCarId}`}>Відкрити автомобіль</Link>
            </Button>
          </div>
        </div>
      ) : null}
      <form
        aria-busy={busy}
        className="grid gap-4"
        onSubmit={(event) => void submit(event)}
      >
        <SectionPanel
          description="За кодом ви знаходите авто на складі, за VIN — звіряєте його з документами."
          title="Ідентифікація"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field hint="Внутрішній номер авто на складі" label="Код" required>
              <TextInput {...bind('code')} required />
            </Field>
            <Field label="Марка" required>
              <TextInput {...bind('brand')} required />
            </Field>
            <Field label="Модель" required>
              <TextInput {...bind('model')} required />
            </Field>
            <Field hint="Чотири цифри, наприклад 2020" label="Рік" required>
              <TextInput {...bind('year')} inputMode="numeric" required />
            </Field>
            <Field label="Колір">
              <TextInput {...bind('color')} />
            </Field>
            <Field
              className="sm:col-span-2"
              hint="17 символів з техпаспорта"
              label="VIN"
            >
              <TextInput {...bind('vin')} className="font-mono" />
            </Field>
          </div>
        </SectionPanel>
        <SectionPanel
          description="Ціна придбання разом із витратами формує інвестовану суму авто."
          title="Придбання"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Дата придбання">
              <TextInput {...bind('acquiredAt')} type="date" />
            </Field>
            <Field
              hint={
                priceLocked
                  ? 'Ціну змінює користувач із правом на фінанси'
                  : 'У доларах, без пробілів'
              }
              label="Ціна придбання"
              required={!priceLocked}
            >
              <TextInput
                {...bind('purchasePrice')}
                disabled={busy || priceLocked}
                inputMode="decimal"
                required={!priceLocked}
              />
            </Field>
          </div>
        </SectionPanel>
        <SectionPanel
          description="Стан авто, домовленості з продавцем, що перевірити перед розбиранням."
          title="Нотатки"
        >
          <Field label="Нотатки">
            <TextArea {...bind('notes')} rows={4} />
          </Field>
        </SectionPanel>
        {carId ? (
          <SectionPanel
            description="Фото додають і прибирають під час створення авто."
            title="Фото"
          >
            {media.length > 0 ? (
              <section
                aria-label="Поточні фото автомобіля"
                className="grid gap-2"
              >
                <h3 className="text-app-muted text-[12.5px]">Поточні фото</h3>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {media.map((item, index) => (
                    <li key={item.storageKey}>
                      <img
                        alt={`Поточне фото автомобіля ${index + 1}`}
                        className="border-app-line rounded-control aspect-4/3 w-full border object-cover"
                        src={item.url}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <p className="text-app-dim text-[12.5px]">Фото немає.</p>
            )}
          </SectionPanel>
        ) : (
          <MediaPicker
            additionalPermission="finance.manage"
            entityType="cars"
            items={media}
            onChange={setMedia}
          />
        )}
        {!carId && financeManage ? (
          <SectionPanel
            aside={
              initialExpensesTotal > 0
                ? `Разом ${money(initialExpensesTotal)}`
                : undefined
            }
            description="Те, що вже витрачено на авто: транспортування, розмитнення, мийка. Разом із ціною придбання це інвестована сума."
            footer={
              <>
                <span className="text-app-dim text-[12.5px]">
                  Витрати можна додати й пізніше, на сторінці авто.
                </span>
                <Button
                  disabled={busy}
                  onClick={() =>
                    setExpenses((current) => [
                      ...current,
                      { id: Date.now(), name: '', amount: '' },
                    ])
                  }
                >
                  <Plus aria-hidden />
                  Додати витрату
                </Button>
              </>
            }
            title="Початкові витрати"
          >
            {expenses.length === 0 ? (
              <p className="text-app-dim text-[12.5px]">
                Витрат ще немає — авто збережеться й без них.
              </p>
            ) : (
              <ul className="grid">
                {expenses.map((expense, index) => {
                  const saved = completedExpenseIds.has(expense.id)
                  return (
                    <li
                      className={cn(
                        'grid gap-3 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end',
                        index > 0 && 'border-app-line border-t',
                      )}
                      key={expense.id}
                    >
                      {/* The label stays short on screen; the number that keeps
                          each row apart is carried in the accessible name. */}
                      <Field label="Назва" srLabel={`витрати ${index + 1}`}>
                        <TextInput
                          disabled={busy || saved}
                          onChange={(event) =>
                            setExpenses((current) =>
                              current.map((item) =>
                                item.id === expense.id
                                  ? { ...item, name: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="Транспортування"
                          value={expense.name}
                        />
                      </Field>
                      <Field
                        hint={index === 0 ? 'У доларах' : undefined}
                        label="Сума"
                        srLabel={`витрати ${index + 1}`}
                      >
                        <TextInput
                          disabled={busy || saved}
                          inputMode="decimal"
                          onChange={(event) =>
                            setExpenses((current) =>
                              current.map((item) =>
                                item.id === expense.id
                                  ? { ...item, amount: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="500"
                          value={expense.amount}
                        />
                      </Field>
                      <div className="flex items-center justify-end gap-2 pb-0.5">
                        {saved ? (
                          <StatusPill tone="ok">Збережено</StatusPill>
                        ) : null}
                        <Button
                          aria-label={`Прибрати витрату ${String(index + 1)}`}
                          disabled={busy || saved}
                          onClick={() =>
                            setExpenses((current) =>
                              current.filter((item) => item.id !== expense.id),
                            )
                          }
                          size="icon"
                          variant="quiet"
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </SectionPanel>
        ) : null}
        <div className="border-app-line rounded-panel bg-app-raised flex flex-wrap items-center justify-end gap-2 border p-3">
          <Button asChild variant="quiet">
            <Link to={carId ? `${base}/${carId}` : base}>Скасувати</Link>
          </Button>
          <Button
            aria-busy={busy}
            disabled={busy}
            type="submit"
            variant="primary"
          >
            {carId ? 'Зберегти зміни' : 'Створити автомобіль'}
          </Button>
        </div>
      </form>
    </PageBody>
  )
}

/** How many parts the car page shows before handing over to the warehouse. */
const PARTS_PREVIEW = 5

/**
 * What this car became on the shelf. The page shows the first few parts and
 * then hands over to the warehouse filtered by this car, instead of keeping a
 * second, poorer copy of the parts screen behind its own route.
 */
function CarParts({
  carId,
  partsHref,
}: {
  carId: string
  /** The warehouse, already filtered to this car. */
  partsHref: string
}) {
  const [requestVersion, setRequestVersion] = useState(0)
  const [state, setState] = useState<{
    parts: Awaited<ReturnType<typeof carsApi.listParts>> | null
    problem: string | null
    loading: boolean
  }>({ parts: null, problem: null, loading: true })
  useEffect(() => {
    const controller = new AbortController()
    void carsApi
      .listParts(
        carId,
        { pageSize: PARTS_PREVIEW },
        { signal: controller.signal },
      )
      .then(
        (parts) => {
          if (!controller.signal.aborted)
            setState({ parts, problem: null, loading: false })
        },
        (error: unknown) => {
          if (!controller.signal.aborted)
            setState({
              parts: null,
              problem: normalizeApiProblem(error).message,
              loading: false,
            })
        },
      )
    return () => controller.abort()
  }, [carId, requestVersion])

  const parts = state.parts
  const shown = parts?.items.slice(0, PARTS_PREVIEW) ?? []

  return (
    <SectionPanel
      aside={
        parts
          ? `${String(parts.total)} ${plural(parts.total, ['позиція', 'позиції', 'позицій'])} з цього авто`
          : undefined
      }
      footer={
        parts && parts.total > 0 ? (
          <>
            <span className="text-app-dim text-[12.5px]">
              {parts.total > shown.length
                ? `Показано ${String(shown.length)} із ${String(parts.total)}`
                : 'Показано всі позиції'}
            </span>
            <Button asChild variant="primary">
              <Link to={partsHref}>
                Відкрити на складі
                <ChevronRight aria-hidden />
              </Link>
            </Button>
          </>
        ) : undefined
      }
      title="Запчастини авто"
    >
      {state.loading ? (
        <SkeletonRows columns={3} label="Завантажуємо запчастини…" rows={3} />
      ) : null}
      {state.problem ? (
        <ErrorState
          description={`${state.problem} Перевірте звʼязок і повторіть запит.`}
          onRetry={() => {
            setState({ parts: null, problem: null, loading: true })
            setRequestVersion((current) => current + 1)
          }}
          title="Не вдалося завантажити запчастини"
        />
      ) : null}
      {parts ? (
        <DataTable
          caption="Запчастини автомобіля на складі"
          columns={[
            {
              key: 'name',
              label: 'Деталь',
              variant: 'primary',
              cell: (part: CarPartListItem) => part.name,
            },
            {
              key: 'status',
              label: 'Статус',
              cell: (part: CarPartListItem) => {
                const presentation = partStatus(part.status)
                return (
                  <StatusPill tone={presentation.tone}>
                    {presentation.label}
                  </StatusPill>
                )
              },
            },
            {
              key: 'quantity',
              label: 'Доступно',
              align: 'end',
              cell: (part: CarPartListItem) => part.quantityAvailable,
            },
          ]}
          empty={
            <EmptyState
              description="Деталі зʼявляться тут, щойно ви розберете авто й додасте запчастини на склад."
              icon={<Wrench aria-hidden />}
              title="Деталей цього авто ще немає"
            />
          }
          rowKey={(part: CarPartListItem) => part.id}
          rows={shown}
        />
      ) : null}
    </SectionPanel>
  )
}

export function MediaPicker({
  additionalPermission,
  beforeDispatch,
  entityType,
  items,
  onChange,
}: {
  additionalPermission?: Permission
  beforeDispatch?: () => unknown
  entityType: Exclude<MediaEntityType, 'tenants'>
  items: MediaUploadResult[]
  onChange: (items: MediaUploadResult[]) => void
}) {
  const definition = cabinetModules[entityType]
  const { requireLatestMutation } = useLatestMutationGuard(definition)
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  /** Uploads answer with a storage key only, so the file name is kept here. */
  const [names, setNames] = useState<Record<string, string>>({})
  const upload = async (files: FileList | null) => {
    if (!files || busy) return
    setBusy(true)
    const selected = Array.from(files)
    const results = await Promise.allSettled(
      selected.map((file) =>
        Promise.resolve().then(() => {
          beforeDispatch?.()
          const scope = requireLatestMutation({ quota: false })
          if (additionalPermission)
            requireLatestMutation({
              permission: additionalPermission,
              quota: false,
            })
          return mediaApi.upload(file, entityType, { signal: scope.signal })
        }),
      ),
    )
    const uploaded = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    )
    const uploadedNames = results.flatMap((result, index) => {
      const file = selected[index]
      return result.status === 'fulfilled' && file
        ? [[result.value.storageKey, file.name] as const]
        : []
    })
    if (uploadedNames.length > 0)
      setNames((current) => ({
        ...current,
        ...Object.fromEntries(uploadedNames),
      }))
    if (uploaded.length > 0) onChange([...items, ...uploaded])
    const errors = results.flatMap((result, index) => {
      const file = selected[index]
      return result.status === 'rejected' && file
        ? [`${file.name}: ${normalizeApiProblem(result.reason).message}`]
        : []
    })
    setProblems(errors)
    setBusy(false)
  }
  const remove = async (item: MediaUploadResult) => {
    if (busy) return
    setBusy(true)
    try {
      beforeDispatch?.()
      const scope = requireLatestMutation({ quota: false })
      if (additionalPermission)
        requireLatestMutation({
          permission: additionalPermission,
          quota: false,
        })
      await mediaApi.remove(item.storageKey, { signal: scope.signal })
      onChange(items.filter((value) => value.storageKey !== item.storageKey))
    } catch (error: unknown) {
      setProblems([normalizeApiProblem(error).message])
    } finally {
      setBusy(false)
    }
  }
  return (
    <fieldset className="border-app-line rounded-panel bg-app-raised grid min-w-0 gap-3 border p-4">
      <legend className="px-1 text-base font-semibold text-white">Фото</legend>
      <p className="text-app-dim text-[12.5px]">
        Можна вибрати кілька файлів одразу або зняти на камеру.
      </p>
      <input
        accept="image/*"
        aria-label="Додати фото"
        capture="environment"
        className="bg-app-input text-app-muted border-app-line-2 rounded-control file:bg-app-raised file:text-app-ink file:rounded-control min-h-11 w-full cursor-pointer border px-3 py-2 text-sm file:mr-3 file:min-h-8 file:cursor-pointer file:border-0 file:px-3 file:text-[13px] disabled:cursor-not-allowed disabled:opacity-55"
        disabled={busy}
        multiple
        onChange={(event) => void upload(event.target.files)}
        type="file"
      />
      {problems.length > 0 ? (
        <div
          className="border-state-danger/30 bg-state-danger-soft rounded-control border px-3.5 py-2.5"
          role="alert"
        >
          <p className="text-state-danger text-[13.5px] font-medium">
            Ці файли не завантажилися. Виберіть інші або спробуйте ще раз.
          </p>
          <ul className="text-app-ink mt-1.5 grid gap-1 text-[13px]">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {items.length > 0 ? (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li
              className="border-app-line rounded-control flex flex-wrap items-center gap-3 border p-2"
              key={item.storageKey}
            >
              <img
                alt="Попередній перегляд фото"
                className="rounded-control size-12 shrink-0 object-cover"
                src={item.url}
              />
              <span className="text-app-ink min-w-0 flex-1 truncate text-[13.5px]">
                {names[item.storageKey] ??
                  item.storageKey.split('/').pop() ??
                  'Фото'}
              </span>
              <Button disabled={busy} onClick={() => void remove(item)}>
                <Trash2 aria-hidden />
                Прибрати фото
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-app-dim text-[12.5px]">
          <ImagePlus
            aria-hidden
            className="mr-1.5 inline size-4 align-text-bottom"
          />
          Файлів ще не вибрано.
        </p>
      )}
    </fieldset>
  )
}
