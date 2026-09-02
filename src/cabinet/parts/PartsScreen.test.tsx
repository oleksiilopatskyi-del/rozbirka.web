import { act, fireEvent, render, screen } from '@testing-library/react'
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
    expect(partMocks.list).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        pageSize: 30,
        carIds: [],
        intakeIds: ['intake-1'],
      }),
    ),
  )
  expect(partMocks.list.mock.calls.at(-1)?.[0]).not.toHaveProperty('status')
  expect(screen.getByLabelText('Статус')).toHaveValue('')
  expect(screen.getByLabelText('Розмір сторінки')).toHaveValue('30')
  await vi.waitFor(() =>
    expect(screen.getByLabelText('Поточний маршрут')).toHaveTextContent(
      'page=1&per_page=30&intake_ids=intake-1',
    ),
  )
  await vi.waitFor(() => expect(partMocks.list).toHaveBeenCalledTimes(2))
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

  expect(screen.getByLabelText('Статус')).toHaveValue('reserved')
  fireEvent.change(screen.getByLabelText('Марка'), {
    target: { value: 'Ford' },
  })
  expect(screen.getByLabelText('Поточний маршрут')).toHaveTextContent(
    'make=Ford',
  )
  expect(screen.getByLabelText('Поточний маршрут').textContent).not.toMatch(
    /(?:^|[?&])page=3(?:&|$)/,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
  await vi.waitFor(() =>
    expect(screen.getByLabelText('Статус')).toHaveValue('reserved'),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
  await vi.waitFor(() =>
    expect(screen.getByLabelText('Статус')).toHaveValue('available'),
  )
})

it('uses server-authoritative pagination metadata for previous and next links', async () => {
  partMocks.list.mockResolvedValueOnce({
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
    expect(partMocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 101, pageSize: 30 }),
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

  await vi.waitFor(() => expect(partMocks.list).toHaveBeenCalled())
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

  expect(
    await screen.findByRole('heading', { name: 'Деталь' }),
  ).toBeInTheDocument()
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

  expect(await screen.findByRole('link', { name: 'Фото 1' })).toHaveAttribute(
    'href',
    'https://cdn.example/photo.jpg',
  )
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
  fireEvent.click(screen.getByRole('button', { name: 'Видалити деталь' }))
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
  fireEvent.click(
    await screen.findByRole('button', { name: 'Видалити деталь' }),
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

  expect(await screen.findByText('Нотатки: Small scratch')).toBeInTheDocument()
  expect(screen.getByText(/Усього:/)).toHaveTextContent(
    'Усього: 4; доступно: 1; у резерві: 1; продано: 2',
  )
  expect(screen.getByText(/Створила\/в: Olena/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'CAR-01' })).toHaveAttribute(
    'href',
    '/app/yard/cars/car-1',
  )
  expect(
    screen.getByRole('link', { name: 'Редагувати деталь' }),
  ).toHaveAttribute('href', '/app/yard/parts/part-1/edit')
  expect(
    screen.getAllByRole('link', { name: /Замовлення 42/ }),
  ).not.toHaveLength(0)
  expect(screen.getByText(/created · initial · Olena/)).toBeInTheDocument()
})

it('ignores an aborted stale list failure after filters change', async () => {
  let rejectFirst: ((reason: unknown) => void) | undefined
  partMocks.list
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
  await vi.waitFor(() => expect(partMocks.list).toHaveBeenCalledOnce())
  fireEvent.change(screen.getByLabelText('Пошук'), {
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
