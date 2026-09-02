import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import {
  Button,
  EmptyState,
  Notice,
  PageBody,
  PageHeader,
  SkeletonRows,
} from '@/components/app'
import { reportsApi, type ReportJob } from '@/api/reports'
import { useCabinet } from '../CabinetContext'
import type { CabinetModuleScreenProps } from '../ModuleBoundary'
import { tenantRequestScope } from '../tenant-request-scope'
import { useLatestMutationGuard } from '../use-latest-mutation-guard'

const POLL_INTERVAL_MS = 5_000

type DisplayStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'unknown'

interface DateRange {
  from: string
  to: string
}

interface Scope {
  key: string
}

interface ScopedFlight {
  key: string
  controller: AbortController
}

interface ScopedError {
  key: string
  message: string
}

interface ScopedDownload {
  key: string
  id: string
}

const EMPTY_REPORTS: ReportJob[] = []

const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`

const initialRange = (): DateRange => {
  const today = new Date()
  const from = new Date(today)
  from.setDate(from.getDate() - 6)
  return { from: localDate(from), to: localDate(today) }
}

const isCalendarDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

const validRange = (range: DateRange) =>
  isCalendarDate(range.from) &&
  isCalendarDate(range.to) &&
  range.from <= range.to

const localDayBoundaryUtc = (value: string, endOfDay: boolean) => {
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  return new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  ).toISOString()
}

const statusOf = (report: ReportJob): DisplayStatus => {
  if (
    report.status === 'expired' ||
    (report.status === 'completed' &&
      Date.parse(report.expiresAt) <= Date.now())
  ) {
    return 'expired'
  }
  if (report.status === 'queued') return 'queued'
  if (report.status === 'processing' || report.status === 'running') {
    return 'processing'
  }
  if (report.status === 'completed') return 'completed'
  if (report.status === 'failed') return 'failed'
  return 'unknown'
}

const statusLabel: Record<DisplayStatus, string> = {
  queued: 'Звіт у черзі',
  processing: 'Звіт обробляється',
  completed: 'Звіт готовий',
  failed: 'Не вдалося сформувати звіт',
  expired: 'Строк дії звіту завершився',
  unknown: 'Невідомий стан звіту',
}

const isPollingStatus = (status: DisplayStatus) =>
  status === 'queued' || status === 'processing'

const sameReport = (left: ReportJob, right: ReportJob) =>
  left.id === right.id &&
  left.type === right.type &&
  left.status === right.status &&
  left.stage === right.stage &&
  left.progress === right.progress &&
  left.itemsTotal === right.itemsTotal &&
  left.itemsProcessed === right.itemsProcessed &&
  left.requestedAt === right.requestedAt &&
  left.startedAt === right.startedAt &&
  left.completedAt === right.completedAt &&
  left.expiresAt === right.expiresAt &&
  left.errorMessage === right.errorMessage &&
  left.fileSizeBytes === right.fileSizeBytes

export const ReportsScreen: ComponentType<CabinetModuleScreenProps> = ({
  definition,
}) => {
  const cabinet = useCabinet()
  const { requireLatestMutation } = useLatestMutationGuard(definition)
  const scope = useMemo<Scope | null>(() => {
    const snapshot = cabinet.snapshot
    if (cabinet.status !== 'ready' || snapshot === null) return null
    return {
      key: `${snapshot.userId}:${snapshot.tenantId}:${snapshot.generation}`,
    }
  }, [cabinet.snapshot, cabinet.status])
  const canManage = cabinet.snapshot?.permissions.has('reports.manage') ?? false
  const [range, setRange] = useState<DateRange>(initialRange)
  const [reports, setReports] = useState<ReportJob[]>([])
  const [reportsScopeKey, setReportsScopeKey] = useState<string | null>(null)
  const [settledScopeKey, setSettledScopeKey] = useState<string | null>(null)
  const [error, setError] = useState<ScopedError | null>(null)
  const [creatingScopeKey, setCreatingScopeKey] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<ScopedDownload | null>(null)
  const currentScopeRef = useRef(scope?.key ?? null)
  const accessRef = useRef({
    key: scope?.key ?? null,
    permissions: cabinet.snapshot?.permissions ?? null,
  })
  const createFlightRef = useRef<ScopedFlight | null>(null)
  const downloadFlightRef = useRef<ScopedFlight | null>(null)

  const scopeKey = scope?.key ?? null
  const visibleReports = reportsScopeKey === scopeKey ? reports : EMPTY_REPORTS
  const isLoading = scopeKey !== null && settledScopeKey !== scopeKey
  const visibleError = error?.key === scopeKey ? error.message : null
  const isCreating = creatingScopeKey === scopeKey
  const currentDownloading =
    downloading?.key === scopeKey ? downloading.id : null

  useEffect(() => {
    currentScopeRef.current = scopeKey
    accessRef.current = {
      key: scopeKey,
      permissions: cabinet.snapshot?.permissions ?? null,
    }
  }, [cabinet.snapshot, scopeKey])

  useEffect(() => {
    const key = scopeKey
    createFlightRef.current?.controller.abort('tenant-scope-changed')
    downloadFlightRef.current?.controller.abort('tenant-scope-changed')
    if (key === null) return

    const controller = new AbortController()
    const signal = AbortSignal.any([
      controller.signal,
      tenantRequestScope.signal,
    ])
    void reportsApi
      .list({ page: 1, pageSize: 20 }, { signal })
      .then((page) => {
        if (signal.aborted || currentScopeRef.current !== key) return
        setReports(page.items)
        setReportsScopeKey(key)
      })
      .catch(() => {
        if (!signal.aborted && currentScopeRef.current === key) {
          setError({ key, message: 'Не вдалося завантажити звіти.' })
        }
      })
      .finally(() => {
        if (!signal.aborted && currentScopeRef.current === key) {
          setSettledScopeKey(key)
        }
      })
    return () => controller.abort('report-list-invalidated')
  }, [scope, scopeKey])

  const pollableIdsKey = useMemo(
    () =>
      visibleReports
        .filter((report) => isPollingStatus(statusOf(report)))
        .map((report) => report.id)
        .join('|'),
    [visibleReports],
  )

  useEffect(() => {
    const key = scopeKey
    if (key === null || pollableIdsKey === '') return
    const reportIds = pollableIdsKey.split('|')
    const controller = new AbortController()
    const signal = AbortSignal.any([
      controller.signal,
      tenantRequestScope.signal,
    ])
    const inFlight = new Set<string>()
    const poll = async () => {
      await Promise.all(
        reportIds.map(async (reportId) => {
          if (inFlight.has(reportId) || signal.aborted) return
          inFlight.add(reportId)
          try {
            const next = await reportsApi.get(reportId, { signal })
            if (signal.aborted || currentScopeRef.current !== key) return
            setReports((current) => {
              const previous = current.find((item) => item.id === next.id)
              if (previous === undefined || sameReport(previous, next)) {
                return current
              }
              return current.map((item) => (item.id === next.id ? next : item))
            })
            setReportsScopeKey(key)
          } catch {
            // A later interval can recover a transient polling error.
          } finally {
            inFlight.delete(reportId)
          }
        }),
      )
    }
    void poll()
    const interval = window.setInterval(() => void poll(), POLL_INTERVAL_MS)
    return () => {
      window.clearInterval(interval)
      controller.abort('report-poll-invalidated')
    }
  }, [pollableIdsKey, scopeKey])

  const createReport = useCallback(async () => {
    const access = accessRef.current
    if (access.key === null || !access.permissions?.has('reports.manage')) {
      if (access.key !== null && currentScopeRef.current === access.key) {
        setError({
          key: access.key,
          message: 'Недостатньо прав для створення звіту.',
        })
      }
      return
    }
    if (!validRange(range)) return
    if (createFlightRef.current !== null) return
    const controller = new AbortController()
    let signal: AbortSignal = controller.signal
    createFlightRef.current = { key: access.key, controller }
    setCreatingScopeKey(access.key)
    try {
      const mutationScope = requireLatestMutation({ quota: false })
      requireLatestMutation({ permission: 'finance.view', quota: false })
      signal = AbortSignal.any([controller.signal, mutationScope.signal])
      const created = await reportsApi.create(
        {
          type: 'carSales',
          carSales: {
            from: localDayBoundaryUtc(range.from, false),
            to: localDayBoundaryUtc(range.to, true),
          },
        },
        { signal },
      )
      if (signal.aborted || currentScopeRef.current !== access.key) return
      setReports((current) => [
        created,
        ...current.filter((report) => report.id !== created.id),
      ])
      setReportsScopeKey(access.key)
    } catch {
      if (!signal.aborted && currentScopeRef.current === access.key) {
        setError({ key: access.key, message: 'Не вдалося створити звіт.' })
      }
    } finally {
      if (createFlightRef.current?.controller === controller) {
        createFlightRef.current = null
        if (currentScopeRef.current === access.key) setCreatingScopeKey(null)
      }
    }
  }, [range, requireLatestMutation])

  const download = async (report: ReportJob, print: boolean) => {
    const access = accessRef.current
    if (
      statusOf(report) !== 'completed' ||
      currentDownloading !== null ||
      access.key === null
    ) {
      return
    }
    const popup = print ? window.open('', '_blank', 'noopener') : null
    const controller = new AbortController()
    const signal = AbortSignal.any([
      controller.signal,
      tenantRequestScope.signal,
    ])
    downloadFlightRef.current?.controller.abort('report-download-replaced')
    downloadFlightRef.current = { key: access.key, controller }
    setDownloading({ key: access.key, id: report.id })
    try {
      const file = await reportsApi.download(report.id, { signal })
      if (signal.aborted || currentScopeRef.current !== access.key) {
        popup?.close()
        return
      }
      const url = URL.createObjectURL(file.blob)
      if (print && popup) {
        popup.addEventListener('load', () => popup.print(), { once: true })
        popup.location.href = url
      } else if (!print) {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = file.filename
        anchor.click()
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      popup?.close()
      if (!signal.aborted && currentScopeRef.current === access.key) {
        setError({ key: access.key, message: 'Не вдалося завантажити звіт.' })
      }
    } finally {
      if (downloadFlightRef.current?.controller === controller) {
        downloadFlightRef.current = null
        if (currentScopeRef.current === access.key) setDownloading(null)
      }
    }
  }

  const rangeIsValid = validRange(range)

  return (
    <PageBody aria-labelledby="reports-title" className="max-w-4xl gap-6">
      <PageHeader
        eyebrow="Гроші"
        title={<span id="reports-title">Звіти</span>}
      />
      <p className="text-app-muted text-sm">
        Формуйте PDF-звіти з продажів за обраний період.
      </p>

      {canManage ? (
        <form
          aria-label="Створення звіту"
          className="border-app-line rounded-panel bg-app-raised grid gap-4 border p-5"
          onSubmit={(event) => {
            event.preventDefault()
            void createReport()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label
              className="text-app-muted grid gap-2 text-[12.5px]"
              htmlFor="report-from"
            >
              Початок періоду
              <input
                className="bg-app-input border-app-line-2 rounded-control text-app-ink min-h-11 border px-3 text-sm"
                id="report-from"
                max={range.to}
                onChange={(event) =>
                  setRange((current) => ({
                    ...current,
                    from: event.target.value,
                  }))
                }
                required
                type="date"
                value={range.from}
              />
            </label>
            <label
              className="text-app-muted grid gap-2 text-[12.5px]"
              htmlFor="report-to"
            >
              Кінець періоду
              <input
                className="bg-app-input border-app-line-2 rounded-control text-app-ink min-h-11 border px-3 text-sm"
                id="report-to"
                min={range.from}
                onChange={(event) =>
                  setRange((current) => ({
                    ...current,
                    to: event.target.value,
                  }))
                }
                required
                type="date"
                value={range.to}
              />
            </label>
          </div>
          <Button
            className="justify-self-start"
            disabled={isCreating || !rangeIsValid}
            type="submit"
            variant="primary"
          >
            {isCreating ? 'Створюємо…' : 'Створити звіт'}
          </Button>
        </form>
      ) : null}

      {visibleError ? <Notice tone="danger">{visibleError}</Notice> : null}
      {isLoading ? <SkeletonRows label="Завантажуємо звіти…" rows={3} /> : null}
      {!isLoading && visibleReports.length === 0 ? (
        <EmptyState
          description="Оберіть період і сформуйте перший звіт — він з’явиться у цьому списку."
          title="Ще немає звітів"
        />
      ) : null}

      <div aria-label="Список звітів" className="grid gap-3">
        {visibleReports.map((report) => {
          const status = statusOf(report)
          return (
            <article
              className="border-app-line rounded-panel bg-app-raised border p-4"
              key={report.id}
            >
              <h2 className="text-lg text-white">{statusLabel[status]}</h2>
              {isPollingStatus(status) ? (
                <p aria-live="polite" role="status">
                  {status === 'processing'
                    ? `Оброблено ${report.progress}%`
                    : 'Очікуємо на обробку'}
                </p>
              ) : null}
              {status === 'failed' && report.errorMessage ? (
                <p>{report.errorMessage}</p>
              ) : null}
              {status === 'completed' ? (
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button
                    disabled={currentDownloading !== null}
                    onClick={() => void download(report, false)}
                    variant="primary"
                  >
                    Завантажити PDF
                  </Button>
                  <Button
                    disabled={currentDownloading !== null}
                    onClick={() => void download(report, true)}
                  >
                    Друкувати
                  </Button>
                </div>
              ) : null}
              {canManage && (status === 'failed' || status === 'expired') ? (
                <Button
                  className="mt-3"
                  disabled={isCreating || !rangeIsValid}
                  onClick={() => void createReport()}
                >
                  {status === 'failed'
                    ? 'Створити заміну'
                    : 'Створити новий звіт'}
                </Button>
              ) : null}
            </article>
          )
        })}
      </div>
    </PageBody>
  )
}
