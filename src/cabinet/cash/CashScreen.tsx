import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { Plus } from 'lucide-react'
import {
  Button,
  DataTable,
  EmptyState,
  Notice,
  PageBody,
  PageHeader,
  Panel,
} from '@/components/app'
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
  if (error && !register) return <p role="alert">{error}</p>
  if (!register) return <p role="status">Завантажуємо касу…</p>
  const transferDestinations = transferRegisters.filter(
    (candidate) => candidate.id !== registerId && candidate.isActive,
  )
  const transferDestination = transferDestinations.find(
    (candidate) => candidate.id === toRegisterId,
  )
  return (
    <section className="grid gap-6">
      <header>
        <h1 className="text-3xl text-white">{register.name}</h1>
        {mutationsAllowed && <Link to="edit">Редагувати</Link>}
      </header>
      {error && <p role="alert">{error}</p>}
      <dl>
        {Object.entries(register.balances).map(([code, balance]) => (
          <div key={code}>
            <dt>{code}</dt>
            <dd>{balance}</dd>
            {mutationsAllowed && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void mutateRegister(
                    () => cashApi.removeCurrency(registerId, code),
                    true,
                  )
                }
              >
                Видалити {code}
              </button>
            )}
          </div>
        ))}
      </dl>
      {mutationsAllowed && (
        <div className="grid gap-3">
          <label>
            Нова валюта
            <input
              value={newCurrency}
              onChange={(event) => setNewCurrency(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy || !newCurrency.trim()}
            onClick={() =>
              void mutateRegister(async () => {
                await cashApi.addCurrency(registerId, newCurrency.trim())
                setNewCurrency('')
              }, true)
            }
          >
            Додати валюту
          </button>
          <button
            type="button"
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
          </button>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setConfirmDelete(true)}
          >
            Видалити касу
          </button>
        </div>
      )}
      {confirmDelete && (
        <div
          ref={dialogRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cash-delete-title"
          aria-describedby="cash-delete-description"
          onKeyDown={containFocus}
        >
          <h2 id="cash-delete-title">Підтвердити видалення каси</h2>
          <p id="cash-delete-description">Видалити касу?</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void removeRegister()}
            autoFocus
          >
            Підтвердити видалення
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmDelete(false)}
          >
            Скасувати
          </button>
        </div>
      )}
      {transferAllowed && register.isActive && (
        <section className="grid gap-3">
          <h2>Переказ між касами</h2>
          {transferDestinations.length === 0 ? (
            <p role="status">Немає іншої активної каси для переказу.</p>
          ) : (
            <form onSubmit={(event) => void saveTransfer(event)}>
              <p>Каса-відправник: {register.name}</p>
              <label>
                Каса-отримувач
                <select
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
                </select>
              </label>
              <label>
                Валюта списання
                <select
                  value={fromCurrency}
                  onChange={(event) => setFromCurrency(event.target.value)}
                  required
                >
                  <option value="">Оберіть валюту</option>
                  {Object.keys(register.balances).map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Сума списання
                <input
                  value={amountOut}
                  onChange={(event) => setAmountOut(event.target.value)}
                  inputMode="decimal"
                  required
                />
              </label>
              <label>
                Валюта зарахування
                <select
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
                </select>
              </label>
              <label>
                Сума зарахування
                <input
                  value={amountIn}
                  onChange={(event) => setAmountIn(event.target.value)}
                  inputMode="decimal"
                  required
                />
              </label>
              <label>
                Нотатка переказу
                <input
                  value={transferNote}
                  onChange={(event) => setTransferNote(event.target.value)}
                />
              </label>
              {transferDestination && toCurrency && (
                <p aria-live="polite">
                  Баланс каси-отримувача:{' '}
                  {transferDestination.balances[toCurrency] ?? '—'} {toCurrency}
                </p>
              )}
              {transferError && <p role="alert">{transferError}</p>}
              {transferStatus && <p role="status">{transferStatus}</p>}
              <button
                type="submit"
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
              </button>
            </form>
          )}
        </section>
      )}
      {mutationsAllowed && (
        <form
          onSubmit={(event) => void saveMovement(event)}
          className="grid gap-3"
        >
          <h2>Ручна операція</h2>
          <label>
            Тип
            <select
              value={type}
              onChange={(event) =>
                setType(event.target.value as 'manual_in' | 'manual_out')
              }
            >
              <option value="manual_in">Надходження</option>
              <option value="manual_out">Витрата</option>
            </select>
          </label>
          <label>
            Сума
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
            />
          </label>
          <label>
            Валюта
            <input
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            />
          </label>
          <label>
            Нотатка
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || !amount}>
            {busy ? 'Зберігаємо…' : 'Записати операцію'}
          </button>
        </form>
      )}
      <section>
        <h2>Журнал</h2>
        <div className="flex gap-2">
          <label>
            Валюта журналу
            <input
              value={params.get('currency') ?? ''}
              onChange={(event) => {
                const next = new URLSearchParams(params)
                if (event.target.value) next.set('currency', event.target.value)
                else next.delete('currency')
                next.set('page', '1')
                setParams(next)
              }}
            />
          </label>
          <label>
            Від
            <input
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
          </label>
          <label>
            До
            <input
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
          </label>
        </div>
        <ul>
          {ledger.map((entry) => (
            <li key={entry.id}>
              {entry.direction} · {entry.amount} {entry.currency} ·{' '}
              {entry.createdByName}
            </li>
          ))}
        </ul>
        <nav aria-label="Сторінки журналу" className="flex gap-3">
          <button
            type="button"
            disabled={ledgerPage <= 1}
            onClick={() => {
              const next = new URLSearchParams(params)
              next.set('page', String(ledgerPage - 1))
              setParams(next)
            }}
          >
            Попередня сторінка
          </button>
          <span>
            Сторінка {ledgerPage} з {Math.max(ledgerTotalPages, 1)}
          </span>
          <button
            type="button"
            disabled={ledgerTotalPages === 0 || ledgerPage >= ledgerTotalPages}
            onClick={() => {
              const next = new URLSearchParams(params)
              next.set('page', String(ledgerPage + 1))
              setParams(next)
            }}
          >
            Наступна сторінка
          </button>
        </nav>
      </section>
    </section>
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
    <section>
      <h1>{registerId ? 'Редагувати касу' : 'Нова каса'}</h1>
      <form onSubmit={(event) => void save(event)}>
        <label>
          Назва
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {registerId ? (
          <p>Тип каси: {type}</p>
        ) : (
          <label>
            Тип
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="cash">Готівка</option>
              <option value="bank">Банк</option>
            </select>
          </label>
        )}
        {!registerId && (
          <>
            <label>
              Валюти
              <input
                value={currencies}
                onChange={(event) => setCurrencies(event.target.value)}
                placeholder="UAH, USD"
              />
            </label>
            <label>
              Початкові баланси
              <textarea
                value={initialBalances}
                onChange={(event) => setInitialBalances(event.target.value)}
                placeholder="UAH: 1000, USD: 25"
              />
            </label>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <button
          type="submit"
          disabled={!mutationsAllowed || busy || !name.trim()}
        >
          {busy ? 'Зберігаємо…' : 'Зберегти'}
        </button>
      </form>
    </section>
  )
}
