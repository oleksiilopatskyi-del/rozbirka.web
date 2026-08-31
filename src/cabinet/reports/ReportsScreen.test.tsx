/* eslint-disable @typescript-eslint/unbound-method -- Vitest mocked API singleton methods are invoked by the screen. */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CabinetModuleScreenProps } from '../ModuleBoundary'
import { useCabinet, type CabinetContextValue } from '../CabinetContext'
import { reportsApi, type ReportJob } from '@/api/reports'
import { ReportsScreen } from './ReportsScreen'

vi.mock('../CabinetContext', () => ({ useCabinet: vi.fn() }))
vi.mock('@/api/reports', () => ({
  reportsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    download: vi.fn(),
  },
}))

const report = (status: ReportJob['status']): ReportJob => ({
  id: 'report-1',
  type: 'carSales',
  status,
  stage: status,
  progress: status === 'processing' ? 45 : 0,
  itemsTotal: null,
  itemsProcessed: null,
  requestedAt: '2026-08-28T08:00:00Z',
  startedAt: null,
  completedAt: status === 'completed' ? '2026-08-28T08:01:00Z' : null,
  expiresAt: '2026-09-04T08:00:00Z',
  errorMessage: status === 'failed' ? 'Service unavailable' : null,
  fileSizeBytes: status === 'completed' ? 1234 : null,
})

const screenProps = {
  definition: {
    key: 'reports',
    routeSegment: '/reports',
    released: true,
    viewPermission: 'reports.view',
    mutationPermission: 'reports.manage',
  },
} satisfies CabinetModuleScreenProps

function cabinet({
  canManage = true,
  tenantId = 'tenant-1',
  generation = 1,
}: {
  canManage?: boolean
  tenantId?: string
  generation?: number
} = {}) {
  return {
    status: 'ready',
    targetTenant: {
      id: tenantId,
      name: 'Demo Yard',
      slug: tenantId,
      plan: 'active',
      planTier: 'pro',
      city: null,
      logoUrl: null,
      isActive: true,
      createdAt: '2026-08-01T00:00:00Z',
      roleName: 'owner',
    },
    snapshot: {
      userId: 'user-1',
      tenantId,
      generation,
      role: 'owner',
      permissions: new Set(
        canManage
          ? ['reports.manage', 'finance.view']
          : ['reports.view', 'finance.view'],
      ),
      features: new Set<string>(),
      entitlement: null,
      subscription: null,
    },
    error: null,
    retry: vi.fn(),
    switchTenant: vi.fn(),
  } as CabinetContextValue
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.mocked(useCabinet).mockReturnValue(cabinet())
  vi.mocked(reportsApi.list).mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  })
  vi.mocked(reportsApi.get).mockResolvedValue(report('queued'))
  vi.mocked(reportsApi.create).mockResolvedValue(report('queued'))
  vi.mocked(reportsApi.download).mockResolvedValue({
    blob: new Blob(['pdf'], { type: 'application/pdf' }),
    filename: 'sales.pdf',
  })
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:report'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it.each([
  ['queued', 'Звіт у черзі'],
  ['processing', 'Звіт обробляється'],
  ['completed', 'Звіт готовий'],
  ['failed', 'Не вдалося сформувати звіт'],
  ['expired', 'Строк дії звіту завершився'],
] as const)('shows the %s report lifecycle state', async (status, label) => {
  vi.mocked(reportsApi.list).mockResolvedValue({
    items: [report(status)],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  })

  render(<ReportsScreen {...screenProps} />)

  expect(await screen.findByText(label)).toBeVisible()
})

it('shows an unknown backend status without offering a replacement job', async () => {
  vi.mocked(reportsApi.list).mockResolvedValue({
    items: [report('awaiting_manual_review')],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  })

  render(<ReportsScreen {...screenProps} />)

  expect(await screen.findByText('Невідомий стан звіту')).toBeVisible()
  expect(screen.queryByText('Не вдалося сформувати звіт')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Створити заміну' })).toBeNull()
  expect(reportsApi.create).not.toHaveBeenCalled()
})

it('keeps edited range controls stable while unrelated polling updates arrive', async () => {
  const update = deferred<ReportJob>()
  vi.mocked(reportsApi.list).mockResolvedValue({
    items: [report('queued')],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  })
  vi.mocked(reportsApi.get).mockReturnValue(update.promise)
  render(<ReportsScreen {...screenProps} />)
  const user = userEvent.setup()
  const from = await screen.findByLabelText('Початок періоду')

  await user.clear(from)
  await user.type(from, '2026-08-05')
  await waitFor(() => expect(reportsApi.get).toHaveBeenCalledTimes(1))
  update.resolve({ ...report('processing'), progress: 60 })
  await act(() => update.promise)

  expect(from).toHaveValue('2026-08-05')
})

it('renders queued, processing, and completed states from real polling updates', async () => {
  vi.useFakeTimers()
  const processing = deferred<ReportJob>()
  const completed = deferred<ReportJob>()
  vi.mocked(reportsApi.list).mockResolvedValue({
    items: [report('queued')],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  })
  vi.mocked(reportsApi.get)
    .mockReturnValueOnce(processing.promise)
    .mockReturnValueOnce(completed.promise)
  render(<ReportsScreen {...screenProps} />)

  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(screen.getByText('Звіт у черзі')).toBeVisible()
  processing.resolve({ ...report('processing'), progress: 60 })
  await act(() => processing.promise)
  expect(screen.getByText('Звіт обробляється')).toBeVisible()

  void act(() => vi.advanceTimersByTime(5_000))
  completed.resolve(report('completed'))
  await act(() => completed.promise)
  expect(screen.getByText('Звіт готовий')).toBeVisible()
})

it('does not restart an immediate poll or abort siblings for a progress-only update', async () => {
  vi.useFakeTimers()
  const first = deferred<ReportJob>()
  const sibling = deferred<ReportJob>()
  vi.mocked(reportsApi.list).mockResolvedValue({
    items: [report('queued'), { ...report('processing'), id: 'report-2' }],
    page: 1,
    pageSize: 20,
    total: 2,
    totalPages: 1,
  })
  vi.mocked(reportsApi.get)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(sibling.promise)
  render(<ReportsScreen {...screenProps} />)

  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  const siblingSignal = vi.mocked(reportsApi.get).mock.calls[1]?.[1]?.signal
  first.resolve({ ...report('processing'), progress: 60 })
  await act(() => first.promise)

  expect(reportsApi.get).toHaveBeenCalledTimes(2)
  expect(siblingSignal?.aborted).toBe(false)
  void act(() => vi.advanceTimersByTime(5_000))
  expect(reportsApi.get).toHaveBeenCalledTimes(3)
})

it('polls every queued or processing job through processing and completion', async () => {
  vi.mocked(reportsApi.list).mockResolvedValue({
    items: [report('queued'), { ...report('processing'), id: 'report-2' }],
    page: 1,
    pageSize: 20,
    total: 2,
    totalPages: 1,
  })
  vi.mocked(reportsApi.get)
    .mockResolvedValueOnce({ ...report('processing'), progress: 60 })
    .mockResolvedValueOnce({ ...report('completed'), id: 'report-2' })
  render(<ReportsScreen {...screenProps} />)

  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })

  const calls = vi.mocked(reportsApi.get).mock.calls
  expect(
    calls.some(
      ([id, options]) =>
        id === 'report-1' && options?.signal instanceof AbortSignal,
    ),
  ).toBe(true)
  expect(
    calls.some(
      ([id, options]) =>
        id === 'report-2' && options?.signal instanceof AbortSignal,
    ),
  ).toBe(true)
})

it('creates only one replacement job for a single failed-job retry action', async () => {
  const pending = deferred<ReportJob>()
  vi.mocked(reportsApi.list).mockResolvedValue({
    items: [report('failed')],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  })
  vi.mocked(reportsApi.create).mockReturnValue(pending.promise)
  render(<ReportsScreen {...screenProps} />)
  const user = userEvent.setup()

  await user.click(
    await screen.findByRole('button', { name: 'Створити заміну' }),
  )
  await user.click(screen.getByRole('button', { name: 'Створити заміну' }))

  expect(reportsApi.create).toHaveBeenCalledTimes(1)
  act(() => {
    pending.resolve(report('queued'))
  })
})

it('downloads or prints a completed report through the authenticated API helper', async () => {
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined)
  const open = vi.spyOn(window, 'open').mockReturnValue(null)
  vi.mocked(reportsApi.list).mockResolvedValue({
    items: [report('completed')],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  })
  render(<ReportsScreen {...screenProps} />)
  const user = userEvent.setup()

  await user.click(
    await screen.findByRole('button', { name: 'Завантажити PDF' }),
  )
  await user.click(screen.getByRole('button', { name: 'Друкувати' }))

  await waitFor(() => expect(reportsApi.download).toHaveBeenCalledTimes(2))
  expect(click).toHaveBeenCalledTimes(1)
  expect(open).toHaveBeenCalledWith('', '_blank', 'noopener')
})

it('pre-opens a print window synchronously and closes it when download fails', async () => {
  const pending = deferred<Awaited<ReturnType<typeof reportsApi.download>>>()
  const close = vi.fn()
  vi.spyOn(window, 'open').mockReturnValue({ close } as unknown as Window)
  vi.mocked(reportsApi.list).mockResolvedValue({
    items: [report('completed')],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  })
  vi.mocked(reportsApi.download).mockReturnValue(pending.promise)
  render(<ReportsScreen {...screenProps} />)

  await userEvent
    .setup()
    .click(await screen.findByRole('button', { name: 'Друкувати' }))
  expect(window.open).toHaveBeenCalledWith('', '_blank', 'noopener')

  pending.reject(new Error('offline'))
  await act(() => pending.promise.catch(() => undefined))
  expect(close).toHaveBeenCalledTimes(1)
})

it('recovers an expired report by creating a replacement with the selected range', async () => {
  vi.mocked(reportsApi.list).mockResolvedValue({
    items: [report('expired')],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  })
  render(<ReportsScreen {...screenProps} />)
  const user = userEvent.setup()

  await user.click(
    await screen.findByRole('button', { name: 'Створити новий звіт' }),
  )

  const [request, options] = vi.mocked(reportsApi.create).mock.calls[0] ?? []
  expect(request).toMatchObject({ type: 'carSales' })
  expect(options?.signal).toBeInstanceOf(AbortSignal)
})

it('serializes Europe/Kyiv winter-to-summer calendar boundaries as inclusive UTC instants', async () => {
  const originalTimeZone = process.env['TZ']
  process.env['TZ'] = 'Europe/Kyiv'

  try {
    render(<ReportsScreen {...screenProps} />)
    fireEvent.change(await screen.findByLabelText('Початок періоду'), {
      target: { value: '2026-01-15' },
    })
    fireEvent.change(screen.getByLabelText('Кінець періоду'), {
      target: { value: '2026-07-15' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Створити звіт' }))

    await waitFor(() => expect(reportsApi.create).toHaveBeenCalledTimes(1))
    const [request] = vi.mocked(reportsApi.create).mock.calls[0] ?? []
    expect(request?.carSales).toEqual({
      from: '2026-01-14T22:00:00.000Z',
      to: '2026-07-15T20:59:59.999Z',
    })
  } finally {
    if (originalTimeZone === undefined) delete process.env['TZ']
    else process.env['TZ'] = originalTimeZone
  }
})

it('hides report creation and retry actions when management is denied', async () => {
  vi.mocked(useCabinet).mockReturnValue(cabinet({ canManage: false }))
  vi.mocked(reportsApi.list).mockResolvedValue({
    items: [report('failed')],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  })
  render(<ReportsScreen {...screenProps} />)

  await screen.findByText('Не вдалося сформувати звіт')
  expect(screen.queryByRole('button', { name: 'Створити звіт' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Створити заміну' })).toBeNull()
})

it('re-checks reports.manage when a visible retry is dispatched', async () => {
  vi.mocked(reportsApi.list).mockResolvedValue({
    items: [report('failed')],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  })
  const view = render(<ReportsScreen {...screenProps} />)
  const retry = await screen.findByRole('button', { name: 'Створити заміну' })

  vi.mocked(useCabinet).mockReturnValue(cabinet({ canManage: false }))
  view.rerender(<ReportsScreen {...screenProps} />)
  retry.click()

  expect(reportsApi.create).not.toHaveBeenCalled()
})

it('blocks a still-visible retry when the current permission set loses reports.manage', async () => {
  const liveCabinet = cabinet()
  vi.mocked(useCabinet).mockReturnValue(liveCabinet)
  vi.mocked(reportsApi.list).mockResolvedValue({
    items: [report('failed')],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  })
  render(<ReportsScreen {...screenProps} />)
  const retry = await screen.findByRole('button', { name: 'Створити заміну' })

  const mutablePermissions = liveCabinet.snapshot?.permissions as
    | Set<string>
    | undefined
  mutablePermissions?.delete('reports.manage')
  expect(retry).toBeVisible()
  await userEvent.setup().click(retry)

  expect(reportsApi.create).not.toHaveBeenCalled()
  expect(await screen.findByRole('alert')).toHaveTextContent('Недостатньо прав')
})

it('blocks report creation when the latest finance.view permission is revoked', async () => {
  const liveCabinet = cabinet()
  vi.mocked(useCabinet).mockReturnValue(liveCabinet)
  render(<ReportsScreen {...screenProps} />)
  const create = await screen.findByRole('button', { name: 'Створити звіт' })

  const mutablePermissions = liveCabinet.snapshot?.permissions as
    | Set<string>
    | undefined
  mutablePermissions?.delete('finance.view')
  await userEvent.setup().click(create)

  expect(reportsApi.create).not.toHaveBeenCalled()
})

it('clears and reloads report data on a tenant generation change without accepting stale results', async () => {
  const oldList = deferred<Awaited<ReturnType<typeof reportsApi.list>>>()
  const newList = deferred<Awaited<ReturnType<typeof reportsApi.list>>>()
  vi.mocked(reportsApi.list)
    .mockReturnValueOnce(oldList.promise)
    .mockReturnValueOnce(newList.promise)
  const view = render(<ReportsScreen {...screenProps} />)

  await waitFor(() => expect(reportsApi.list).toHaveBeenCalledTimes(1))
  const oldSignal = vi.mocked(reportsApi.list).mock.calls[0]?.[1]?.signal
  vi.mocked(useCabinet).mockReturnValue(
    cabinet({ tenantId: 'tenant-2', generation: 2 }),
  )
  view.rerender(<ReportsScreen {...screenProps} />)

  await waitFor(() => expect(reportsApi.list).toHaveBeenCalledTimes(2))
  expect(oldSignal?.aborted).toBe(true)
  act(() =>
    oldList.resolve({
      items: [{ ...report('completed'), id: 'old-report' }],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    }),
  )
  expect(screen.queryByText('Звіт готовий')).toBeNull()

  act(() =>
    newList.resolve({
      items: [{ ...report('queued'), id: 'new-report' }],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    }),
  )
  expect(await screen.findByText('Звіт у черзі')).toBeVisible()
})

it('aborts detail, create, and download work on tenant change and suppresses their stale results', async () => {
  const detail = deferred<ReportJob>()
  const create = deferred<ReportJob>()
  const download = deferred<Awaited<ReturnType<typeof reportsApi.download>>>()
  vi.mocked(reportsApi.list)
    .mockResolvedValueOnce({
      items: [report('queued'), { ...report('completed'), id: 'completed-1' }],
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    })
    .mockResolvedValueOnce({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    })
  vi.mocked(reportsApi.get).mockReturnValue(detail.promise)
  vi.mocked(reportsApi.create).mockReturnValue(create.promise)
  vi.mocked(reportsApi.download).mockReturnValue(download.promise)
  const view = render(<ReportsScreen {...screenProps} />)
  const user = userEvent.setup()

  await user.click(await screen.findByRole('button', { name: 'Створити звіт' }))
  await user.click(screen.getByRole('button', { name: 'Завантажити PDF' }))
  await waitFor(() => expect(reportsApi.get).toHaveBeenCalledTimes(1))
  const detailSignal = vi.mocked(reportsApi.get).mock.calls[0]?.[1]?.signal
  const createSignal = vi.mocked(reportsApi.create).mock.calls[0]?.[1]?.signal
  const downloadSignal = vi.mocked(reportsApi.download).mock.calls[0]?.[1]
    ?.signal

  vi.mocked(useCabinet).mockReturnValue(
    cabinet({ tenantId: 'tenant-2', generation: 2 }),
  )
  view.rerender(<ReportsScreen {...screenProps} />)

  await waitFor(() => expect(reportsApi.list).toHaveBeenCalledTimes(2))
  expect(detailSignal?.aborted).toBe(true)
  expect(createSignal?.aborted).toBe(true)
  expect(downloadSignal?.aborted).toBe(true)
  act(() => {
    detail.resolve(report('completed'))
    create.resolve({ ...report('completed'), id: 'stale-create' })
    download.resolve({
      blob: new Blob(['stale']),
      filename: 'stale.pdf',
    })
  })

  expect(screen.queryByText('Звіт готовий')).toBeNull()
})

it('blocks empty and reversed local calendar ranges before dispatch', async () => {
  render(<ReportsScreen {...screenProps} />)
  const from = await screen.findByLabelText('Початок періоду')
  const to = screen.getByLabelText('Кінець періоду')
  const create = screen.getByRole('button', { name: 'Створити звіт' })

  fireEvent.change(from, { target: { value: '' } })
  expect(create).toBeDisabled()
  fireEvent.change(from, { target: { value: '2026-08-31' } })
  fireEvent.change(to, { target: { value: '2026-08-01' } })
  expect(create).toBeDisabled()
  expect(reportsApi.create).not.toHaveBeenCalled()
})

it('aborts stale report polling when the screen unmounts', async () => {
  const pending = deferred<Awaited<ReturnType<typeof reportsApi.list>>>()
  vi.mocked(reportsApi.list).mockReturnValue(pending.promise)
  const view = render(<ReportsScreen {...screenProps} />)

  await waitFor(() => expect(reportsApi.list).toHaveBeenCalledTimes(1))
  const signal = vi.mocked(reportsApi.list).mock.calls[0]?.[1]?.signal
  view.unmount()

  expect(signal?.aborted).toBe(true)
})

it('aborts an in-flight detail poll when the screen unmounts', async () => {
  const detail = deferred<ReportJob>()
  vi.mocked(reportsApi.list).mockResolvedValue({
    items: [report('queued')],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  })
  vi.mocked(reportsApi.get).mockReturnValue(detail.promise)
  const view = render(<ReportsScreen {...screenProps} />)

  await waitFor(() => expect(reportsApi.get).toHaveBeenCalledTimes(1))
  const signal = vi.mocked(reportsApi.get).mock.calls[0]?.[1]?.signal
  view.unmount()

  expect(signal?.aborted).toBe(true)
})
