import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { ArrowDown, Plus, Trash2 } from 'lucide-react'
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Notice,
  PageBody,
  PageHeader,
  Pagination,
  Panel,
  SelectInput,
  SkeletonRows,
  StatusPill,
  TextArea,
  TextInput,
  Toolbar,
} from '@/components/app'
import { cn } from '@/lib/utils'
import { normalizeApiProblem } from '@/api/errors'
import {
  cashApi,
  type CashDailySummary,
  type CashRegister,
  type CashTransaction,
} from '@/api/cash'
import { useCabinet } from '../CabinetContext'
import type { CabinetModuleScreenProps } from '../ModuleBoundary'
import { evaluateModuleAccess } from '../policy'
import { useLatestMutationGuard } from '../use-latest-mutation-guard'

const idFromPath = (path: string) => /\/cash\/([^/]+)/.exec(path)?.[1] ?? null
const localDate = (timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
const problemMessage = (error: unknown) => {
  const problem = normalizeApiProblem(error)
  if (problem.status === 402) return 'Функція потребує активної підписки.'
  if (problem.kind === 'forbidden') return 'У вас немає прав для цієї дії.'
  if (problem.kind === 'conflict') return problem.message
  return problem.message
}
type CashReplayOperation = 'movement' | 'transfer'
const isAmbiguousMutationFailure = (error: unknown) => {
  const kind = normalizeApiProblem(error).kind
  return kind === 'network' || kind === 'timeout'
}
const useCashIdempotencyKeys = () => {
  const keysRef = useRef(
    new Map<CashReplayOperation, { signature: string; key: string }>(),
  )
  return {
    forPayload(
      tenant: string,
      operation: CashReplayOperation,
      payload: unknown,
    ) {
      const signature = JSON.stringify([tenant, operation, payload])
      const current = keysRef.current.get(operation)
      if (current?.signature === signature) return current.key
      const key = `cash-${operation}-${crypto.randomUUID()}`
      keysRef.current.set(operation, { signature, key })
      return key
    },
    clear(operation: CashReplayOperation) {
      keysRef.current.delete(operation)
    },
  }
}
const canMutate = (
  definition: CabinetModuleScreenProps['definition'],
  cabinet: ReturnType<typeof useCabinet>,
  quota = true,
) => {
  const { quotaResource, ...unmeteredDefinition } = definition
  const access =
    cabinet.status === 'ready' && cabinet.snapshot !== null
      ? { status: 'ready' as const, snapshot: cabinet.snapshot, error: null }
      : cabinet.status === 'error'
        ? { status: 'error' as const, snapshot: null, error: cabinet.error }
        : { status: 'loading' as const, snapshot: null, error: null }
  return (
    evaluateModuleAccess(
      quota || quotaResource === undefined ? definition : unmeteredDefinition,
      access,
      'mutation',
    ).kind === 'allowed'
  )
}
const canTransfer = (
  definition: CabinetModuleScreenProps['definition'],
  cabinet: ReturnType<typeof useCabinet>,
) => {
  const { quotaResource: _quotaResource, ...unmeteredDefinition } = definition
  const access =
    cabinet.status === 'ready' && cabinet.snapshot !== null
      ? { status: 'ready' as const, snapshot: cabinet.snapshot, error: null }
      : cabinet.status === 'error'
        ? { status: 'error' as const, snapshot: null, error: cabinet.error }
        : { status: 'loading' as const, snapshot: null, error: null }
  return (
    evaluateModuleAccess(unmeteredDefinition, access, 'mutation').kind ===
    'allowed'
  )
}
const useDialogFocus = (open: boolean) => {
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
/** Reads back a currency code in words so the code is not printed twice. */
const currencyNames: Record<string, string> = {
  UAH: 'Гривня',
  USD: 'Долар США',
  EUR: 'Євро',
  PLN: 'Злотий',
  GBP: 'Фунт стерлінгів',
}
const currencyName = (code: string) => currencyNames[code] ?? code
/** Money reads as one column: digits right-aligned, code beside the figure. */
const eyebrowClass =
  'text-app-dim font-mono text-[10.5px] tracking-[0.12em] uppercase'
const currenciesFromText = (value: string) => [
  ...new Set(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  ),
]
const balancesFromText = (value: string) =>
  Object.fromEntries(
    value
      .split(/[,\n]/)
      .map((item) => item.split(':').map((part) => part.trim()))
      .flatMap(([currency, amount]) => {
        const parsed = Number(amount)
        return currency && amount && Number.isFinite(parsed)
          ? [[currency, parsed] as const]
          : []
      }),
  )

export function CashScreen({ definition }: CabinetModuleScreenProps) {
  const location = useLocation()
  const id = idFromPath(location.pathname)
  if (location.pathname.endsWith('/new') || location.pathname.endsWith('/edit'))
    return (
      <CashRegisterForm
        definition={definition}
        registerId={location.pathname.endsWith('/edit') ? id : null}
      />
    )
  return id ? (
    <CashRegisterDetail definition={definition} registerId={id} />
  ) : (
    <CashOverview definition={definition} />
  )
}

function CashOverview({ definition }: CabinetModuleScreenProps) {
  const cabinet = useCabinet()
  const mutationsAllowed = canMutate(definition, cabinet)
  const [params] = useSearchParams()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const date = params.get('date') ?? localDate(timeZone)
  const [summary, setSummary] = useState<CashDailySummary | null>(null)
  const [registers, setRegisters] = useState<CashRegister[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      cashApi.list(undefined, { signal: controller.signal }),
      cashApi.dailySummary(date, timeZone, { signal: controller.signal }),
    ])
      .then(([list, daily]) => {
        setRegisters(list)
        setSummary(daily)
        setError(null)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(problemMessage(error))
      })
    return () => controller.abort()
  }, [date, timeZone])
  return (
    <PageBody>
      <PageHeader
        actions={
          mutationsAllowed ? (
            <Button asChild variant="primary">
              <Link to="new">
                <Plus aria-hidden />
                Нова каса
              </Link>
            </Button>
          ) : undefined
        }
        eyebrow={`Фінанси · ${date} · ${timeZone}`}
        title="Каси"
      />
      {error && <Notice tone="danger">{error}</Notice>}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {summary?.registers.map((register) => (
          <Panel key={register.id}>
            <h2 className="text-app-ink text-sm font-semibold">
              {register.name}
            </h2>
            <ul className="mt-2 grid gap-2">
              {register.currencies.map((currency) => (
                <li className="grid gap-0.5" key={currency.currency}>
                  <strong className="text-lg font-light tabular-nums text-white">
                    {currency.balance} {currency.currency}
                  </strong>
                  <span className="text-app-dim font-mono text-[11.5px]">
                    {' '}
                    {currency.income} / {currency.expense}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </section>
      <DataTable
        caption="Список кас"
        columns={[
          {
            key: 'name',
            label: 'Каса',
            variant: 'primary',
            cell: (register) => (
              <Link className="hover:text-brand block" to={register.id}>
                {register.name}
              </Link>
            ),
          },
        ]}
        empty={
          <EmptyState
            description="Створіть першу касу, щоб фіксувати надходження та витрати."
            title="Кас поки немає"
          />
        }
        rowKey={(register) => register.id}
        rows={registers}
      />
    </PageBody>
  )
}

function CashRegisterDetail({
  definition,
  registerId,
}: CabinetModuleScreenProps & { registerId: string }) {
  const cabinet = useCabinet()
  const { requireLatestMutation } = useLatestMutationGuard(definition)
  const replayKeys = useCashIdempotencyKeys()
  const mutationsAllowed = canMutate(definition, cabinet, false)
  const transferAllowed = canTransfer(definition, cabinet)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [register, setRegister] = useState<CashRegister | null>(null)
  const [ledger, setLedger] = useState<CashTransaction[]>([])
  const [ledgerTotalPages, setLedgerTotalPages] = useState(0)
  const [transferRegisters, setTransferRegisters] = useState<CashRegister[]>([])
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<'manual_in' | 'manual_out'>('manual_in')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [newCurrency, setNewCurrency] = useState('')
  const [toRegisterId, setToRegisterId] = useState('')
  const [fromCurrency, setFromCurrency] = useState('')
  const [toCurrency, setToCurrency] = useState('')
  const [amountOut, setAmountOut] = useState('')
  const [amountIn, setAmountIn] = useState('')
  const [transferNote, setTransferNote] = useState('')
  const [transferBusy, setTransferBusy] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)
  const [transferStatus, setTransferStatus] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { containFocus, dialogRef, triggerRef } = useDialogFocus(confirmDelete)
  const ledgerCurrency = params.get('currency') ?? undefined
  const ledgerFrom = params.get('from') ?? undefined
  const ledgerTo = params.get('to') ?? undefined
  const ledgerPage = Number(params.get('page') ?? '1') || 1
  const load = useCallback(
    (signal?: AbortSignal) =>
      Promise.all([
        cashApi.getById(registerId, signal ? { signal } : {}),
        cashApi.transactions(
          registerId,
          {
            ...(ledgerCurrency === undefined
              ? {}
              : { currency: ledgerCurrency }),
            ...(ledgerFrom === undefined ? {} : { from: ledgerFrom }),
            ...(ledgerTo === undefined ? {} : { to: ledgerTo }),
            page: ledgerPage,
          },
          signal ? { signal } : {},
        ),
        cashApi.list(true, signal ? { signal } : {}),
      ])
        .then(([account, page, availableRegisters]) => {
          if (!signal?.aborted) {
            setRegister(account)
            setLedger(page.items)
            setLedgerTotalPages(page.totalPages)
            setTransferRegisters(availableRegisters)
            setError(null)
          }
        })
        .catch((error) => {
          if (!signal?.aborted) setError(problemMessage(error))
        }),
    [ledgerCurrency, ledgerFrom, ledgerPage, ledgerTo, registerId],
  )
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])
  const saveMovement = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !amount) return
    setBusy(true)
    const input = {
      type,
      amount: Number(amount),
      currency: currency || null,
      note: note || null,
    }
    try {
      requireLatestMutation({ permission: 'finance.view', quota: false })
      const scope = requireLatestMutation({ quota: false })
      await cashApi.createTransaction(registerId, input, {
        idempotencyKey: replayKeys.forPayload(scope.tenantId, 'movement', {
          registerId,
          input,
        }),
      })
      replayKeys.clear('movement')
      if (scope.signal.aborted) return
      setAmount('')
      setNote('')
      await load()
    } catch (error) {
      if (!isAmbiguousMutationFailure(error)) replayKeys.clear('movement')
      setError(problemMessage(error))
    } finally {
      setBusy(false)
    }
  }
  const mutateRegister = async (
    action: () => Promise<CashRegister | void>,
    reloadAfter = false,
  ) => {
    if (busy) return
    setBusy(true)
    try {
      const scope = requireLatestMutation({ quota: false })
      const result = await action()
      if (scope.signal.aborted) return
      if (result) setRegister(result)
      if (reloadAfter) await load()
      setError(null)
    } catch (mutationError) {
      setError(problemMessage(mutationError))
    } finally {
      setBusy(false)
    }
  }
  const removeRegister = async () => {
    if (busy) return
    setBusy(true)
    try {
      const scope = requireLatestMutation({ quota: false })
      await cashApi.remove(registerId)
      if (scope.signal.aborted) return
      await navigate('..', { replace: true })
    } catch (mutationError) {
      setError(problemMessage(mutationError))
      setBusy(false)
    }
  }
  const saveTransfer = async (event: FormEvent) => {
    event.preventDefault()
    if (
      transferBusy ||
      !transferAllowed ||
      !toRegisterId ||
      !fromCurrency ||
      !toCurrency ||
      !amountOut ||
      !amountIn
    )
      return
    setTransferBusy(true)
    setTransferError(null)
    setTransferStatus(null)
    const input = {
      fromRegisterId: registerId,
      fromCurrency,
      toRegisterId,
      toCurrency,
      amountOut: Number(amountOut),
      amountIn: Number(amountIn),
      note: transferNote.trim() || null,
    }
    try {
      const scope = requireLatestMutation({ quota: false })
      await cashApi.transfer(input, {
        idempotencyKey: replayKeys.forPayload(
          scope.tenantId,
          'transfer',
          input,
        ),
      })
      replayKeys.clear('transfer')
      if (scope.signal.aborted) return
      setAmountOut('')
      setAmountIn('')
      setTransferNote('')
      await load()
      setTransferStatus('Переказ виконано.')
    } catch (transferFailure) {
      if (!isAmbiguousMutationFailure(transferFailure))
        replayKeys.clear('transfer')
      setTransferError(problemMessage(transferFailure))
    } finally {
      setTransferBusy(false)
    }
  }
  if (error && !register)
    return (
      <PageBody width="narrow">
        <ErrorState description={error} title="Не вдалося завантажити касу" />
      </PageBody>
    )
  if (!register)
    return (
      <PageBody width="narrow">
        <SkeletonRows label="Завантажуємо касу…" rows={3} />
      </PageBody>
    )
  const transferDestinations = transferRegisters.filter(
    (candidate) => candidate.id !== registerId && candidate.isActive,
  )
  const transferDestination = transferDestinations.find(
    (candidate) => candidate.id === toRegisterId,
  )
  return (
    <PageBody>
      <PageHeader
        actions={
          <>
            <StatusPill tone={register.isActive ? 'ok' : 'neutral'}>
              {register.isActive ? 'Активна' : 'Неактивна'}
            </StatusPill>
            {mutationsAllowed && (
              <Button asChild variant="primary">
                <Link to="edit">Редагувати</Link>
              </Button>
            )}
          </>
        }
        eyebrow="Гроші · Каси"
        title={register.name}
      />
      {error && <Notice tone="danger">{error}</Notice>}
      <Panel padded={false}>
        <div className="border-app-line flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3.5">
          <h2 className="text-base font-semibold text-white">
            Валюти та баланси
          </h2>
          <p className="text-app-dim text-[12.5px]">
            Баланси рахує сервер після кожної операції
          </p>
        </div>
        {Object.keys(register.balances).length === 0 && (
          <p className="text-app-dim px-4 py-4 text-[13.5px]">
            Валют ще немає. Додайте першу нижче, щоб каса почала вести баланс.
          </p>
        )}
        <dl className="grid gap-3 p-4 empty:hidden">
          {Object.entries(register.balances).map(([code, balance]) => (
            <div
              className="border-app-line bg-app-canvas rounded-control flex flex-wrap items-center gap-3 border px-3.5 py-3"
              key={code}
            >
              <dt className="text-app-muted min-w-0 flex-1 text-[13.5px]">
                {currencyName(code)}
              </dt>
              <dd className="ml-auto flex items-baseline gap-1.5">
                <span className="text-[22px] leading-tight font-light tabular-nums text-white">
                  {balance}
                </span>{' '}
                <span className="text-app-muted text-[12.5px]">{code}</span>
              </dd>
              {mutationsAllowed && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void mutateRegister(
                      () => cashApi.removeCurrency(registerId, code),
                      true,
                    )
                  }
                >
                  <Trash2 aria-hidden />
                  Видалити {code}
                </Button>
              )}
            </div>
          ))}
        </dl>
        {mutationsAllowed && (
          <div className="border-app-line grid gap-3 border-t px-4 py-4">
            <p className="text-app-dim text-[12.5px]">
              Додайте валюту, щоб вести в ній окремий баланс. Валюту з
              ненульовим балансом видалити не можна — спершу зведіть її до нуля.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <Field className="min-w-40 flex-1" label="Нова валюта">
                <TextInput
                  value={newCurrency}
                  onChange={(event) => setNewCurrency(event.target.value)}
                  placeholder="USD"
                />
              </Field>
              <Button
                disabled={busy || !newCurrency.trim()}
                onClick={() =>
                  void mutateRegister(async () => {
                    await cashApi.addCurrency(registerId, newCurrency.trim())
                    setNewCurrency('')
                  }, true)
                }
              >
                <Plus aria-hidden />
                Додати валюту
              </Button>
            </div>
          </div>
        )}
      </Panel>
      {mutationsAllowed && (
        <Panel padded={false}>
          <form
            onSubmit={(event) => void saveMovement(event)}
            className="grid gap-4 p-4"
          >
            <div className="grid gap-1">
              <h2 className="text-base font-semibold text-white">
                Ручна операція
              </h2>
              <p className="text-app-dim text-[12.5px]">
                Запис у журнал цієї каси без переказу та без документа.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Field className="min-w-40 flex-1" label="Тип операції">
                <SelectInput
                  value={type}
                  onChange={(event) =>
                    setType(event.target.value as 'manual_in' | 'manual_out')
                  }
                >
                  <option value="manual_in">Надходження</option>
                  <option value="manual_out">Витрата</option>
                </SelectInput>
              </Field>
              <Field className="min-w-36 flex-1" label="Сума">
                <TextInput
                  numeric
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                />
              </Field>
              <Field
                className="min-w-36 flex-1"
                hint="Порожньо — валюта каси за замовчуванням"
                label="Валюта"
              >
                <TextInput
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                  placeholder="UAH"
                />
              </Field>
            </div>
            <Field hint="Необовʼязково" label="Нотатка">
              <TextInput
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
            {amount.trim() !== '' && (
              <p
                aria-live="polite"
                className="border-app-line bg-app-canvas rounded-control flex flex-wrap items-center justify-between gap-3 border px-3.5 py-3"
              >
                <span className="text-app-muted text-[12.5px]">
                  {type === 'manual_in'
                    ? `Надходження до каси «${register.name}»`
                    : `Витрата з каси «${register.name}»`}
                </span>
                <span
                  className={cn(
                    'ml-auto text-[17px] font-semibold tabular-nums',
                    type === 'manual_in'
                      ? 'text-state-ok'
                      : 'text-state-danger',
                  )}
                >
                  {`${type === 'manual_in' ? '+' : '−'}${amount.trim()}${
                    currency.trim() ? ` ${currency.trim()}` : ''
                  }`}
                </span>
              </p>
            )}
            <div className="border-app-line -mx-4 -mb-4 flex flex-wrap justify-end gap-3 border-t px-4 py-4">
              <Button
                type="submit"
                variant="primary"
                aria-busy={busy}
                disabled={busy || !amount}
              >
                {busy ? 'Зберігаємо…' : 'Записати операцію'}
              </Button>
            </div>
          </form>
        </Panel>
      )}
      {transferAllowed && register.isActive && (
        <section className="grid gap-3">
          <h2 className="text-base font-semibold text-white">
            Переказ між касами
          </h2>
          {transferDestinations.length === 0 ? (
            <Notice role="status" tone="info">
              Переказ потребує ще однієї активної каси. Створіть другу касу або
              активуйте наявну.
            </Notice>
          ) : (
            <Panel padded={false}>
              <form
                className="grid gap-4 p-4"
                onSubmit={(event) => void saveTransfer(event)}
              >
                <div className="border-app-line bg-app-canvas rounded-control grid gap-3 border p-3">
                  <div className="grid gap-1">
                    <p className={eyebrowClass}>Звідки</p>
                    <p className="text-app-ink text-sm font-medium">
                      {register.name}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Field className="min-w-36 flex-1" label="Валюта списання">
                      <SelectInput
                        value={fromCurrency}
                        onChange={(event) =>
                          setFromCurrency(event.target.value)
                        }
                        required
                      >
                        <option value="">Оберіть валюту</option>
                        {Object.keys(register.balances).map((code) => (
                          <option key={code} value={code}>
                            {code}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field className="min-w-36 flex-1" label="Сума списання">
                      <TextInput
                        numeric
                        value={amountOut}
                        onChange={(event) => setAmountOut(event.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                        required
                      />
                    </Field>
                  </div>
                  {fromCurrency && (
                    <p
                      aria-live="polite"
                      className="text-app-dim text-[11.5px] tabular-nums"
                    >
                      Доступно в цій касі:{' '}
                      {register.balances[fromCurrency] ?? '—'} {fromCurrency}
                    </p>
                  )}
                </div>
                <div aria-hidden className="flex items-center gap-3">
                  <span className="bg-app-line h-px flex-1" />
                  <ArrowDown className="text-app-dim size-4 shrink-0" />
                  <span className="bg-app-line h-px flex-1" />
                </div>
                <div className="border-app-line bg-app-canvas rounded-control grid gap-3 border p-3">
                  <div className="grid gap-1.5">
                    <p className={eyebrowClass}>Куди</p>
                    <Field label="Каса-отримувач">
                      <SelectInput
                        value={toRegisterId}
                        onChange={(event) => {
                          setToRegisterId(event.target.value)
                          setToCurrency('')
                        }}
                        required
                      >
                        <option value="">Оберіть касу</option>
                        {transferDestinations.map((destination) => (
                          <option key={destination.id} value={destination.id}>
                            {destination.name}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Field
                      className="min-w-36 flex-1"
                      label="Валюта зарахування"
                    >
                      <SelectInput
                        value={toCurrency}
                        onChange={(event) => setToCurrency(event.target.value)}
                        disabled={!transferDestination}
                        required
                      >
                        <option value="">Оберіть валюту</option>
                        {Object.keys(transferDestination?.balances ?? {}).map(
                          (code) => (
                            <option key={code} value={code}>
                              {code}
                            </option>
                          ),
                        )}
                      </SelectInput>
                    </Field>
                    <Field className="min-w-36 flex-1" label="Сума зарахування">
                      <TextInput
                        numeric
                        value={amountIn}
                        onChange={(event) => setAmountIn(event.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                        required
                      />
                    </Field>
                  </div>
                  {transferDestination && toCurrency && (
                    <p
                      aria-live="polite"
                      className="text-app-dim text-[11.5px] tabular-nums"
                    >
                      Баланс каси-отримувача:{' '}
                      {transferDestination.balances[toCurrency] ?? '—'}{' '}
                      {toCurrency}
                    </p>
                  )}
                </div>
                <Field hint="Необовʼязково" label="Нотатка переказу">
                  <TextInput
                    value={transferNote}
                    onChange={(event) => setTransferNote(event.target.value)}
                  />
                </Field>
                {transferError && (
                  <Notice tone="danger">{transferError}</Notice>
                )}
                {transferStatus && <Notice tone="ok">{transferStatus}</Notice>}
                <div className="border-app-line -mx-4 -mb-4 flex flex-wrap justify-end gap-3 border-t px-4 py-4">
                  <Button
                    type="submit"
                    variant="primary"
                    aria-busy={transferBusy}
                    disabled={
                      transferBusy ||
                      !toRegisterId ||
                      !fromCurrency ||
                      !toCurrency ||
                      !amountOut ||
                      !amountIn
                    }
                  >
                    {transferBusy ? 'Переказуємо…' : 'Переказати кошти'}
                  </Button>
                </div>
              </form>
            </Panel>
          )}
        </section>
      )}
      {mutationsAllowed && (
        <Panel className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 grid gap-1">
            <h2 className="text-base font-semibold text-white">Стан каси</h2>
            <p className="text-app-dim text-[12.5px]">
              {register.isActive
                ? 'Каса активна: у неї можна проводити операції та перекази.'
                : 'Каса неактивна: нові операції та перекази в неї недоступні.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy}
              onClick={() =>
                void mutateRegister(() =>
                  register.isActive
                    ? cashApi.deactivate(registerId)
                    : cashApi.activate(registerId),
                )
              }
            >
              {register.isActive ? 'Деактивувати касу' : 'Активувати касу'}
            </Button>
            <Button
              ref={triggerRef}
              onClick={() => setConfirmDelete(true)}
              variant="danger"
            >
              <Trash2 aria-hidden />
              Видалити касу
            </Button>
          </div>
        </Panel>
      )}
      {confirmDelete && (
        <div
          ref={dialogRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cash-delete-title"
          aria-describedby="cash-delete-description"
          className="bg-app-overlay border-app-line-2 rounded-sheet grid gap-3 border p-5"
          onKeyDown={containFocus}
        >
          <h2
            className="text-lg font-semibold text-white"
            id="cash-delete-title"
          >
            Підтвердити видалення каси
          </h2>
          <p className="text-app-muted text-sm" id="cash-delete-description">
            Каса та її журнал операцій зникнуть назавжди.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button disabled={busy} onClick={() => setConfirmDelete(false)}>
              Скасувати
            </Button>
            <Button
              disabled={busy}
              onClick={() => void removeRegister()}
              variant="danger"
            >
              Підтвердити видалення
            </Button>
          </div>
        </div>
      )}
      <section className="grid gap-3">
        <h2 className="text-base font-semibold text-white">Журнал</h2>
        <Toolbar>
          <Field className="min-w-36 flex-1" label="Валюта журналу">
            <TextInput
              value={params.get('currency') ?? ''}
              onChange={(event) => {
                const next = new URLSearchParams(params)
                if (event.target.value) next.set('currency', event.target.value)
                else next.delete('currency')
                next.set('page', '1')
                setParams(next)
              }}
              placeholder="Усі"
            />
          </Field>
          <Field className="min-w-36 flex-1" label="Від">
            <TextInput
              type="date"
              value={params.get('from') ?? ''}
              onChange={(event) => {
                const next = new URLSearchParams(params)
                if (event.target.value) next.set('from', event.target.value)
                else next.delete('from')
                next.set('page', '1')
                setParams(next)
              }}
            />
          </Field>
          <Field className="min-w-36 flex-1" label="До">
            <TextInput
              type="date"
              value={params.get('to') ?? ''}
              onChange={(event) => {
                const next = new URLSearchParams(params)
                if (event.target.value) next.set('to', event.target.value)
                else next.delete('to')
                next.set('page', '1')
                setParams(next)
              }}
            />
          </Field>
        </Toolbar>
        <DataTable
          caption="Журнал операцій каси"
          columns={[
            {
              key: 'direction',
              label: 'Операція',
              variant: 'primary',
              cell: (entry) => entry.direction,
            },
            {
              key: 'amount',
              label: 'Сума',
              align: 'end',
              cell: (entry) => (
                <span className="tabular-nums">
                  {`${String(entry.amount)} ${entry.currency}`}
                </span>
              ),
            },
            {
              key: 'user',
              label: 'Хто',
              cell: (entry) => entry.createdByName,
            },
          ]}
          empty={
            <EmptyState
              description="Операції зʼявляться тут після першого надходження або витрати."
              title="Журнал порожній"
            />
          }
          footer={
            <Pagination
              label="Сторінки журналу"
              onPage={(nextPage) => {
                const next = new URLSearchParams(params)
                next.set('page', String(nextPage))
                setParams(next)
              }}
              page={ledgerPage}
              totalPages={Math.max(ledgerTotalPages, 1)}
            />
          }
          rowKey={(entry) => entry.id}
          rows={ledger}
        />
      </section>
    </PageBody>
  )
}

function CashRegisterForm({
  definition,
  registerId,
}: CabinetModuleScreenProps & { registerId: string | null }) {
  const cabinet = useCabinet()
  const { requireLatestMutation } = useLatestMutationGuard(definition)
  const mutationsAllowed = canMutate(definition, cabinet, registerId === null)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [type, setType] = useState('cash')
  const [currencies, setCurrencies] = useState('')
  const [initialBalances, setInitialBalances] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (registerId) {
      const controller = new AbortController()
      void cashApi
        .getById(registerId, { signal: controller.signal })
        .then((result) => {
          if (!controller.signal.aborted) {
            setName(result.name)
            setType(result.type)
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted) setError(problemMessage(error))
        })
      return () => controller.abort()
    }
  }, [registerId])
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !name.trim()) return
    setBusy(true)
    try {
      const scope = requireLatestMutation({ quota: registerId === null })
      const result = registerId
        ? await cashApi.update(registerId, { name: name.trim() })
        : await cashApi.create({
            name: name.trim(),
            type,
            currencies: currenciesFromText(currencies),
            initialBalances: balancesFromText(initialBalances),
          })
      if (scope.signal.aborted) return
      await navigate(`../${result.id}`, { replace: true })
    } catch (error) {
      setError(problemMessage(error))
      setBusy(false)
    }
  }
  return (
    <PageBody width="narrow">
      <PageHeader
        eyebrow="Гроші · Каси"
        title={registerId ? 'Редагувати касу' : 'Нова каса'}
      />
      <Panel padded={false}>
        <form className="grid gap-4 p-4" onSubmit={(event) => void save(event)}>
          <Field hint="Так каса підписана у звітах і переказах" label="Назва">
            <TextInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Основна каса"
            />
          </Field>
          {registerId ? (
            <div className="border-app-line bg-app-canvas rounded-control grid gap-1 border px-3.5 py-3">
              <p className="text-app-muted text-[13.5px]">Тип каси: {type}</p>
              <p className="text-app-dim text-[11.5px]">
                Тип задають при створенні й далі не змінюють. Потрібен інший тип
                — створіть окрему касу.
              </p>
            </div>
          ) : (
            <Field hint="Після створення тип не змінюється" label="Тип">
              <SelectInput
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                <option value="cash">Готівка</option>
                <option value="bank">Банк</option>
              </SelectInput>
            </Field>
          )}
          {!registerId && (
            <>
              <Field hint="Коди валют через кому" label="Валюти">
                <TextInput
                  value={currencies}
                  onChange={(event) => setCurrencies(event.target.value)}
                  placeholder="UAH, USD"
                />
              </Field>
              <Field
                hint="Пара «код: сума» через кому або з нового рядка. Необовʼязково — можна почати з нуля."
                label="Початкові баланси"
              >
                <TextArea
                  className="font-mono"
                  value={initialBalances}
                  onChange={(event) => setInitialBalances(event.target.value)}
                  placeholder="UAH: 1000, USD: 25"
                />
              </Field>
            </>
          )}
          {!mutationsAllowed && (
            <Notice tone="warn">
              Зберегти не вдасться: бракує права finance.manage або вичерпано
              ліміт кас у тарифі. Попросіть власника кабінету відкрити доступ чи
              змінити тариф.
            </Notice>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="border-app-line -mx-4 -mb-4 flex flex-wrap justify-end gap-3 border-t px-4 py-4">
            <Button asChild>
              <Link to={registerId ? `../${registerId}` : '..'}>Скасувати</Link>
            </Button>
            <Button
              type="submit"
              variant="primary"
              aria-busy={busy}
              disabled={!mutationsAllowed || busy || !name.trim()}
            >
              {busy ? 'Зберігаємо…' : 'Зберегти'}
            </Button>
          </div>
        </form>
      </Panel>
    </PageBody>
  )
}
