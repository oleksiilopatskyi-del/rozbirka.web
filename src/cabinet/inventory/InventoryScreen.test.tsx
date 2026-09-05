import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { InventoryScreen } from './InventoryScreen'

const api = vi.hoisted(() => ({
  getWarehouses: vi.fn(),
  getWarehouse: vi.fn(),
  getZone: vi.fn(),
  getZones: vi.fn(),
  getSessions: vi.fn(),
  getSession: vi.fn(),
  getResults: vi.fn(),
  getAudit: vi.fn(),
  getScans: vi.fn(),
  getPartZones: vi.fn(),
  replacePartZones: vi.fn(),
  updateWarehouse: vi.fn(),
  archiveWarehouse: vi.fn(),
  createZone: vi.fn(),
  updateZone: vi.fn(),
  archiveZone: vi.fn(),
}))
const printable = vi.hoisted(() => ({
  buildZoneLabelHtml: vi.fn().mockResolvedValue('<html>zones</html>'),
}))
const permissions = vi.hoisted(() => ({
  value: new Set([
    'inventory.view',
    'inventory.manage',
    'inventory.adjust',
    'inventory.zones.manage',
  ]),
}))

vi.mock('@/api/inventory', () => ({ inventoryApi: api }))
vi.mock('./zone-label-output', () => printable)
vi.mock('../CabinetContext', () => ({
  useCabinet: () => ({
    status: 'ready',
    targetTenant: { id: 'tenant-1', slug: 'yard' },
    snapshot: {
      tenantId: 'tenant-1',
      userId: 'user-1',
      generation: 1,
      permissions: permissions.value,
      features: new Set<string>(),
      entitlement: {
        state: 'active',
        usage: {
          cars: { used: 0, max: null },
          intakes: { used: 0, max: null },
          parts: { used: 0, max: null },
          users: { used: 0, max: null },
          cashRegisters: { used: 0, max: null },
        },
      },
      subscription: null,
      cabinetParityRollout: null,
    },
  }),
}))

const definition = {
  key: 'inventory',
  routeSegment: '/inventory',
  released: true,
  viewPermission: 'inventory.view',
  mutationPermission: 'inventory.manage',
}

const session = {
  id: 'session-1',
  number: 'INV-001',
  status: 'inProgress',
  createdBy: 'user-1',
  startedBy: 'user-1',
  completedBy: null,
  createdAt: '2026-09-02T10:00:00Z',
  startedAt: '2026-09-02T10:05:00Z',
  completedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  preview: {
    includedPartCount: 12,
    coverageWarningPartCount: 1,
    conflictingPartCount: 0,
  },
  zones: [
    {
      zoneId: 'zone-1',
      warehouseId: 'wh-1',
      warehouseName: 'Основний склад',
      zoneName: 'Стелаж A1',
      zoneCode: 'A1',
      status: 'counting',
      leaseOwnerUserId: 'user-2',
      leaseExpiresAt: '2026-09-02T10:20:00Z',
      completedAt: null,
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getWarehouses.mockResolvedValue([
    {
      id: 'wh-1',
      name: 'Основний склад',
      code: 'main',
      isSystemDefault: true,
      isActive: true,
      zoneCount: 4,
    },
  ])
  api.getWarehouse.mockResolvedValue({
    id: 'wh-1',
    tenantId: 'tenant-1',
    name: 'Основний склад',
    code: 'main',
    isSystemDefault: false,
    isActive: true,
    unassignedPartCount: 2,
    createdAt: '2026-09-02T09:00:00Z',
    updatedAt: '2026-09-02T09:00:00Z',
    zones: [
      {
        id: 'zone-1',
        name: 'Стелаж A1',
        code: 'A1',
        isSystemUnassigned: false,
        isActive: true,
      },
    ],
  })
  api.getZone.mockResolvedValue({
    id: 'zone-1',
    warehouseId: 'wh-1',
    warehouseName: 'Основний склад',
    name: 'Стелаж A1',
    code: 'A1',
    qrCode: 'ZONE-1',
    isSystemUnassigned: false,
    isActive: true,
  })
  api.getSessions.mockResolvedValue([session])
  api.getSession.mockResolvedValue(session)
  api.getResults.mockResolvedValue({
    inventorySessionId: 'session-1',
    number: 'INV-001',
    parts: [
      {
        partId: 'part-1',
        partName: 'Крило',
        partQrCode: 'QR-1',
        expectedQuantity: 2,
        actualQuantity: 1,
        delta: -1,
        result: 'Shortage',
        hasCoverageWarning: false,
        unselectedZoneIds: [],
      },
    ],
  })
  api.getAudit.mockResolvedValue([])
  api.getScans.mockResolvedValue([
    {
      id: 'scan-1',
      inventorySessionId: 'session-1',
      zoneId: 'zone-1',
      partId: 'part-1',
      partName: 'Крило',
      partQrCode: 'QR-1',
      scannedBy: 'user-2',
      operationId: 'operation-1',
      scannedAt: '2026-09-02T10:10:00Z',
      unexpected: true,
      zonePartCount: 1,
    },
  ])
  api.getPartZones.mockResolvedValue([])
  api.getZones.mockResolvedValue([
    {
      id: 'zone-1',
      warehouseId: 'wh-1',
      warehouseName: 'Основний склад',
      name: 'Стелаж A1',
      code: 'A1',
      qrCode: 'ZONE-1',
      isSystemUnassigned: false,
      isActive: true,
    },
  ])
  api.replacePartZones.mockResolvedValue([])
  api.updateWarehouse.mockResolvedValue(undefined)
  api.archiveWarehouse.mockResolvedValue(undefined)
  api.createZone.mockResolvedValue(undefined)
  api.updateZone.mockResolvedValue(undefined)
  api.archiveZone.mockResolvedValue(undefined)
  printable.buildZoneLabelHtml.mockClear()
})

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <InventoryScreen definition={definition as never} />
    </MemoryRouter>,
  )

it('renders responsive management overview without physical scanning controls', async () => {
  renderAt('/app/yard/inventory')
  expect(await screen.findByText('Основний склад')).toBeInTheDocument()
  expect(screen.getByText('INV-001')).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'Нова інвентаризація' }),
  ).toBeInTheDocument()
  expect(screen.queryByText(/увімкнути камеру/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/сканувати qr/i)).not.toBeInTheDocument()
})

it('shows mobile counting progress as read-only web monitoring', async () => {
  renderAt('/app/yard/inventory/sessions/session-1')
  expect(await screen.findByText('Стелаж A1')).toBeInTheDocument()
  expect(screen.getByText('Підрахунок триває')).toBeInTheDocument()
  expect(screen.getByText(/зайнята користувачем/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Результати' })).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /рахувати/i }),
  ).not.toBeInTheDocument()
})

it('renders discrepancy results and adjustment affordance', async () => {
  api.getSession.mockResolvedValue({ ...session, status: 'review' })
  renderAt('/app/yard/inventory/sessions/session-1/results')
  expect(await screen.findByText('Крило')).toBeInTheDocument()
  expect(screen.getByText('Нестача')).toBeInTheDocument()
  expect(screen.getByText('−1')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Скоригувати Крило' }),
  ).toBeInTheDocument()
})

it('offers reopen only while a session is in review', async () => {
  api.getSession.mockResolvedValue({ ...session, status: 'review' })
  renderAt('/app/yard/inventory/sessions/session-1')

  expect(
    await screen.findByRole('button', { name: 'Відкрити повторно' }),
  ).toBeInTheDocument()
})

it('does not link draft sessions to unavailable results', async () => {
  api.getSession.mockResolvedValue({ ...session, status: 'draft' })
  renderAt('/app/yard/inventory/sessions/session-1')

  await screen.findByText('INV-001')
  expect(
    screen.queryByRole('link', { name: 'Результати' }),
  ).not.toBeInTheDocument()
})

it('routes correctly when the tenant slug matches a module segment', async () => {
  renderAt('/app/inventory/inventory/sessions/session-1')

  expect(await screen.findByText('INV-001')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Результати' })).toBeInTheDocument()
})

it('routes part placement when the tenant slug is parts', async () => {
  renderAt('/app/parts/parts/part-1/inventory')

  expect(
    await screen.findByLabelText('Основний склад · Стелаж A1'),
  ).toBeInTheDocument()
})

it('does not offer duplicate or unsafe adjustments', async () => {
  api.getSession.mockResolvedValue({ ...session, status: 'review' })
  api.getAudit.mockResolvedValue([
    {
      id: 'audit-1',
      inventorySessionId: 'session-1',
      zoneId: null,
      partId: 'part-1',
      scanId: null,
      adjustmentId: 'adjustment-1',
      action: 'adjustment.applied',
      actorUserId: 'user-1',
      detailsJson: null,
      createdAt: '2026-09-02T11:00:00Z',
    },
  ])

  renderAt('/app/yard/inventory/sessions/session-1/results')

  expect(await screen.findByText('Скориговано')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Скоригувати Крило' }),
  ).not.toBeInTheDocument()
})

it('filters matched results until the user asks to see every position', async () => {
  api.getSession.mockResolvedValue({ ...session, status: 'review' })
  api.getResults.mockResolvedValue({
    inventorySessionId: 'session-1',
    number: 'INV-001',
    parts: [
      {
        partId: 'part-matched',
        partName: 'Дзеркало',
        partQrCode: 'QR-2',
        expectedQuantity: 1,
        actualQuantity: 1,
        delta: 0,
        result: 'Matched',
        hasCoverageWarning: false,
        unselectedZoneIds: [],
      },
    ],
  })
  renderAt('/app/yard/inventory/sessions/session-1/results')

  expect(await screen.findByLabelText('Показати')).toHaveValue('discrepancies')
  expect(screen.queryByText('Дзеркало')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Показати'), {
    target: { value: 'all' },
  })
  expect(screen.getByText('Дзеркало')).toBeInTheDocument()
})

it('shows the mobile scan journal as read-only data', async () => {
  renderAt('/app/yard/inventory/sessions/session-1/journal/zone-1')
  expect(await screen.findByText('Крило')).toBeInTheDocument()
  expect(screen.getByText('Несподівана')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /сканувати/i }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /скасувати останнє/i }),
  ).not.toBeInTheDocument()
})

it('marks voided Mobile scans in the read-only journal', async () => {
  api.getScans.mockResolvedValue([
    {
      id: 'scan-voided',
      inventorySessionId: 'session-1',
      zoneId: 'zone-1',
      partId: 'part-1',
      partName: 'Крило',
      partQrCode: 'QR-1',
      scannedBy: 'user-2',
      operationId: 'operation-1',
      scannedAt: '2026-09-02T10:10:00Z',
      unexpected: false,
      zonePartCount: 0,
      voidedAt: '2026-09-02T10:11:00Z',
      voidedBy: 'user-2',
      voidReason: 'Помилкове сканування',
    },
  ])

  renderAt('/app/yard/inventory/sessions/session-1/journal/zone-1')

  expect(await screen.findByText('Скасовано')).toBeInTheDocument()
  expect(screen.getByText('Помилкове сканування')).toBeInTheDocument()
})

it('manages part placement without exposing counting actions', async () => {
  renderAt('/app/yard/parts/part-1/inventory')
  expect(
    await screen.findByLabelText('Основний склад · Стелаж A1'),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Зберегти розміщення' }),
  ).toBeInTheDocument()
  expect(screen.queryByText(/камера/i)).not.toBeInTheDocument()
})

it('shows progress while part placement is being saved', async () => {
  let finishSaving: (() => void) | undefined
  api.getPartZones.mockResolvedValue([
    {
      isSystemUnassigned: false,
      warehouseId: 'wh-1',
      warehouseName: 'Основний склад',
      zoneCode: 'A1',
      zoneId: 'zone-1',
      zoneName: 'Стелаж A1',
      zoneQrCode: 'ZONE-1',
    },
  ])
  api.replacePartZones.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishSaving = () => resolve([])
      }),
  )

  renderAt('/app/yard/parts/part-1/inventory')
  fireEvent.click(
    await screen.findByRole('button', { name: 'Зберегти розміщення' }),
  )

  expect(screen.getByRole('button', { name: 'Зберігаємо…' })).toBeDisabled()
  finishSaving?.()
})

it('confirms that part placement was saved', async () => {
  api.getPartZones.mockResolvedValue([
    {
      isSystemUnassigned: false,
      warehouseId: 'wh-1',
      warehouseName: 'Основний склад',
      zoneCode: 'A1',
      zoneId: 'zone-1',
      zoneName: 'Стелаж A1',
      zoneQrCode: 'ZONE-1',
    },
  ])

  renderAt('/app/yard/parts/part-1/inventory')
  fireEvent.click(
    await screen.findByRole('button', { name: 'Зберегти розміщення' }),
  )

  expect(await screen.findByText('Розміщення збережено')).toBeInTheDocument()
})

it('does not allow replacement when current part placement failed to load', async () => {
  api.getPartZones.mockRejectedValue(new Error('offline'))

  renderAt('/app/yard/parts/part-1/inventory')

  expect(
    await screen.findByText(/Не вдалося завантажити дані/),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Зберегти розміщення' }),
  ).not.toBeInTheDocument()
})

it('offers warehouse and zone management and prints actual zone QR labels', async () => {
  const print = vi.fn()
  const focus = vi.fn()
  const close = vi.fn()
  const write = vi.fn()
  vi.spyOn(window, 'open').mockReturnValue({
    document: { write, close },
    focus,
    print,
    opener: null,
  } as never)

  renderAt('/app/yard/inventory/warehouses/wh-1')

  expect(await screen.findByText('Стелаж A1')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Редагувати склад' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Архівувати зону Стелаж A1' }),
  ).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Друкувати QR зон' }))

  await waitFor(() =>
    expect(api.getZones).toHaveBeenCalledWith({ warehouseId: 'wh-1' }),
  )
  expect(printable.buildZoneLabelHtml).toHaveBeenCalledWith([
    expect.objectContaining({
      zoneName: 'Стелаж A1',
      warehouseName: 'Основний склад',
      qrCode: 'ZONE-1',
    }),
  ])
  expect(write).toHaveBeenCalledWith('<html>zones</html>')
  expect(print).toHaveBeenCalled()
})
