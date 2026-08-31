import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router'
import {
  carsApi,
  type Car,
  type CarExpense,
  type CarListParams,
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

const money = (value: number) =>
  new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(value)
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
    <section role="alert">
      <h1>{message}</h1>
    </section>
  )
}

export function CarsScreen(_props: Partial<CabinetModuleScreenProps> = {}) {
  const { cabinet, createDecision, manageDecision, partsView } = useAccess()
  const { tenant, carId } = useParams<{ tenant: string; carId: string }>()
  const location = useLocation()
  const base = `/app/${tenant ?? cabinet.targetTenant?.slug ?? ''}/cars`
  if (location.pathname.endsWith('/new') && createDecision.kind !== 'allowed')
    return <Denied decision={createDecision} />
  if (location.pathname.endsWith('/edit') && manageDecision.kind !== 'allowed')
    return <Denied decision={manageDecision} />
  if (location.pathname.endsWith('/warehouse') && !partsView)
    return <Denied decision={{ kind: 'permission-denied' }} />
  if (location.pathname.endsWith('/new'))
    return <CarForm title="Новий автомобіль" />
  if (carId && location.pathname.endsWith('/edit'))
    return <CarForm carId={carId} title="Редагувати автомобіль" />
  if (carId && location.pathname.endsWith('/warehouse'))
    return <CarWarehouse key={carId} carId={carId} />
  return carId ? (
    <CarDetail base={base} carId={carId} />
  ) : (
    <CarsList base={base} />
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
  return (
    <section>
      <header>
        <h1>Автомобілі</h1>
        {createDecision.kind === 'allowed' ? (
          <Link to={`${base}/new`}>Додати автомобіль</Link>
        ) : null}
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          change({ search: query.trim() || undefined, page: '1' })
        }}
      >
        <label>
          Пошук автомобілів
          <input
            aria-label="Пошук автомобілів"
            onChange={(event) => setQuery(event.target.value)}
            value={query}
          />
        </label>
        <label>
          Статус
          <select
            onChange={(event) =>
              change({ status: event.target.value || undefined, page: '1' })
            }
            value={selected.status ?? ''}
          >
            <option value="">Усі</option>
            <option value="active">Активні</option>
            <option value="archived">Архів</option>
          </select>
        </label>
        <label>
          Розмір сторінки
          <select
            onChange={(event) =>
              change({ pageSize: event.target.value, page: '1' })
            }
            value={String(selected.pageSize)}
          >
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
        <button type="submit">Шукати</button>
      </form>
      {problem ? <p role="alert">{problem}</p> : null}
      <p>Знайдено: {data?.total ?? 0}</p>
      <ul aria-label="Список автомобілів">
        {(data?.items ?? []).map((car) => (
          <li key={car.id}>
            <Link to={`${base}/${car.id}`}>
              {car.code} · {car.brand} {car.model} ({car.year})
            </Link>
            <p>
              Статус: {car.status}; запчастин: {car.partsCount}
            </p>
            {financeView && car.profitability ? (
              <p>
                Повернено: {money(car.profitability.recouped)} (
                {car.profitability.recoupedPercent ?? '—'}%)
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <nav aria-label="Пагінація автомобілів">
        <button
          disabled={page <= 1}
          onClick={() => change({ page: String(page - 1) })}
          type="button"
        >
          Попередня
        </button>
        <span>
          Сторінка {page} з {data?.totalPages ?? 1}
        </span>
        <button
          disabled={page >= (data?.totalPages ?? 1)}
          onClick={() => change({ page: String(page + 1) })}
          type="button"
        >
          Наступна
        </button>
      </nav>
    </section>
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
    if (
      busy ||
      !window.confirm(
        action === 'archive'
          ? 'Архівувати автомобіль?'
          : 'Видалити автомобіль?',
      )
    )
      return
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
      <section role="alert">
        <p>{problem}</p>
        <button onClick={() => void load()} type="button">
          Спробувати ще раз
        </button>
      </section>
    ) : (
      <p role="status">Завантажуємо автомобіль…</p>
    )
  return (
    <section>
      <Link to={base}>← До автомобілів</Link>
      <h1>
        {car.code} · {car.brand} {car.model}
      </h1>
      <dl>
        <dt>VIN</dt>
        <dd>
          {car.vin ?? 'не вказано'}{' '}
          {car.vin ? (
            <button
              onClick={() => {
                void copyVin(car.vin ?? '')
              }}
              type="button"
            >
              Копіювати VIN
            </button>
          ) : null}
        </dd>
        <dt>Рік</dt>
        <dd>{car.year}</dd>
        <dt>Колір</dt>
        <dd>{car.color ?? 'не вказано'}</dd>
        <dt>Дата придбання</dt>
        <dd>{car.acquiredAt}</dd>
        {financeView ? (
          <>
            <dt>Ціна придбання</dt>
            <dd>{money(car.purchasePrice)}</dd>
          </>
        ) : null}
        <dt>Нотатки</dt>
        <dd>{car.notes ?? 'немає'}</dd>
      </dl>
      {copyStatus ? <p role="status">{copyStatus}</p> : null}
      {car.photos.length > 0 ? (
        <section aria-label="Фото автомобіля">
          <h2>Фото</h2>
          <ul>
            {car.photos.map((photo, index) => (
              <li key={photo.id}>
                <a href={photo.url}>
                  <img
                    alt={`Фото автомобіля ${index + 1}`}
                    src={photo.thumbnailUrl || photo.url}
                  />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {partsView ? (
        <Link to={`${base}/${car.id}/warehouse`}>Склад автомобіля</Link>
      ) : null}
      {manage ? (
        <p>
          <Link to={`${base}/${car.id}/edit`}>Редагувати автомобіль</Link>
          <button
            disabled={busy}
            onClick={() => void lifecycle('archive')}
            type="button"
          >
            Архівувати
          </button>
          <button
            disabled={busy}
            onClick={() => void lifecycle('delete')}
            type="button"
          >
            Видалити
          </button>
        </p>
      ) : null}
      {financeView && car.profitability ? (
        <section aria-label="Прибутковість">
          <h2>Прибутковість</h2>
          <p>Інвестовано: {money(car.profitability.invested)}</p>
          <p>Повернено: {money(car.profitability.recouped)}</p>
          <p>Залишок: {money(car.profitability.remaining)}</p>
        </section>
      ) : null}
      {financeView ? (
        <Expenses
          car={car}
          canManage={financeManage}
          onChanged={load}
          onProblem={setProblem}
        />
      ) : null}
      {problem ? <p role="alert">{problem}</p> : null}
    </section>
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
  const [busy, setBusy] = useState(false)
  const create = async (event: FormEvent) => {
    event.preventDefault()
    const value = Number(amount)
    if (
      !canManage ||
      busy ||
      !name.trim() ||
      !Number.isFinite(value) ||
      value <= 0
    )
      return
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
      await onChanged()
    } catch (error: unknown) {
      onProblem(normalizeApiProblem(error).message)
    } finally {
      setBusy(false)
    }
  }
  const remove = async (expense: CarExpense) => {
    if (!canManage || busy || !window.confirm('Видалити витрату?')) return
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
  return (
    <section aria-label="Витрати">
      <h2>Витрати</h2>
      <ul>
        {(car.expenses ?? []).map((expense) => (
          <li key={expense.id}>
            {expense.name}: {money(expense.amount)}{' '}
            {canManage ? (
              <>
                <button
                  aria-label={`Редагувати витрату ${expense.name}`}
                  disabled={busy}
                  onClick={() => {
                    setEditing(expense)
                    setName(expense.name)
                    setAmount(String(expense.amount))
                  }}
                  type="button"
                >
                  Редагувати витрату
                </button>
                <button
                  aria-label={`Видалити витрату ${expense.name}`}
                  disabled={busy}
                  onClick={() => void remove(expense)}
                  type="button"
                >
                  Видалити витрату
                </button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      {canManage ? (
        <form aria-busy={busy} onSubmit={(event) => void create(event)}>
          <label>
            Назва витрати
            <input
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </label>
          <label>
            Сума витрати
            <input
              inputMode="decimal"
              onChange={(event) => setAmount(event.target.value)}
              value={amount}
            />
          </label>
          <button disabled={busy} type="submit">
            {editing ? 'Зберегти витрату' : 'Додати витрату'}
          </button>
        </form>
      ) : null}
    </section>
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
  const [completedExpenseIds, setCompletedExpenseIds] = useState<Set<number>>(
    new Set(),
  )
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const { requireLatestMutation } = useLatestMutationGuard(cabinetModules.cars)
  useEffect(() => {
    if (!carId) return
    void carsApi.get(carId).then(
      (car) => {
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
      (error: unknown) => setProblem(normalizeApiProblem(error).message),
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
    )
      return
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
      setProblem('Перевірте правильність початкових витрат.')
      return
    }
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
              `Автомобіль створено, але не всі витрати збережено: ${normalizeApiProblem(error).message}`,
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
  return (
    <section>
      <h1>{title}</h1>
      {problem ? <p role="alert">{problem}</p> : null}
      {createdCarId ? (
        <Link to={`${base}/${createdCarId}`}>Відкрити автомобіль</Link>
      ) : null}
      <form aria-busy={busy} onSubmit={(event) => void submit(event)}>
        {(
          [
            ['code', 'Код'],
            ['brand', 'Марка'],
            ['model', 'Модель'],
            ['year', 'Рік'],
            ['color', 'Колір'],
            ['vin', 'VIN'],
            ['acquiredAt', 'Дата придбання'],
            ['purchasePrice', 'Ціна придбання'],
            ['notes', 'Нотатки'],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              disabled={
                busy ||
                (key === 'purchasePrice' &&
                  carId !== undefined &&
                  !financeManage)
              }
              name={key}
              onChange={(event) =>
                setValues({ ...values, [key]: event.target.value })
              }
              required={
                ['code', 'brand', 'model', 'year'].includes(key) ||
                (key === 'purchasePrice' &&
                  (carId === undefined || financeManage))
              }
              value={values[key]}
            />
          </label>
        ))}
        {carId ? (
          media.length > 0 ? (
            <section aria-label="Поточні фото автомобіля">
              <h2>Поточні фото</h2>
              <ul>
                {media.map((item, index) => (
                  <li key={item.storageKey}>
                    <img
                      alt={`Поточне фото автомобіля ${index + 1}`}
                      src={item.url}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null
        ) : (
          <MediaPicker
            additionalPermission="finance.manage"
            entityType="cars"
            items={media}
            onChange={setMedia}
          />
        )}
        {!carId && financeManage ? (
          <fieldset>
            <legend>Початкові витрати</legend>
            {expenses.map((expense, index) => (
              <div key={expense.id}>
                <label>
                  Назва початкової витрати {index + 1}
                  <input
                    disabled={busy || completedExpenseIds.has(expense.id)}
                    onChange={(event) =>
                      setExpenses((current) =>
                        current.map((item) =>
                          item.id === expense.id
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      )
                    }
                    value={expense.name}
                  />
                </label>
                <label>
                  Сума початкової витрати {index + 1}
                  <input
                    disabled={busy || completedExpenseIds.has(expense.id)}
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
                    value={expense.amount}
                  />
                </label>
                <button
                  disabled={busy || completedExpenseIds.has(expense.id)}
                  onClick={() =>
                    setExpenses((current) =>
                      current.filter((item) => item.id !== expense.id),
                    )
                  }
                  type="button"
                >
                  Прибрати початкову витрату {index + 1}
                </button>
              </div>
            ))}
            <button
              disabled={busy}
              onClick={() =>
                setExpenses((current) => [
                  ...current,
                  { id: Date.now(), name: '', amount: '' },
                ])
              }
              type="button"
            >
              Додати початкову витрату
            </button>
          </fieldset>
        ) : null}
        <button disabled={busy} type="submit">
          Зберегти
        </button>
      </form>
    </section>
  )
}

function CarWarehouse({ carId }: { carId: string }) {
  const [requestVersion, setRequestVersion] = useState(0)
  const [state, setState] = useState<{
    parts: Awaited<ReturnType<typeof carsApi.listParts>> | null
    problem: string | null
    loading: boolean
  }>({ parts: null, problem: null, loading: true })
  useEffect(() => {
    const controller = new AbortController()
    void carsApi.listParts(carId, {}, { signal: controller.signal }).then(
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
  return (
    <section>
      <h1>Склад автомобіля</h1>
      {state.loading ? <p role="status">Завантажуємо склад…</p> : null}
      {state.problem ? (
        <div role="alert">
          <p>{state.problem}</p>
          <button
            onClick={() => {
              setState({ parts: null, problem: null, loading: true })
              setRequestVersion((current) => current + 1)
            }}
            type="button"
          >
            Спробувати ще раз
          </button>
        </div>
      ) : null}
      <ul>
        {state.parts?.items.map((part) => (
          <li key={part.id}>
            {part.name} · {part.status}
          </li>
        ))}
      </ul>
    </section>
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
    <fieldset>
      <legend>Фото</legend>
      <input
        accept="image/*"
        aria-label="Додати фото"
        capture="environment"
        disabled={busy}
        multiple
        onChange={(event) => void upload(event.target.files)}
        type="file"
      />
      {problems.length > 0 ? (
        <ul role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      <ul>
        {items.map((item) => (
          <li key={item.storageKey}>
            <img alt="Попередній перегляд фото" src={item.url} />
            <button
              disabled={busy}
              onClick={() => void remove(item)}
              type="button"
            >
              Прибрати фото
            </button>
          </li>
        ))}
      </ul>
    </fieldset>
  )
}
