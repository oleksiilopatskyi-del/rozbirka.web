import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { FEATURES } from '@/api/types'
import { PartsScreen } from './PartsScreen'

const partMocks = vi.hoisted(() => ({
  list: vi.fn().mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 30,
    total: 0,
    totalPages: 0,
  }),
  summary: vi
    .fn()
    .mockResolvedValue({ total: 0, available: 0, reserved: 0, sold: 0 }),
  makes: vi.fn().mockResolvedValue(['Ford', 'Tesla']),
  search: vi.fn().mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 30,
    total: 0,
    totalPages: 0,
  }),
  facets: vi.fn().mockResolvedValue({
    statuses: [
      { id: 'available', name: 'available', count: 939 },
      { id: 'reserved', name: 'reserved', count: 39 },
      { id: 'sold', name: 'sold', count: 318 },
    ],
    warehouses: [{ id: 'w1', name: 'Львів, Городоцька', count: 12 }],
    zones: [],
    conditions: [
      { id: 'good', name: 'good', count: 812 },
      { id: 'fair', name: 'fair', count: 361 },
      { id: 'scrap', name: 'scrap', count: 123 },
    ],
    equipmentTypes: [],
    makes: [{ id: 'make-ford', name: 'Ford', count: 40 }],
    models: [{ id: 'model-focus', name: 'Focus', count: 12 }],
    generations: [],
    origins: [
      { id: 'car', name: 'car', count: 900 },
      { id: 'batch', name: 'batch', count: 300 },
      { id: 'free', name: 'free', count: 96 },
    ],
    qualityFlags: [],
    inventoryLocks: [],
    discrepancies: [],
  }),
  get: vi.fn().mockResolvedValue(null),
  history: vi.fn().mockResolvedValue({ partId: 'part-1', events: [] }),
  create: vi.fn().mockResolvedValue({ id: 'part-1' }),
  update: vi.fn().mockResolvedValue({ id: 'part-1' }),
  delete: vi.fn().mockResolvedValue(undefined),
}))
const selectorMocks = vi.hoisted(() => ({
  cars: vi.fn(),
  intakes: vi.fn(),
}))
const mediaMocks = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
}))
const cabinetMock = vi.hoisted(() => ({
  snapshot: {
    userId: 'user-1',
    tenantId: 'tenant-1',
    generation: 1,
    role: 'owner',
    permissions: new Set([
      'parts.view',
      'parts.manage',
      'cars.view',
      'intakes.view',
      'orders.view',
    ]),
    features: new Set<string>(),
    entitlement: {
      state: 'active',
      usage: {
        cars: { used: 1, max: 10 },
        intakes: { used: 1, max: 10 },
        parts: { used: 1, max: 10 },
        users: { used: 1, max: 10 },
        cashRegisters: { used: 1, max: 10 },
      },
    },
    subscription: null,
  },
}))

const partsDefinition = {
  key: 'parts',
  routeSegment: '/parts',
  released: true,
  viewPermission: 'parts.view',
  mutationPermission: 'parts.manage',
  allowedSubscriptionStates: ['trial', 'active', 'pastDue', 'cancelled'],
  quotaResource: 'parts',
}

vi.mock('@/api/parts', () => ({ partsApi: partMocks }))
vi.mock('@/api/cars', () => ({ carsApi: { list: selectorMocks.cars } }))
vi.mock('@/api/intakes', () => ({
  intakesApi: { list: selectorMocks.intakes },
}))
vi.mock('@/api/media', () => ({
  mediaApi: { upload: mediaMocks.upload, remove: mediaMocks.remove },
}))
vi.mock('../CabinetContext', () => ({
  useCabinet: () => ({
    status: 'ready',
    snapshot: cabinetMock.snapshot,
    error: null,
    targetTenant: { id: 'tenant-1', slug: 'yard' },
  }),
}))

beforeEach(() => {
  partMocks.list.mockReset().mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 30,
    total: 0,
    totalPages: 0,
  })
  partMocks.summary
    .mockReset()
    .mockResolvedValue({ total: 0, available: 0, reserved: 0, sold: 0 })
  partMocks.makes.mockReset().mockResolvedValue(['Ford', 'Tesla'])
  partMocks.search.mockClear()
  partMocks.facets.mockClear()
  partMocks.get.mockReset().mockResolvedValue(null)
  partMocks.history
    .mockReset()
    .mockResolvedValue({ partId: 'part-1', events: [] })
  partMocks.create.mockReset().mockResolvedValue({ id: 'part-1' })
  partMocks.update.mockReset().mockResolvedValue({ id: 'part-1' })
  partMocks.delete.mockReset().mockResolvedValue(undefined)
  selectorMocks.cars.mockReset().mockResolvedValue({
    items: [
      {
        id: 'car-1',
        code: 'CAR-01',
        brand: 'Ford',
        model: 'Focus',
        year: 2018,
      },
    ],
    page: 1,
    pageSize: 100,
    total: 1,
    totalPages: 1,
  })
  selectorMocks.intakes.mockReset().mockResolvedValue({
    items: [
      {
        id: 'intake-1',
        name: 'Партія серпень',
        supplier: 'Постачальник',
      },
    ],
    page: 1,
    pageSize: 100,
    total: 1,
    totalPages: 1,
  })
  mediaMocks.upload.mockReset()
  mediaMocks.remove.mockReset().mockResolvedValue(undefined)
  cabinetMock.snapshot.permissions = new Set([
    'parts.view',
    'parts.manage',
    'cars.view',
    'intakes.view',
    'orders.view',
  ])
  cabinetMock.snapshot.features = new Set<string>()
  cabinetMock.snapshot.entitlement = {
    state: 'active',
    usage: {
      cars: { used: 1, max: 10 },
      intakes: { used: 1, max: 10 },
      parts: { used: 1, max: 10 },
      users: { used: 1, max: 10 },
      cashRegisters: { used: 1, max: 10 },
    },
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

function LocationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output aria-label="Поточний маршрут">{location.search}</output>
      <button onClick={() => void navigate(-1)} type="button">
        Назад
      </button>
    </>
  )
}

function DetailNavigation() {
  const navigate = useNavigate()
  return (
    <button onClick={() => void navigate('/app/yard/parts/part-2')}>
      Інша деталь
    </button>
  )
}

it('normalizes invalid URL filters before requesting inventory', async () => {
  render(
    <MemoryRouter
      initialEntries={[
        '/app/yard/parts?status=invalid&page=0&per_page=999&car_ids=&intake_ids=intake-1',
      ]}
    >
      <Routes>
        <Route
          path="/app/:tenant/parts"
          element={
            <>
              <PartsScreen definition={partsDefinition as never} />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )

  await vi.waitFor(() =>
    expect(partMocks.search).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 30 }),
      expect.anything(),
    ),
  )
  expect(partMocks.search.mock.calls.at(-1)?.[0]).not.toHaveProperty('statuses')
  expect(partMocks.search.mock.calls.at(-1)?.[0]).not.toHaveProperty('carIds')
  const statusRow = (name: string | RegExp) =>
    within(screen.getByRole('region', { name: 'Статус' })).getByRole('button', {
      name,
    })
  expect(statusRow(/Усі/)).toHaveAttribute('aria-pressed', 'true')
  expect(
    within(
      screen.getByRole('radiogroup', {
        name: 'Кількість деталей на сторінці',
      }),
    ).getByRole('radio', { name: '30' }),
  ).toBeChecked()
  await vi.waitFor(() =>
    expect(screen.getByLabelText('Поточний маршрут')).toHaveTextContent(
      'page=1&per_page=30&intake_ids=intake-1',
    ),
  )
  await vi.waitFor(() => expect(partMocks.search).toHaveBeenCalledTimes(2))
})

it('keeps controlled filters synced with back navigation and resets page when filters change', async () => {
  render(
    <MemoryRouter
      initialEntries={[
        '/app/yard/parts?status=available&page=2',
        '/app/yard/parts?status=reserved&page=3',
      ]}
      initialIndex={1}
    >
      <Routes>
        <Route
          path="/app/:tenant/parts"
          element={
            <>
              <PartsScreen definition={partsDefinition as never} />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )

  const statusRow = (name: string | RegExp) =>
    within(screen.getByRole('region', { name: 'Статус' })).getByRole('button', {
      name,
    })
  expect(statusRow(/У резерві/)).toHaveAttribute('aria-pressed', 'true')
  const make = screen.getByLabelText('Марка')
  // Options arrive with the facets, so wait for the one we are about to pick.
  await vi.waitFor(() =>
    expect(within(make).getByRole('option', { name: /Ford/ })).toBeDefined(),
  )
  fireEvent.change(make, { target: { value: 'make-ford' } })
  expect(screen.getByLabelText('Поточний маршрут')).toHaveTextContent(
    'make=make-ford',
  )
  expect(screen.getByLabelText('Поточний маршрут').textContent).not.toMatch(
    /(?:^|[?&])page=3(?:&|$)/,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
  await vi.waitFor(() =>
    expect(statusRow(/У резерві/)).toHaveAttribute('aria-pressed', 'true'),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
  await vi.waitFor(() =>
    expect(statusRow(/В наявності/)).toHaveAttribute('aria-pressed', 'true'),
  )
})

it('uses server-authoritative pagination metadata for previous and next links', async () => {
  partMocks.search.mockResolvedValueOnce({
    items: [],
    page: 2,
    pageSize: 30,
    total: 90,
    totalPages: 3,
  })
  render(
    <MemoryRouter initialEntries={['/app/yard/parts?page=99']}>
      <Routes>
        <Route
          path="/app/:tenant/parts"
          element={
            <>
              <PartsScreen definition={partsDefinition as never} />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByText('Сторінка 2 з 3')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Наступна сторінка' }))
  expect(screen.getByLabelText('Поточний маршрут')).toHaveTextContent('page=3')
})

it('accepts an unbounded positive page while limiting page size to 100', async () => {
  render(
    <MemoryRouter initialEntries={['/app/yard/parts?page=101&per_page=101']}>
      <Routes>
        <Route
          path="/app/:tenant/parts"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )

  await vi.waitFor(() =>
    expect(partMocks.search).toHaveBeenCalledWith(
      expect.objectContaining({ page: 101, pageSize: 30 }),
      expect.anything(),
    ),
  )
})

it('does not request car or intake selectors without their view permissions', async () => {
  cabinetMock.snapshot.permissions = new Set(['parts.view', 'parts.manage'])
  render(
    <MemoryRouter initialEntries={['/app/yard/parts']}>
      <Routes>
        <Route
          path="/app/:tenant/parts"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )

  await vi.waitFor(() => expect(partMocks.search).toHaveBeenCalled())
  expect(selectorMocks.cars).not.toHaveBeenCalled()
  expect(selectorMocks.intakes).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('Авто')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Приймання')).not.toBeInTheDocument()
})

it('does not offer or request unauthorized source selectors on create', () => {
  cabinetMock.snapshot.permissions = new Set(['parts.view', 'parts.manage'])
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/new']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/new"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )

  expect(
    screen.queryByRole('option', { name: 'Автомобіль' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('option', { name: 'Приймання' }),
  ).not.toBeInTheDocument()
  expect(selectorMocks.cars).not.toHaveBeenCalled()
  expect(selectorMocks.intakes).not.toHaveBeenCalled()
})

it('loads only the source selector that becomes relevant', async () => {
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/new']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/new"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )

  expect(selectorMocks.cars).not.toHaveBeenCalled()
  expect(selectorMocks.intakes).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Тип джерела'), {
    target: { value: 'car' },
  })
  await screen.findByRole('option', { name: 'CAR-01 · Ford Focus (2018)' })
  expect(selectorMocks.cars).toHaveBeenCalledOnce()
  expect(selectorMocks.intakes).not.toHaveBeenCalled()
})

it('shows server-authoritative compatibility as read-only when mutation is absent from the contract', async () => {
  partMocks.get.mockResolvedValue({
    id: 'part-1',
    name: 'Bumper',
    condition: 'used',
    status: 'available',
    source: 'free',
    quantityTotal: 1,
    quantityAvailable: 1,
    quantityReserved: 0,
    quantitySoldTotal: 0,
    compatCarBrand: 'Ford',
    compatCarModel: 'Focus',
    compatCarYear: 2018,
    oemCode: null,
    effectiveSalePrice: null,
    photos: [],
    reservations: null,
    order: null,
    soldOrders: null,
    createdByName: 'Olena',
    createdAt: '2026-08-28T12:00:00Z',
  })
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/part-1']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/:partId"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByText('Ford Focus 2018')).toBeInTheDocument()
  // The note belongs beside the value it explains, not adrift at the page foot.
  expect(
    screen.getByText('Сумісність недоступна для редагування'),
  ).toBeInTheDocument()
  expect(screen.queryByLabelText('Марка сумісності')).not.toBeInTheDocument()
})

it('provides an accessible multi-file media selector backed by the confirmed contract', () => {
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/new']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/new"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )

  expect(screen.getByLabelText('Фото деталі')).toHaveAttribute('multiple')
  expect(screen.getByLabelText('Фото деталі')).toHaveAttribute(
    'accept',
    'image/*',
  )
})

it('creates a part with every supported source, inventory, price, and compatibility field', async () => {
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/new']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/new"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )

  fireEvent.change(screen.getByLabelText('Назва'), {
    target: { value: 'Front bumper' },
  })
  for (const [label, value] of [
    ['Кількість', '3'],
    ['Одиниця', 'pcs'],
    ['Стан', 'used'],
    ['Нотатки', 'Scratch'],
    ['OEM-код', 'OEM-1'],
    ['Тип деталі', 'body'],
    ['Бажана ціна', '125.5'],
    ['Марка сумісності', 'Ford'],
    ['Модель сумісності', 'Focus'],
    ['Рік сумісності', '2018'],
  ] as const) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Створити деталь' }))

  expect(await screen.findByText('Деталь створено.')).toBeInTheDocument()
  expect(partMocks.create).toHaveBeenCalledWith(
    {
      sourceType: 'free',
      name: 'Front bumper',
      quantity: 3,
      unit: 'pcs',
      condition: 'used',
      notes: 'Scratch',
      oemCode: 'OEM-1',
      partType: 'body',
      desiredSalePrice: 125.5,
      carBrand: 'Ford',
      carModel: 'Focus',
      carYear: 2018,
      photoKeys: [],
    },
    expect.objectContaining({
      signal: expect.any(AbortSignal) as AbortSignal,
    }),
  )
})

it('retains successful media uploads while exposing retry and remove for each failed file', async () => {
  mediaMocks.upload
    .mockResolvedValueOnce({
      storageKey: 'pending/parts/bumper.jpg',
      url: 'https://cdn.example/bumper.jpg',
    })
    .mockRejectedValueOnce(new Error('upload failed'))
    .mockResolvedValueOnce({
      storageKey: 'pending/parts/mirror.jpg',
      url: 'https://cdn.example/mirror.jpg',
    })
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/new']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/new"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('Назва'), {
    target: { value: 'Bumper' },
  })
  fireEvent.change(screen.getByLabelText('Фото деталі'), {
    target: {
      files: [
        new File(['one'], 'bumper.jpg', { type: 'image/jpeg' }),
        new File(['two'], 'mirror.jpg', { type: 'image/jpeg' }),
      ],
    },
  })

  expect(
    await screen.findByText('bumper.jpg · Завантажено'),
  ).toBeInTheDocument()
  expect(
    screen.getByText('mirror.jpg · Помилка завантаження'),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Створити деталь' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Повторити mirror.jpg' }))
  await screen.findByText('mirror.jpg · Завантажено')
  fireEvent.click(screen.getByRole('button', { name: 'Створити деталь' }))

  expect(await screen.findByText('Деталь створено.')).toBeInTheDocument()
  expect(mediaMocks.upload).toHaveBeenCalledTimes(3)
  expect(partMocks.create).toHaveBeenCalledWith(
    expect.objectContaining({
      photoKeys: ['pending/parts/bumper.jpg', 'pending/parts/mirror.jpg'],
    }),
    expect.objectContaining({
      signal: expect.any(AbortSignal) as AbortSignal,
    }),
  )
})

it('removes a newly uploaded file through the confirmed media contract before save', async () => {
  mediaMocks.upload.mockResolvedValue({
    storageKey: 'pending/parts/bumper.jpg',
    url: 'https://cdn.example/bumper.jpg',
  })
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/new']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/new"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('Назва'), {
    target: { value: 'Bumper' },
  })
  fireEvent.change(screen.getByLabelText('Фото деталі'), {
    target: {
      files: [new File(['one'], 'bumper.jpg', { type: 'image/jpeg' })],
    },
  })
  await screen.findByText('bumper.jpg · Завантажено')
  fireEvent.click(screen.getByRole('button', { name: 'Прибрати bumper.jpg' }))
  await vi.waitFor(() =>
    expect(mediaMocks.remove).toHaveBeenCalledWith(
      'pending/parts/bumper.jpg',
      expect.objectContaining({
        signal: expect.any(AbortSignal) as AbortSignal,
      }),
    ),
  )
  await vi.waitFor(() =>
    expect(screen.queryByText(/bumper.jpg ·/)).not.toBeInTheDocument(),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Створити деталь' }))

  expect(await screen.findByText('Деталь створено.')).toBeInTheDocument()
  expect(partMocks.create).toHaveBeenCalledWith(
    expect.objectContaining({ photoKeys: [] }),
    expect.objectContaining({
      signal: expect.any(AbortSignal) as AbortSignal,
    }),
  )
})

it('allows pending part media upload and removal after quota becomes full', async () => {
  mediaMocks.upload.mockResolvedValue({
    storageKey: 'pending/parts/bumper.jpg',
    url: 'https://cdn.example/bumper.jpg',
  })
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/new']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/new"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  cabinetMock.snapshot.entitlement.usage.parts = { used: 10, max: 10 }
  fireEvent.change(screen.getByLabelText('Фото деталі'), {
    target: {
      files: [new File(['one'], 'bumper.jpg', { type: 'image/jpeg' })],
    },
  })
  await screen.findByText('bumper.jpg · Завантажено')
  fireEvent.click(screen.getByRole('button', { name: 'Прибрати bumper.jpg' }))

  await vi.waitFor(() => expect(mediaMocks.upload).toHaveBeenCalledOnce())
  await vi.waitFor(() => expect(mediaMocks.remove).toHaveBeenCalledOnce())
})

it('persists a tenant-authorized labeled car selection without exposing its raw id', async () => {
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/new']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/new"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('Назва'), {
    target: { value: 'Bumper' },
  })
  fireEvent.change(screen.getByLabelText('Тип джерела'), {
    target: { value: 'car' },
  })
  fireEvent.change(await screen.findByLabelText('Автомобіль-джерело'), {
    target: { value: 'car-1' },
  })

  expect(
    await screen.findByText('CAR-01 · Ford Focus (2018)'),
  ).toBeInTheDocument()
  expect(screen.queryByLabelText('ID джерела')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Марка сумісності')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Створити деталь' }))
  expect(await screen.findByText('Деталь створено.')).toBeInTheDocument()
  expect(partMocks.create).toHaveBeenCalledWith(
    {
      sourceType: 'car',
      carId: 'car-1',
      name: 'Bumper',
      quantity: 1,
      photoKeys: [],
    },
    expect.objectContaining({
      signal: expect.any(AbortSignal) as AbortSignal,
    }),
  )
})

it('rechecks cars.view before creating a car-sourced part', async () => {
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/new']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/new"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('Назва'), {
    target: { value: 'Bumper' },
  })
  fireEvent.change(screen.getByLabelText('Тип джерела'), {
    target: { value: 'car' },
  })
  fireEvent.change(await screen.findByLabelText('Автомобіль-джерело'), {
    target: { value: 'car-1' },
  })
  cabinetMock.snapshot.permissions.delete('cars.view')
  fireEvent.click(screen.getByRole('button', { name: 'Створити деталь' }))

  await Promise.resolve()
  expect(partMocks.create).not.toHaveBeenCalled()
})

it('rechecks intakes.view before creating an intake-sourced part', async () => {
  cabinetMock.snapshot.features = new Set([FEATURES.IntakeManagement])
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/new']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/new"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('Назва'), {
    target: { value: 'Bumper' },
  })
  fireEvent.change(screen.getByLabelText('Тип джерела'), {
    target: { value: 'batch' },
  })
  fireEvent.change(await screen.findByLabelText('Приймання-джерело'), {
    target: { value: 'intake-1' },
  })
  cabinetMock.snapshot.permissions.delete('intakes.view')
  fireEvent.click(screen.getByRole('button', { name: 'Створити деталь' }))

  await Promise.resolve()
  expect(partMocks.create).not.toHaveBeenCalled()
})

it('loads existing edit values and updates every field accepted by the immutable request', async () => {
  partMocks.get.mockResolvedValueOnce({
    id: 'part-1',
    name: 'Front bumper',
    source: 'car',
    carId: 'car-1',
    intakeId: null,
    quantityTotal: 2,
    unit: 'pcs',
    condition: 'used',
    notes: 'Old note',
    oemCode: 'OEM-read-only',
    partType: 'body',
    desiredSalePrice: 100,
    photos: [
      {
        id: 'photo-1',
        storageKey: 'tenant-secret/existing.jpg',
        url: 'https://cdn.example/existing.jpg',
        thumbnailUrl: 'https://cdn.example/existing-thumb.jpg',
        sortOrder: 0,
      },
    ],
  })
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/part-1/edit']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/:partId/edit"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByLabelText('Назва')).toHaveValue('Front bumper')
  expect(
    await screen.findByText('CAR-01 · Ford Focus (2018)'),
  ).toBeInTheDocument()
  expect(screen.queryByLabelText('ID джерела')).not.toBeInTheDocument()
  expect(screen.getByLabelText('OEM-код')).toHaveValue('OEM-read-only')
  expect(screen.getByLabelText('Кількість')).toHaveValue(2)
  expect(screen.getByRole('link', { name: 'Існуюче фото 1' })).toHaveAttribute(
    'href',
    'https://cdn.example/existing.jpg',
  )
  expect(screen.queryByText(/tenant-secret/)).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Назва'), {
    target: { value: 'Rear bumper' },
  })
  fireEvent.change(screen.getByLabelText('Кількість'), {
    target: { value: '4' },
  })
  fireEvent.change(screen.getByLabelText('Бажана ціна'), {
    target: { value: '' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Зберегти зміни' }))

  expect(await screen.findByText('Зміни збережено.')).toBeInTheDocument()
  expect(partMocks.update).toHaveBeenCalledWith(
    'part-1',
    {
      name: 'Rear bumper',
      condition: 'used',
      notes: 'Old note',
      quantity: 4,
      partType: 'body',
      unit: 'pcs',
      photoKeys: ['tenant-secret/existing.jpg'],
      desiredSalePrice: { isSet: true, value: null },
    },
    expect.objectContaining({
      signal: expect.any(AbortSignal) as AbortSignal,
    }),
  )
})

it('guards duplicate creates with aria-busy and exposes mutation failures', async () => {
  let rejectCreate: ((reason: unknown) => void) | undefined
  partMocks.create.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectCreate = reject
      }),
  )
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/new']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/new"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('Назва'), {
    target: { value: 'Bumper' },
  })
  const submit = screen.getByRole('button', { name: 'Створити деталь' })
  fireEvent.click(submit)
  fireEvent.click(submit)
  expect(submit).toHaveAttribute('aria-busy', 'true')
  expect(submit).toBeDisabled()
  expect(partMocks.create).toHaveBeenCalledTimes(1)
  rejectCreate?.(new Error('failed'))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Не вдалося створити деталь.',
  )
})

it('guards duplicate edits with aria-busy and exposes mutation failures', async () => {
  partMocks.get.mockResolvedValueOnce({
    id: 'part-1',
    source: 'free',
    carId: null,
    intakeId: null,
    name: 'Bumper',
    quantityTotal: 1,
    unit: 'pcs',
    condition: 'used',
    notes: null,
    oemCode: null,
    partType: null,
    desiredSalePrice: null,
  })
  let rejectUpdate: ((reason: unknown) => void) | undefined
  partMocks.update.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectUpdate = reject
      }),
  )
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/part-1/edit']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/:partId/edit"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  const submit = await screen.findByRole('button', { name: 'Зберегти зміни' })
  fireEvent.click(submit)
  fireEvent.click(submit)
  expect(submit).toHaveAttribute('aria-busy', 'true')
  expect(submit).toBeDisabled()
  expect(partMocks.update).toHaveBeenCalledTimes(1)
  rejectUpdate?.(new Error('failed'))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Не вдалося зберегти зміни.',
  )
})

it('uses opaque media labels and never renders storage keys', async () => {
  partMocks.get.mockResolvedValueOnce({
    id: 'part-1',
    name: 'Bumper',
    quantityAvailable: 1,
    quantityReserved: 0,
    compatCarBrand: null,
    compatCarModel: null,
    compatCarYear: null,
    oemCode: null,
    condition: 'used',
    status: 'available',
    effectiveSalePrice: null,
    source: 'free',
    reservations: null,
    order: null,
    soldOrders: null,
    photos: [
      {
        id: 'photo-1',
        storageKey: 'tenant-secret/internal/key.jpg',
        url: 'https://cdn.example/photo.jpg',
      },
    ],
  })
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/part-1']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/:partId"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )

  const photo = await screen.findByAltText('Фото деталі Bumper 1')
  expect(photo).toHaveAttribute('src', 'https://cdn.example/photo.jpg')
  expect(screen.queryByText(/tenant-secret/)).not.toBeInTheDocument()
})

it('confirms deletion, prevents duplicates, and reports a server conflict', async () => {
  partMocks.delete.mockRejectedValueOnce({ response: { status: 409 } })
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/part-1']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/:partId"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { name: 'Деталь' })
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Інші дії з деталлю' }))
  await user.click(
    await screen.findByRole('menuitem', { name: 'Видалити деталь' }),
  )
  const confirmDelete = await screen.findByRole('button', { name: 'Видалити' })
  fireEvent.click(confirmDelete)
  fireEvent.click(confirmDelete)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Не вдалося видалити деталь через конфлікт.',
  )
  expect(partMocks.delete).toHaveBeenCalledTimes(1)
})

it('fails closed on create when parts.manage is absent', () => {
  cabinetMock.snapshot.permissions = new Set(['parts.view'])
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/new']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/new"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )

  expect(screen.getByRole('alert')).toHaveTextContent('Недостатньо прав')
  expect(screen.queryByRole('button', { name: 'Створити деталь' })).toBeNull()
})

it('rechecks the latest parts permission before dispatching create', async () => {
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/new']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/new"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('Назва'), {
    target: { value: 'Bumper' },
  })
  cabinetMock.snapshot.permissions.delete('parts.manage')
  fireEvent.click(screen.getByRole('button', { name: 'Створити деталь' }))

  await Promise.resolve()
  expect(partMocks.create).not.toHaveBeenCalled()
})

it('rechecks the latest parts quota before dispatching create', async () => {
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/new']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/new"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('Назва'), {
    target: { value: 'Bumper' },
  })
  cabinetMock.snapshot.entitlement.usage.parts = { used: 10, max: 10 }
  fireEvent.click(screen.getByRole('button', { name: 'Створити деталь' }))

  await Promise.resolve()
  expect(partMocks.create).not.toHaveBeenCalled()
})

it('applies the parts quota only to create, not edit or delete', async () => {
  cabinetMock.snapshot.entitlement = {
    ...cabinetMock.snapshot.entitlement,
    usage: {
      ...cabinetMock.snapshot.entitlement.usage,
      parts: { used: 10, max: 10 },
    },
  }
  const create = render(
    <MemoryRouter initialEntries={['/app/yard/parts/new']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/new"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  expect(screen.getByRole('alert')).toHaveTextContent('Ліміт деталей вичерпано')
  create.unmount()

  partMocks.get.mockResolvedValue({
    id: 'part-1',
    source: 'free',
    carId: null,
    intakeId: null,
    name: 'Bumper',
    quantityTotal: 1,
    unit: 'pcs',
    condition: 'used',
    notes: null,
    oemCode: null,
    partType: null,
    desiredSalePrice: null,
  })
  const edit = render(
    <MemoryRouter initialEntries={['/app/yard/parts/part-1/edit']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/:partId/edit"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  expect(
    await screen.findByRole('button', { name: 'Зберегти зміни' }),
  ).toBeEnabled()
  edit.unmount()

  partMocks.get.mockResolvedValue(null)
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/part-1']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/:partId"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  const user = userEvent.setup()
  await user.click(
    await screen.findByRole('button', { name: 'Інші дії з деталлю' }),
  )
  await user.click(
    await screen.findByRole('menuitem', { name: 'Видалити деталь' }),
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Видалити' }))
  await vi.waitFor(() =>
    expect(partMocks.delete).toHaveBeenCalledWith(
      'part-1',
      expect.objectContaining({
        signal: expect.any(AbortSignal) as AbortSignal,
      }),
    ),
  )
})

it('renders the immutable detail and history contract with permission-aware links', async () => {
  cabinetMock.snapshot.permissions.add('inventory.view')
  partMocks.get.mockResolvedValue({
    id: 'part-1',
    name: 'Bumper',
    notes: 'Small scratch',
    source: 'car',
    carId: 'car-1',
    carCode: 'CAR-01',
    intakeId: null,
    quantityTotal: 4,
    quantityAvailable: 1,
    quantityReserved: 1,
    quantitySoldTotal: 2,
    createdByName: 'Olena',
    createdAt: '2026-08-28T12:00:00Z',
    compatCarBrand: null,
    compatCarModel: null,
    compatCarYear: null,
    oemCode: null,
    condition: 'used',
    status: 'available',
    effectiveSalePrice: 100,
    photos: [],
    reservations: [
      {
        orderId: 'order-1',
        orderNumber: 42,
        quantity: 1,
        customerName: 'Ivan',
      },
    ],
    order: {
      id: 'order-2',
      number: 43,
      status: 'draft',
      customerName: null,
      createdAt: '2026-08-28T12:00:00Z',
      confirmedAt: null,
      payments: null,
    },
    soldOrders: [
      {
        orderId: 'order-3',
        orderNumber: 44,
        quantitySold: 2,
        unitPrice: 100,
        confirmedAt: '2026-08-28T13:00:00Z',
        customerName: 'Petro',
      },
    ],
  })
  partMocks.history.mockResolvedValue({
    partId: 'part-1',
    events: [
      {
        id: 'event-1',
        eventType: 'created',
        data: 'initial',
        createdAt: '2026-08-28T12:00:00Z',
        user: { id: 'user-1', name: 'Olena' },
        order: { id: 'order-1', number: 42 },
      },
    ],
  })
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/part-1']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/:partId"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByText('Small scratch')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Наявність' })).toHaveTextContent(
    'Усього 4 шт',
  )
  // The split reads beside the title, before anything has to be scrolled.
  const stat = (label: string) =>
    screen
      .getAllByRole('term')
      .find((term) => term.textContent?.trim() === label)?.parentElement
  expect(stat('Доступно')).toHaveTextContent('1')
  expect(stat('У резерві')).toHaveTextContent('1')
  expect(stat('Продано')).toHaveTextContent('2')
  // Who created the part, in the facts rather than in a run-on sentence.
  const specs = screen.getByRole('region', { name: 'Характеристики' })
  expect(specs).toHaveTextContent('Створено')
  expect(specs).toHaveTextContent('Olena')
  expect(screen.getByRole('link', { name: 'CAR-01' })).toHaveAttribute(
    'href',
    '/app/yard/cars/car-1',
  )
  expect(
    screen.getByRole('link', { name: 'Редагувати деталь' }),
  ).toHaveAttribute('href', '/app/yard/parts/part-1/edit')
  expect(
    screen.getByRole('link', { name: 'Розміщення на складі' }),
  ).toHaveAttribute('href', '/app/yard/parts/part-1/inventory')
  expect(
    screen.getAllByRole('link', { name: /Замовлення 42/ }),
  ).not.toHaveLength(0)
  const historySection = screen.getByRole('region', { name: 'Історія' })
  const created = within(historySection).getByRole('listitem')
  expect(created).toHaveTextContent('Створено')
  expect(created).toHaveTextContent('initial')
  expect(created).toHaveTextContent('Olena')
})

it('reads history payloads as facts and shows an order once', async () => {
  cabinetMock.snapshot.permissions.add('orders.view')
  partMocks.get.mockResolvedValue({
    id: 'part-1',
    name: 'Карта дверей',
    condition: 'good',
    status: 'reserved',
    source: 'batch',
    quantityTotal: 1,
    quantityAvailable: 0,
    quantityReserved: 1,
    quantitySoldTotal: 0,
    compatCarBrand: null,
    compatCarModel: null,
    compatCarYear: null,
    oemCode: null,
    effectiveSalePrice: 360,
    photos: [],
    createdByName: 'Андрій Мельник',
    createdAt: '2026-07-23T10:53:00Z',
    order: {
      id: 'order-284',
      number: 284,
      status: 'pending',
      customerName: 'Марина Данилюк',
      createdAt: '2026-08-25T16:09:00Z',
      confirmedAt: null,
      payments: null,
    },
    reservations: [
      {
        orderId: 'order-284',
        orderNumber: 284,
        quantity: 1,
        customerName: 'Марина Данилюк',
      },
    ],
    soldOrders: null,
  })
  partMocks.history.mockResolvedValue({
    partId: 'part-1',
    events: [
      {
        id: 'event-1',
        eventType: 'reserved',
        data: '{"order_id": "ee50afa2-e480", "quantity": 1, "order_number": 284}',
        createdAt: '2026-08-25T16:09:00Z',
        user: { id: 'user-2', name: 'Олександр Ковальчук' },
        order: { id: 'order-284', number: 284 },
      },
      {
        id: 'event-2',
        eventType: 'edited',
        data: '{}',
        createdAt: '2026-08-14T15:26:00Z',
        user: { id: 'user-3', name: 'Марія Бондаренко' },
        order: null,
      },
    ],
  })
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/part-1']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/:partId"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )

  const history = await screen.findByRole('region', { name: 'Історія' })
  const [reserved, edited] = within(history).getAllByRole('listitem')
  // Storage ids and braces are not facts a person reads.
  expect(reserved).toHaveTextContent('Зарезервовано')
  expect(reserved).toHaveTextContent('кількість 1')
  expect(reserved).not.toHaveTextContent('ee50afa2')
  expect(reserved).not.toHaveTextContent('order_id')
  expect(edited).toHaveTextContent('Змінено')
  expect(edited).not.toHaveTextContent('{}')

  // The current order is one of the reservations, so it takes a single row.
  const reserves = screen.getByRole('region', { name: 'Резерви' })
  expect(
    within(reserves).getAllByRole('link', { name: 'Замовлення 284' }),
  ).toHaveLength(1)
})

it('counts every filter value from the server and narrows the search by it', async () => {
  render(
    <MemoryRouter initialEntries={['/app/yard/parts']}>
      <Routes>
        <Route
          path="/app/:tenant/parts"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )

  const conditions = await screen.findByRole('region', { name: 'Стан деталі' })
  // The numbers are the server's, counted under the rest of the filter.
  expect(
    within(conditions).getByRole('button', { name: /good/ }),
  ).toHaveTextContent('812')
  fireEvent.click(within(conditions).getByRole('button', { name: /good/ }))

  await vi.waitFor(() =>
    expect(partMocks.search).toHaveBeenLastCalledWith(
      expect.objectContaining({ conditions: ['good'] }),
      expect.anything(),
    ),
  )
  expect(partMocks.facets).toHaveBeenLastCalledWith(
    expect.objectContaining({ conditions: ['good'] }),
    expect.anything(),
    expect.anything(),
  )
})

it('opens the model filter only once a make is chosen', async () => {
  render(
    <MemoryRouter initialEntries={['/app/yard/parts']}>
      <Routes>
        <Route
          path="/app/:tenant/parts"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )

  const model = await screen.findByLabelText('Модель')
  expect(model).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Марка'), {
    target: { value: 'make-ford' },
  })
  await vi.waitFor(() => expect(screen.getByLabelText('Модель')).toBeEnabled())
})

it('ignores an aborted stale list failure after filters change', async () => {
  let rejectFirst: ((reason: unknown) => void) | undefined
  partMocks.search
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFirst = reject
        }),
    )
    .mockResolvedValueOnce({
      items: [
        {
          id: 'part-2',
          name: 'Mirror',
          quantityAvailable: 1,
          quantityReserved: 0,
        },
      ],
      page: 1,
      pageSize: 30,
      total: 1,
      totalPages: 1,
    })
  render(
    <MemoryRouter initialEntries={['/app/yard/parts']}>
      <Routes>
        <Route
          path="/app/:tenant/parts"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  await vi.waitFor(() => expect(partMocks.search).toHaveBeenCalledOnce())
  fireEvent.change(screen.getByLabelText('Пошук деталей'), {
    target: { value: 'mirror' },
  })
  expect(
    await screen.findByRole('link', { name: 'Mirror' }),
  ).toBeInTheDocument()
  await act(async () => {
    rejectFirst?.(new Error('stale failure'))
    await Promise.resolve()
  })

  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Mirror' })).toBeInTheDocument()
})

it('ignores an aborted stale detail failure after navigation', async () => {
  let rejectFirst: ((reason: unknown) => void) | undefined
  partMocks.get
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFirst = reject
        }),
    )
    .mockResolvedValueOnce({
      id: 'part-2',
      name: 'Mirror',
      notes: null,
      source: 'free',
      carId: null,
      carCode: null,
      intakeId: null,
      quantityTotal: 1,
      quantityAvailable: 1,
      quantityReserved: 0,
      quantitySoldTotal: 0,
      createdByName: 'Olena',
      createdAt: '2026-08-28T12:00:00Z',
      compatCarBrand: null,
      compatCarModel: null,
      compatCarYear: null,
      oemCode: null,
      condition: 'used',
      status: 'available',
      effectiveSalePrice: null,
      photos: [],
      reservations: null,
      order: null,
      soldOrders: null,
    })
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/part-1']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/:partId"
          element={
            <>
              <PartsScreen definition={partsDefinition as never} />
              <DetailNavigation />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
  await vi.waitFor(() => expect(partMocks.get).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: 'Інша деталь' }))
  expect(
    await screen.findByRole('heading', { name: 'Mirror' }),
  ).toBeInTheDocument()
  await act(async () => {
    rejectFirst?.(new Error('stale failure'))
    await Promise.resolve()
  })

  expect(screen.queryByText('Не вдалося завантажити деталь.')).toBeNull()
  expect(screen.getByRole('heading', { name: 'Mirror' })).toBeInTheDocument()
})

it('blocks an invalid create and points at the offending fields', async () => {
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/new']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/new"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('Кількість'), {
    target: { value: '0' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Створити деталь' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'виправте позначені нижче поля',
  )
  expect(partMocks.create).not.toHaveBeenCalled()
  for (const [label, message] of [
    ['Назва', 'Введіть назву деталі'],
    ['Кількість', 'Вкажіть ціле число від 1'],
  ] as const) {
    const control = screen.getByLabelText(label)
    expect(control).toHaveAttribute('aria-invalid', 'true')
    expect(
      document.getElementById(control.getAttribute('aria-describedby') ?? ''),
    ).toHaveTextContent(message)
  }

  fireEvent.change(screen.getByLabelText('Назва'), {
    target: { value: 'Bumper' },
  })
  fireEvent.change(screen.getByLabelText('Кількість'), {
    target: { value: '2' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Створити деталь' }))

  expect(await screen.findByText('Деталь створено.')).toBeInTheDocument()
  expect(screen.getByLabelText('Назва')).not.toHaveAttribute('aria-invalid')
})

it('requires a source selection before creating a car-sourced part', async () => {
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/new']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/new"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('Назва'), {
    target: { value: 'Bumper' },
  })
  fireEvent.change(screen.getByLabelText('Тип джерела'), {
    target: { value: 'car' },
  })
  const source = await screen.findByLabelText('Автомобіль-джерело')
  fireEvent.click(screen.getByRole('button', { name: 'Створити деталь' }))

  await vi.waitFor(() => expect(source).toHaveAttribute('aria-invalid', 'true'))
  expect(
    document.getElementById(source.getAttribute('aria-describedby') ?? ''),
  ).toHaveTextContent('Оберіть автомобіль зі списку.')
  expect(partMocks.create).not.toHaveBeenCalled()
})

it('lists each chosen photo with its size and a way to drop it', async () => {
  mediaMocks.upload.mockResolvedValue({
    storageKey: 'pending/parts/bumper.jpg',
    url: 'https://cdn.example/bumper.jpg',
  })
  render(
    <MemoryRouter initialEntries={['/app/yard/parts/new']}>
      <Routes>
        <Route
          path="/app/:tenant/parts/new"
          element={<PartsScreen definition={partsDefinition as never} />}
        />
      </Routes>
    </MemoryRouter>,
  )
  fireEvent.change(screen.getByLabelText('Фото деталі'), {
    target: {
      files: [new File(['one'], 'bumper.jpg', { type: 'image/jpeg' })],
    },
  })

  const photos = await screen.findByRole('list', { name: 'Вибрані фото' })
  expect(
    await screen.findByText('bumper.jpg · Завантажено'),
  ).toBeInTheDocument()
  expect(screen.getByText('3 Б')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'bumper.jpg' })).toHaveAttribute(
    'href',
    'https://cdn.example/bumper.jpg',
  )
  expect(
    screen.getByRole('button', { name: 'Прибрати bumper.jpg' }),
  ).toBeInTheDocument()
  expect(photos).toBeInTheDocument()
})
