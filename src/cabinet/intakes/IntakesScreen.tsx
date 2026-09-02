import { useEffect, useMemo, useState } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router'
import { ChevronLeft, Plus } from 'lucide-react'
import {
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
  Panel,
  SearchInput,
  SelectInput,
  SkeletonRows,
  StatCard,
  StatStrip,
  Toolbar,
} from '@/components/app'
import {
  intakesApi,
  type AddIntakePartRequest,
  type CreateIntakeRequest,
  type Intake,
  type IntakeListParams,
  isIntakeStatus,
} from '@/api/intakes'
import { normalizeApiProblem } from '@/api/errors'
import { useCabinet } from '../CabinetContext'
import type { CabinetModuleScreenProps } from '../ModuleBoundary'
import { MediaPicker } from '../cars/CarsScreen'
import type { MediaUploadResult } from '@/api/media'
import { cabinetModules } from '../module-registry'
import { evaluateModuleAccess } from '../policy'
import type { ModuleAccessDecision } from '../policy'
import type { CabinetModuleDefinition } from '../module-registry'
import type { Permission } from '../access-types'
import { useLatestMutationGuard } from '../use-latest-mutation-guard'

const defaultPageSize = 20
const positiveInteger = (value: string | null, fallback: number) => {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}
const pageSizeParam = (value: string | null, fallback: number) => {
  const number = positiveInteger(value, fallback)
  return number <= 100 ? number : fallback
}
const money = (amount: number) =>
  new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(amount)

function useIntakeAccess() {
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
  const viewDecision = (
    definition: CabinetModuleDefinition,
    permission: Permission,
  ): ModuleAccessDecision =>
    evaluateModuleAccess(
      { ...definition, released: true, viewPermission: permission },
      access,
      'view',
    )
  const createDecision = decision(
    cabinetModules.intakes,
    'intakes.manage',
    true,
  )
  const manageDecision = decision(
    cabinetModules.intakes,
    'intakes.manage',
    false,
  )
  const partsViewDecision = viewDecision(cabinetModules.parts, 'parts.view')
  const partQuotaDecision = decision(
    cabinetModules.parts,
    'intakes.manage',
    true,
  )
  const partCreateDecision =
    manageDecision.kind !== 'allowed'
      ? manageDecision
      : partsViewDecision.kind !== 'allowed'
        ? partsViewDecision
        : partQuotaDecision
  const partsMediaManage =
    decision(cabinetModules.parts, 'parts.manage', false).kind === 'allowed'
  const financeManage =
    decision(cabinetModules.intakes, 'finance.manage', false).kind === 'allowed'
  return {
    cabinet,
    createDecision,
    manageDecision,
    partCreateDecision,
    partsMediaManage,
    financeManage,
    manage: manageDecision.kind === 'allowed',
    partsView: partsViewDecision.kind === 'allowed',
    financeView:
      viewDecision(cabinetModules.intakes, 'finance.view').kind === 'allowed',
  }
}

function Denied({ decision }: { decision: ModuleAccessDecision }) {
  const message =
    decision.kind === 'quota-exhausted'
      ? decision.resource === 'parts'
        ? 'Ліміт запчастин вичерпано.'
        : 'Ліміт приймань вичерпано.'
      : decision.kind === 'subscription-blocked'
        ? 'Поточна підписка не дозволяє цю дію.'
        : 'Недостатньо прав.'
  return (
    <Notice role="alert" tone="warn">
      {message}
    </Notice>
  )
}

export function IntakesScreen(_props: Partial<CabinetModuleScreenProps> = {}) {
  const {
    cabinet,
    createDecision,
    manageDecision,
    partCreateDecision,
    partsMediaManage,
    financeManage,
  } = useIntakeAccess()
  const params = useParams<{ tenant: string; intakeId: string }>()
  const location = useLocation()
  const tenant = params.tenant ?? cabinet.targetTenant?.slug ?? ''
  const base = `/app/${tenant}/intakes`
  const intakeId = params.intakeId
  if (location.pathname.endsWith('/parts/new')) {
    if (manageDecision.kind !== 'allowed')
      return <Denied decision={manageDecision} />
    if (partCreateDecision.kind !== 'allowed')
      return <Denied decision={partCreateDecision} />
    return intakeId ? (
      <PartForm canUploadMedia={partsMediaManage} intakeId={intakeId} />
    ) : (
      <Denied decision={{ kind: 'permission-denied' }} />
    )
  }
  if (
    location.pathname.endsWith('/new') ||
    location.pathname.endsWith('/batch')
  ) {
    if (createDecision.kind !== 'allowed')
      return <Denied decision={createDecision} />
    return (
      <IntakeForm
        batch={location.pathname.endsWith('/batch')}
        canManageFinance={financeManage}
        title="Нове приймання"
        submit={(request, signal) => intakesApi.create(request, { signal })}
      />
    )
  }
  if (intakeId && location.pathname.endsWith('/edit')) {
    if (manageDecision.kind !== 'allowed')
      return <Denied decision={manageDecision} />
    return (
      <IntakeForm
        canManageFinance={financeManage}
        intakeId={intakeId}
        title="Редагувати приймання"
        submit={(request, signal) =>
          intakesApi.update(intakeId, request, { signal })
        }
      />
    )
  }
  if (intakeId) return <IntakeDetail base={base} intakeId={intakeId} />
  return <IntakesList base={base} />
}

function IntakesList({ base }: { base: string }) {
  const { createDecision } = useIntakeAccess()
  const [searchParams, setSearchParams] = useSearchParams()
  const selection = useMemo<IntakeListParams>(
    () => ({
      search: searchParams.get('search') ?? undefined,
      status: isIntakeStatus(searchParams.get('status'))
        ? (searchParams.get('status') as IntakeListParams['status'])
        : undefined,
      page: positiveInteger(searchParams.get('page'), 1),
      pageSize: pageSizeParam(searchParams.get('pageSize'), defaultPageSize),
    }),
    [searchParams],
  )
  const [query, setQuery] = useState(searchParams.get('search') ?? '')
  const [state, setState] = useState<{
    page: Awaited<ReturnType<typeof intakesApi.list>> | null
    error: string | null
  }>({ page: null, error: null })
  useEffect(() => {
    const controller = new AbortController()
    void intakesApi.list(selection, { signal: controller.signal }).then(
      (page) => setState({ page, error: null }),
      (error: unknown) => {
        if (!controller.signal.aborted)
          setState((current) => ({
            ...current,
            error: normalizeApiProblem(error).message,
          }))
      },
    )
    return () => controller.abort()
  }, [selection])
  const updateSearch = () => {
    const next = new URLSearchParams(searchParams)
    const value = query.trim()
    if (value) next.set('search', value)
    else next.delete('search')
    next.set('page', '1')
    setSearchParams(next)
  }
  const updatePage = (page: number, pageSize: number) => {
    const next = new URLSearchParams(searchParams)
    next.set('page', String(page))
    next.set('pageSize', String(pageSize))
    setSearchParams(next)
  }
  const currentPage = state.page?.page ?? selection.page ?? 1
  const currentPageSize =
    state.page?.pageSize ?? selection.pageSize ?? defaultPageSize
  const totalPages = state.page?.totalPages ?? 1
  return (
    <PageBody>
      <PageHeader
        actions={
          createDecision.kind === 'allowed' ? (
            <Button asChild variant="primary">
              <Link to={`${base}/new`}>
                <Plus aria-hidden />
                Нове приймання
              </Link>
            </Button>
          ) : undefined
        }
        eyebrow="Склад"
        title="Приймання авто"
      />
      <form
        onSubmit={(event) => {
          event.preventDefault()
          updateSearch()
        }}
      >
        <Toolbar>
          <Field className="min-w-52 flex-1" label="Пошук приймань">
            <SearchInput
              aria-label="Пошук приймань"
              onChange={(event) => setQuery(event.target.value)}
              value={query}
            />
          </Field>
          <Field className="min-w-40" label="Статус">
            <SelectInput
              onChange={(event) => {
                const next = new URLSearchParams(searchParams)
                if (event.target.value) next.set('status', event.target.value)
                else next.delete('status')
                next.set('page', '1')
                setSearchParams(next)
              }}
              value={selection.status ?? ''}
            >
              <option value="">Усі</option>
              <option value="active">Активні</option>
              <option value="closed">Закриті</option>
            </SelectInput>
          </Field>
          <Button type="submit" variant="primary">
            Шукати
          </Button>
        </Toolbar>
      </form>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <StatStrip
        items={[{ label: 'знайдено', value: state.page?.total ?? 0 }]}
      />
      <DataTable
        caption="Список приймань"
        columns={[
          {
            key: 'name',
            label: 'Приймання',
            variant: 'primary',
            cell: (intake) => (
              <Link
                className="hover:text-brand block"
                to={`${base}/${intake.id}`}
              >
                {intake.name ?? 'Без назви'}
              </Link>
            ),
          },
          {
            key: 'supplier',
            label: 'Постачальник',
            cell: (intake) => intake.supplier ?? 'Постачальника не вказано',
          },
          {
            key: 'parts',
            label: 'Запчастин',
            align: 'end',
            cell: (intake) => intake.partsCount,
          },
        ]}
        empty={
          <EmptyState
            description="Створіть перше приймання, щоб оприбуткувати партію запчастин."
            title="Приймань поки немає"
          />
        }
        footer={
          <Pagination
            label="Пагінація приймань"
            onPage={(nextPage) => updatePage(nextPage, currentPageSize)}
            page={currentPage}
            totalPages={totalPages}
          />
        }
        rowKey={(intake) => intake.id}
        rows={state.page?.items ?? []}
      />
    </PageBody>
  )
}

function IntakeDetail({ base, intakeId }: { base: string; intakeId: string }) {
  const { manage, partsView, partCreateDecision, financeView } =
    useIntakeAccess()
  const navigate = useNavigate()
  const [intake, setIntake] = useState<Intake | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { requireLatestMutation } = useLatestMutationGuard(
    cabinetModules.intakes,
  )
  useEffect(() => {
    const controller = new AbortController()
    void intakesApi
      .get(intakeId, { signal: controller.signal })
      .then(setIntake, (error: unknown) => {
        if (!controller.signal.aborted)
          setProblem(normalizeApiProblem(error).message)
      })
    return () => controller.abort()
  }, [intakeId])
  const remove = async () => {
    if (busy) return
    setConfirmDelete(false)
    setBusy(true)
    try {
      const scope = requireLatestMutation({ quota: false })
      await intakesApi.remove(intakeId, { signal: scope.signal })
      void navigate(base)
    } catch (error: unknown) {
      setProblem(normalizeApiProblem(error).message)
      setBusy(false)
    }
  }
  if (!intake && problem)
    return (
      <PageBody width="narrow">
        <ErrorState
          actions={
            <Button asChild>
              <Link to={base}>До списку</Link>
            </Button>
          }
          description={problem}
          title="Не вдалося завантажити приймання"
        />
      </PageBody>
    )
  if (!intake)
    return (
      <PageBody width="narrow">
        <SkeletonRows label="Завантажуємо приймання…" rows={3} />
      </PageBody>
    )
  return (
    <PageBody aria-busy={busy} className="max-w-4xl" role="main">
      <Button asChild className="justify-self-start" variant="quiet">
        <Link to={base}>
          <ChevronLeft aria-hidden />
          До приймань
        </Link>
      </Button>
      <PageHeader
        actions={
          manage ? (
            <>
              <Button asChild variant="primary">
                <Link to={`${base}/${intake.id}/edit`}>Редагувати</Link>
              </Button>
              {partCreateDecision.kind === 'allowed' ? (
                <Button asChild>
                  <Link to={`${base}/${intake.id}/parts/new`}>
                    Додати запчастину
                  </Link>
                </Button>
              ) : null}
              <Button
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
                variant="danger"
              >
                Видалити
              </Button>
            </>
          ) : undefined
        }
        eyebrow="Склад · Приймання"
        title={intake.name ?? 'Приймання без назви'}
      />
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      <Panel>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <IntakeFact
            label="Постачальник"
            value={intake.supplier ?? 'не вказано'}
          />
          <IntakeFact
            label="Дата придбання"
            value={intake.purchasedAt ?? 'не вказано'}
          />
          {financeView ? (
            <IntakeFact
              label="Вартість"
              value={
                intake.totalCost === null
                  ? 'не вказано'
                  : money(intake.totalCost)
              }
            />
          ) : null}
          <IntakeFact label="Створив" value={intake.createdBy.displayName} />
          <IntakeFact label="Нотатки" value={intake.notes ?? 'Нотаток немає'} />
        </dl>
      </Panel>
      {intake.photos.length > 0 ? (
        <section aria-label="Фото приймання" className="grid gap-2">
          <h2 className="text-base font-semibold text-white">Фото</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {intake.photos.map((photo, index) => (
              <li key={photo.url}>
                <a
                  className="rounded-panel border-app-line block overflow-hidden border"
                  href={photo.url}
                >
                  <img
                    alt={`Фото приймання ${index + 1}`}
                    className="aspect-4/3 w-full object-cover"
                    src={photo.thumbnailUrl || photo.url}
                  />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {financeView && intake.profitability ? (
        <section aria-label="Прибутковість" className="grid gap-2">
          <h2 className="text-base font-semibold text-white">Прибутковість</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              accent
              label="Інвестовано"
              value={money(intake.profitability.invested)}
            />
            <StatCard
              label="Повернено"
              value={money(intake.profitability.recouped)}
            />
            <StatCard
              label="Повернення"
              value={`${String(intake.profitability.recoupedPercent ?? '—')}%`}
            />
          </div>
        </section>
      ) : null}
      {partsView ? (
        <section className="grid gap-2">
          <h2 className="text-base font-semibold text-white">Запчастини</h2>
          <DataTable
            caption="Запчастини приймання"
            columns={[
              {
                key: 'name',
                label: 'Деталь',
                variant: 'primary',
                cell: (part) => part.name,
              },
              {
                key: 'quantity',
                label: 'Кількість',
                align: 'end',
                cell: (part) => `${String(part.quantity)} ${part.unit}`,
              },
              {
                key: 'status',
                label: 'Стан',
                cell: (part) => part.status,
              },
            ]}
            empty={
              <EmptyState
                description="Додайте запчастину, щоб оприбуткувати вміст цього приймання."
                title="У прийманні ще немає запчастин"
              />
            }
            rowKey={(part) => part.id}
            rows={intake.parts}
          />
        </section>
      ) : null}
      <ConfirmDialog
        confirmLabel="Видалити"
        consequence="Приймання та його звʼязок із оприбуткованими деталями зникнуть назавжди."
        onConfirm={() => void remove()}
        onOpenChange={setConfirmDelete}
        open={confirmDelete}
        pending={busy}
        title="Видалити приймання?"
      />
    </PageBody>
  )
}

function IntakeFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-app-dim text-[12.5px]">{label}</dt>
      <dd className="text-sm text-white">{value}</dd>
    </div>
  )
}

function IntakeForm({
  title,
  intakeId,
  batch = false,
  canManageFinance,
  submit,
}: {
  title: string
  intakeId?: string
  batch?: boolean
  canManageFinance: boolean
  submit: (request: CreateIntakeRequest, signal: AbortSignal) => Promise<Intake>
}) {
  const cabinet = useCabinet()
  const params = useParams<{ tenant: string }>()
  const navigate = useNavigate()
  const base = `/app/${params.tenant ?? cabinet.targetTenant?.slug ?? ''}/intakes`
  const [values, setValues] = useState({
    name: '',
    supplier: '',
    purchasedAt: '',
    totalCost: '',
    notes: '',
  })
  const [media, setMedia] = useState<MediaUploadResult[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { requireLatestMutation } = useLatestMutationGuard(
    cabinetModules.intakes,
  )
  useEffect(() => {
    if (!intakeId) return
    const controller = new AbortController()
    void intakesApi.get(intakeId, { signal: controller.signal }).then(
      (intake) =>
        setValues({
          name: intake.name ?? '',
          supplier: intake.supplier ?? '',
          purchasedAt: intake.purchasedAt ?? '',
          totalCost:
            canManageFinance && intake.totalCost !== null
              ? String(intake.totalCost)
              : '',
          notes: intake.notes ?? '',
        }),
      (error: unknown) => {
        if (!controller.signal.aborted)
          setProblem(normalizeApiProblem(error).message)
      },
    )
    return () => controller.abort()
  }, [canManageFinance, intakeId])
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    const amount = values.totalCost === '' ? null : Number(values.totalCost)
    if (
      canManageFinance &&
      amount !== null &&
      (!Number.isFinite(amount) || amount < 0)
    ) {
      setProblem('Перевірте правильність загальної вартості.')
      return
    }
    setBusy(true)
    try {
      const request = {
        name: values.name.trim() || null,
        supplier: values.supplier.trim() || null,
        purchasedAt: values.purchasedAt || null,
        ...(canManageFinance ? { totalCost: amount } : {}),
        notes: values.notes.trim() || null,
      }
      const scope = requireLatestMutation({ quota: intakeId === undefined })
      if ('totalCost' in request)
        requireLatestMutation({
          permission: 'finance.manage',
          quota: false,
        })
      const intake = await submit(
        intakeId
          ? request
          : { ...request, photoKeys: media.map((item) => item.storageKey) },
        scope.signal,
      )
      void navigate(`${base}/${intake.id}`)
    } catch (error: unknown) {
      setProblem(normalizeApiProblem(error).message)
      setBusy(false)
    }
  }
  return (
    <section className="mx-auto grid w-full max-w-2xl gap-4">
      <h1>{title}</h1>
      {batch ? (
        <p aria-label="Підсумок партії">
          Підсумок: {values.name || 'без назви'} ·{' '}
          {values.supplier || 'без постачальника'}
          {canManageFinance
            ? ` · ${values.totalCost || 'вартість не вказано'}`
            : null}
        </p>
      ) : null}
      {problem ? <p role="alert">{problem}</p> : null}
      <form
        aria-busy={busy}
        className="grid gap-3"
        onSubmit={(event) => void save(event)}
      >
        {(
          [
            ['name', 'Назва'],
            ['supplier', 'Постачальник'],
            ['purchasedAt', 'Дата придбання'],
            ['totalCost', 'Загальна вартість'],
            ['notes', 'Нотатки'],
          ] as const
        )
          .filter(([key]) => canManageFinance || key !== 'totalCost')
          .map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                name={key}
                onChange={(event) =>
                  setValues({ ...values, [key]: event.target.value })
                }
                value={values[key]}
              />
            </label>
          ))}
        {!intakeId ? (
          <MediaPicker entityType="intakes" items={media} onChange={setMedia} />
        ) : null}
        <button disabled={busy} type="submit">
          Зберегти
        </button>
      </form>
    </section>
  )
}

function PartForm({
  canUploadMedia,
  intakeId,
}: {
  canUploadMedia: boolean
  intakeId: string
}) {
  const navigate = useNavigate()
  const cabinet = useCabinet()
  const params = useParams<{ tenant: string }>()
  const base = `/app/${params.tenant ?? cabinet.targetTenant?.slug ?? ''}/intakes`
  const [values, setValues] = useState({
    name: '',
    partType: '',
    condition: 'good',
    quantity: '1',
    unit: 'шт',
    notes: '',
  })
  const [media, setMedia] = useState<MediaUploadResult[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const intakeMutation = useLatestMutationGuard(cabinetModules.intakes)
  const partMutation = useLatestMutationGuard(cabinetModules.parts)
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    const quantity = Number(values.quantity)
    if (!values.name.trim() || !Number.isInteger(quantity) || quantity < 1) {
      setProblem('Перевірте назву та кількість запчастини.')
      return
    }
    const request: AddIntakePartRequest = {
      name: values.name.trim(),
      partType: values.partType.trim() || null,
      condition: values.condition || null,
      quantity,
      unit: values.unit || null,
      notes: values.notes.trim() || null,
      photoKeys: media.map((item) => item.storageKey),
    }
    setBusy(true)
    try {
      const intakeScope = intakeMutation.requireLatestMutation({ quota: false })
      partMutation.requireLatestMutation({ permission: 'parts.view' })
      await intakesApi.addPart(intakeId, request, {
        signal: intakeScope.signal,
      })
      void navigate(`${base}/${intakeId}`)
    } catch (error: unknown) {
      setProblem(normalizeApiProblem(error).message)
      setBusy(false)
    }
  }
  return (
    <section className="mx-auto grid w-full max-w-2xl gap-4">
      <h1>Нова запчастина</h1>
      {problem ? <p role="alert">{problem}</p> : null}
      <form
        aria-busy={busy}
        className="grid gap-3"
        onSubmit={(event) => void save(event)}
      >
        {(
          [
            ['name', 'Назва'],
            ['partType', 'Тип'],
            ['condition', 'Стан'],
            ['quantity', 'Кількість'],
            ['unit', 'Одиниця'],
            ['notes', 'Нотатки'],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              name={key}
              onChange={(event) =>
                setValues({ ...values, [key]: event.target.value })
              }
              required={key === 'name' || key === 'quantity'}
              value={values[key]}
            />
          </label>
        ))}
        {canUploadMedia ? (
          <MediaPicker
            beforeDispatch={() => {
              intakeMutation.requireLatestMutation({ quota: false })
              partMutation.requireLatestMutation({
                permission: 'parts.view',
                quota: false,
              })
            }}
            entityType="parts"
            items={media}
            onChange={setMedia}
          />
        ) : null}
        <button disabled={busy} type="submit">
          Додати запчастину
        </button>
      </form>
    </section>
  )
}
