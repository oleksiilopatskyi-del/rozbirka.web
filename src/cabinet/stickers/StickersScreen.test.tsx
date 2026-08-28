import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tenantResetRegistry } from '../tenant-reset-registry'
import { StickersScreen } from './StickersScreen'

const stickerMocks = vi.hoisted(() => ({ getBatchData: vi.fn() }))
const partsMocks = vi.hoisted(() => ({ list: vi.fn() }))
const cabinetMock = vi.hoisted(() => ({
  permissions: new Set(['parts.view', 'stickers.manage']),
}))
vi.mock('@/api/stickers', () => ({
  stickersApi: {
    getBatchData: stickerMocks.getBatchData,
    pdf: { available: false },
  },
}))
vi.mock('@/api/parts', () => ({ partsApi: { list: partsMocks.list } }))
vi.mock('../CabinetContext', () => ({
  useCabinet: () => ({
    status: 'ready',
    targetTenant: { id: 'tenant-1' },
    snapshot: {
      userId: 'user-1',
      tenantId: 'tenant-1',
      permissions: cabinetMock.permissions,
      features: new Set(),
      entitlement: { state: 'active', usage: {} },
      subscription: null,
    },
    error: null,
  }),
}))

const stickersDefinition = {
  key: 'stickers',
  routeSegment: '/stickers',
  released: true,
  viewPermission: 'parts.view',
  mutationPermission: 'stickers.manage',
  allowedSubscriptionStates: ['trial', 'active', 'pastDue', 'cancelled'],
}

const renderScreen = () =>
  render(
    <MemoryRouter>
      <StickersScreen definition={stickersDefinition as never} />
    </MemoryRouter>,
  )

const add = (id: string, quantity: string) => {
  fireEvent.change(screen.getByLabelText('Деталь'), {
    target: { value: id },
  })
  fireEvent.change(screen.getByLabelText('Кількість стікерів'), {
    target: { value: quantity },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Додати' }))
}

beforeEach(() => {
  localStorage.clear()
  stickerMocks.getBatchData.mockReset().mockResolvedValue({ items: [] })
  partsMocks.list.mockReset().mockResolvedValue({
    items: [
      { id: 'part-1', name: 'Bumper' },
      { id: 'part-2', name: 'Mirror' },
    ],
    page: 1,
    pageSize: 100,
    total: 2,
    totalPages: 1,
  })
  cabinetMock.permissions = new Set(['parts.view', 'stickers.manage'])
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('merges labeled queue entries, enforces the 200-label cap, and removes or clears items', async () => {
  renderScreen()
  await screen.findByRole('option', { name: 'Bumper' })
  add('part-1', '199')
  add('part-1', '1')
  expect(screen.getByText('Bumper × 200')).toBeInTheDocument()
  add('part-2', '1')
  expect(screen.getByRole('alert')).toHaveTextContent('не більше 200')

  fireEvent.click(screen.getByRole('button', { name: 'Прибрати Bumper' }))
  expect(screen.getByText('У черзі: 0')).toBeInTheDocument()
  add('part-2', '2')
  fireEvent.click(screen.getByRole('button', { name: 'Очистити чергу' }))
  expect(screen.getByText('У черзі: 0')).toBeInTheDocument()
})

it('loads sticker data and renders a real QR SVG preview for each queued copy', async () => {
  stickerMocks.getBatchData.mockResolvedValue({
    items: [
      {
        id: 'part-1',
        name: 'Bumper',
        qrCode: 'QR /1',
        carCode: 'CAR-01',
        carBrand: 'Ford',
        carModel: 'Focus',
        carYear: 2018,
        carId: 'car-1',
        quantity: 4,
        createdAt: '2026-08-28T12:00:00Z',
      },
    ],
  })
  renderScreen()
  await screen.findByRole('option', { name: 'Bumper' })
  add('part-1', '2')
  fireEvent.click(
    screen.getByRole('button', { name: 'Отримати дані стікерів' }),
  )

  const preview = await screen.findByLabelText('Макет стікерів')
  expect(stickerMocks.getBatchData).toHaveBeenCalledWith(['part-1'])
  expect(screen.getAllByRole('img', { name: 'QR-код Bumper' })).toHaveLength(2)
  expect(preview.querySelectorAll('svg')).toHaveLength(2)
  expect(preview.querySelector('svg path')).not.toBeNull()
  expect(preview).toHaveTextContent('CAR-01 · Ford Focus (2018)')
  expect(preview.innerHTML).not.toContain('QR /1')
})

it('downloads, prints, and shares the same printable QR artifact with URL cleanup', async () => {
  stickerMocks.getBatchData.mockResolvedValue({
    items: [
      {
        id: 'part-1',
        name: 'Bumper',
        qrCode: 'QR-1',
        carCode: null,
        carBrand: null,
        carModel: null,
        carYear: null,
        carId: null,
        quantity: 1,
        createdAt: '2026-08-28T12:00:00Z',
      },
    ],
  })
  const createObjectURL = vi.fn().mockReturnValue('blob:sticker-layout')
  const revokeObjectURL = vi.fn()
  class TestURL extends URL {
    static override createObjectURL = createObjectURL
    static override revokeObjectURL = revokeObjectURL
  }
  vi.stubGlobal('URL', TestURL)
  const anchorClick = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined)
  const write = vi.fn()
  const print = vi.fn()
  vi.spyOn(window, 'open').mockReturnValue({
    document: { write, close: vi.fn() },
    focus: vi.fn(),
    print,
  } as unknown as Window)
  const share = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', {
    ...navigator,
    canShare: vi.fn().mockReturnValue(true),
    share,
  })
  renderScreen()
  await screen.findByRole('option', { name: 'Bumper' })
  add('part-1', '1')
  fireEvent.click(
    screen.getByRole('button', { name: 'Отримати дані стікерів' }),
  )
  await screen.findByLabelText('Макет стікерів')

  fireEvent.click(screen.getByRole('button', { name: 'Завантажити макет' }))
  await vi.waitFor(() => expect(anchorClick).toHaveBeenCalled())
  expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:sticker-layout')

  fireEvent.click(screen.getByRole('button', { name: 'Друкувати' }))
  await vi.waitFor(() => expect(print).toHaveBeenCalled())
  expect(write.mock.calls[0]?.[0]).toContain('<svg')
  expect(write.mock.calls[0]?.[0]).toContain('/scan/QR-1')

  fireEvent.click(screen.getByRole('button', { name: 'Поділитися' }))
  await vi.waitFor(() => expect(share).toHaveBeenCalled())
  expect(share.mock.calls[0]?.[0]).toEqual(
    expect.objectContaining({
      files: [expect.any(File)],
      title: 'Стікери Rozbirka',
    }),
  )
  const shared = share.mock.calls[0]?.[0] as ShareData | undefined
  expect(shared?.files?.[0]?.name).toBe('rozbirka-stickers.html')
})

it('fails closed on generation when stickers.manage is absent', async () => {
  cabinetMock.permissions = new Set(['parts.view'])
  renderScreen()
  await screen.findByRole('option', { name: 'Bumper' })

  expect(screen.getByRole('button', { name: 'Додати' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Недостатньо прав')
})

it('persists only a stable user-tenant queue with TTL and clears it on scope cleanup', async () => {
  const first = renderScreen()
  await screen.findByRole('option', { name: 'Bumper' })
  add('part-1', '2')
  await vi.waitFor(() => expect(localStorage.length).toBe(1))
  first.unmount()
  renderScreen()
  expect(await screen.findByText('Bumper × 2')).toBeInTheDocument()

  await tenantResetRegistry.clear({ userId: 'user-1', tenantId: 'tenant-1' })
  await vi.waitFor(() =>
    expect(screen.getByText('У черзі: 0')).toBeInTheDocument(),
  )
  expect(localStorage.length).toBe(0)
})

it('discards an expired persisted queue', async () => {
  const first = renderScreen()
  await screen.findByRole('option', { name: 'Bumper' })
  add('part-1', '2')
  await vi.waitFor(() => expect(localStorage.length).toBe(1))
  const key = localStorage.key(0)!
  const stored = JSON.parse(localStorage.getItem(key)!) as {
    expiresAt: number
  }
  localStorage.setItem(
    key,
    JSON.stringify({ ...stored, expiresAt: Date.now() - 1 }),
  )
  first.unmount()

  renderScreen()
  expect(screen.getByText('У черзі: 0')).toBeInTheDocument()
  expect(localStorage.getItem(key)).toBeNull()
})
