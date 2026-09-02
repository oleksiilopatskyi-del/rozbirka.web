import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { carsApi } from '@/api/cars'
import { mediaApi } from '@/api/media'
import type { PlanUsageDto } from '@/api/types'
import { useCabinet } from '../CabinetContext'
import { CarsScreen, MediaPicker } from './CarsScreen'

/* eslint-disable @typescript-eslint/unbound-method -- Vitest mock methods are invoked only through their owning singleton. */

vi.mock('@/api/cars', () => ({
  isCarStatus: (value: unknown) => value === 'active' || value === 'archived',
  carsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    archive: vi.fn(),
    listParts: vi.fn(),
    createExpense: vi.fn(),
    updateExpense: vi.fn(),
    removeExpense: vi.fn(),
  },
}))
vi.mock('@/api/media', () => ({
  mediaApi: {
    upload: vi.fn(),
    remove: vi.fn(),
  },
}))
vi.mock('../CabinetContext', () => ({ useCabinet: vi.fn() }))
vi.mock('../module-registry', () => ({
  cabinetModules: {
    cars: {
      key: 'cars',
      released: true,
      routeSegment: '/cars',
      viewPermission: 'cars.view',
      mutationPermission: 'cars.manage',
      quotaResource: 'cars',
      allowedSubscriptionStates: ['active'],
    },
    parts: {
      key: 'parts',
      released: true,
      routeSegment: '/parts',
      viewPermission: 'parts.view',
      mutationPermission: 'parts.manage',
      quotaResource: 'parts',
      allowedSubscriptionStates: ['active'],
    },
  },
}))

const car = {
  id: 'car-1',
  code: 'CAR-001',
  brand: 'BMW',
  model: 'X5',
  year: 2020,
  color: null,
  status: 'active',
  acquiredAt: '2026-08-01',
  partsCount: 3,
  soldPartsCount: 1,
  coverPhotoUrl: null,
  profitability: {
    invested: 12000,
    recouped: 5000,
    recoupedPercent: 42,
    partsAvailable: 2,
  },
}

const detail = {
  ...car,
  vin: 'WBAXX11010A123456',
  notes: 'Перевірено',
  createdAt: '2026-08-01T12:00:00Z',
  purchasePrice: 12000,
  photos: [],
  expenses: [],
  profitability: {
    invested: 12000,
    recouped: 5000,
    remaining: 7000,
    recoupedPercent: 42,
    partsTotal: 3,
    partsAvailable: 2,
    partsSold: 1,
  },
}

const cabinet = (
  permissions: string[],
  usageOverrides: Partial<PlanUsageDto> = {},
) => {
  const usage: PlanUsageDto = {
    cars: { used: 0, max: 5 },
    intakes: { used: 0, max: 5 },
    parts: { used: 0, max: 5 },
    users: { used: 0, max: 5 },
    cashRegisters: { used: 0, max: 5 },
    ...usageOverrides,
  }
  return {
    status: 'ready' as const,
    targetTenant: {
      id: 'tenant-1',
      name: 'Demo Yard',
      slug: 'demo',
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
      tenantId: 'tenant-1',
      generation: 1,
      role: 'manager',
      permissions: new Set(permissions),
      features: new Set<string>(),
      entitlement: {
        state: 'active' as const,
        usage,
      },
      subscription: null,
    },
    error: null,
    retry: vi.fn(),
    switchTenant: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useCabinet).mockReturnValue(
    cabinet(['cars.view', 'cars.manage', 'finance.view', 'finance.manage']),
  )
  vi.mocked(carsApi.list).mockResolvedValue({
    items: [car],
    page: 2,
    pageSize: 25,
    total: 26,
    totalPages: 2,
  })
  vi.mocked(carsApi.get).mockResolvedValue(detail)
  vi.mocked(mediaApi.remove).mockResolvedValue(undefined)
})

it('blocks a direct create route for a view-only member', async () => {
  vi.mocked(useCabinet).mockReturnValue(
    cabinet(['cars.view', 'finance.view', 'finance.manage']),
  )
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/new']}>
      <Routes>
        <Route path="/app/:tenant/cars/new" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByRole('alert')).toHaveTextContent('Недостатньо прав')
  expect(
    screen.queryByRole('button', { name: 'Зберегти' }),
  ).not.toBeInTheDocument()
})

it('requires finance.manage as well as cars.manage for the create route and action', async () => {
  vi.mocked(useCabinet).mockReturnValue(
    cabinet(['cars.view', 'cars.manage', 'finance.view']),
  )
  const { unmount } = render(
    <MemoryRouter initialEntries={['/app/demo/cars']}>
      <Routes>
        <Route path="/app/:tenant/cars" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Автомобілі' })
  expect(
    screen.queryByRole('link', { name: 'Додати автомобіль' }),
  ).not.toBeInTheDocument()
  unmount()

  render(
    <MemoryRouter initialEntries={['/app/demo/cars/new']}>
      <Routes>
        <Route path="/app/:tenant/cars/new" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByRole('alert')).toHaveTextContent('Недостатньо прав')
  expect(carsApi.create).not.toHaveBeenCalled()
})

it('applies car quota only to create while allowing existing-car operations', async () => {
  vi.mocked(useCabinet).mockReturnValue(
    cabinet(['cars.view', 'cars.manage', 'finance.view', 'finance.manage'], {
      cars: { used: 5, max: 5 },
      parts: { used: 0, max: 5 },
    }),
  )
  const { unmount } = render(
    <MemoryRouter initialEntries={['/app/demo/cars/new']}>
      <Routes>
        <Route path="/app/:tenant/cars/new" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Ліміт автомобілів вичерпано',
  )
  unmount()

  render(
    <MemoryRouter initialEntries={['/app/demo/cars/car-1']}>
      <Routes>
        <Route path="/app/:tenant/cars/:carId" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(
    await screen.findByRole('link', { name: 'Редагувати автомобіль' }),
  ).toBeVisible()
  expect(screen.getByRole('button', { name: 'Додати витрату' })).toBeVisible()
})

it('does not reveal server financial values without finance.view', async () => {
  vi.mocked(useCabinet).mockReturnValue(cabinet(['cars.view', 'cars.manage']))
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/car-1']}>
      <Routes>
        <Route path="/app/:tenant/cars/:carId" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByRole('heading', { name: /CAR-001/ })).toBeVisible()
  expect(screen.queryByText('Ціна придбання')).not.toBeInTheDocument()
  expect(screen.queryByText(/12\s000/)).not.toBeInTheDocument()
  expect(screen.queryByText('Інвестовано: 12 000')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Додати витрату' }),
  ).not.toBeInTheDocument()
})

it('keeps finance management independent from cars.manage and car quota', async () => {
  vi.mocked(useCabinet).mockReturnValue(
    cabinet(['cars.view', 'finance.view', 'finance.manage'], {
      cars: { used: 5, max: 5 },
      parts: { used: 0, max: 5 },
    }),
  )
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/car-1']}>
      <Routes>
        <Route path="/app/:tenant/cars/:carId" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(
    await screen.findByRole('button', { name: 'Додати витрату' }),
  ).toBeVisible()
  expect(
    screen.queryByRole('link', { name: 'Редагувати автомобіль' }),
  ).not.toBeInTheDocument()
})

it('refetches authoritative detail after an expense mutation and disables duplicate submit', async () => {
  const user = userEvent.setup()
  const refreshed = {
    ...detail,
    expenses: [
      {
        id: 'expense-1',
        name: 'Транспорт',
        amount: 500,
        createdAt: '2026-08-28T12:00:00Z',
      },
    ],
    profitability: { ...detail.profitability, remaining: 7500 },
  }
  vi.mocked(carsApi.get)
    .mockResolvedValueOnce(detail)
    .mockResolvedValueOnce(refreshed)
  let resolveExpense!: (value: (typeof refreshed.expenses)[0]) => void
  const expensePending = new Promise<(typeof refreshed.expenses)[0]>(
    (resolve) => {
      resolveExpense = resolve
    },
  )
  vi.mocked(carsApi.createExpense).mockReturnValue(expensePending)
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/car-1']}>
      <Routes>
        <Route path="/app/:tenant/cars/:carId" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: /CAR-001/ })
  await user.type(screen.getByLabelText('Назва витрати'), 'Транспорт')
  await user.type(screen.getByLabelText('Сума витрати'), '500')
  const save = screen.getByRole('button', { name: 'Додати витрату' })
  await user.click(save)
  expect(save).toBeDisabled()
  await user.click(save)
  expect(carsApi.createExpense).toHaveBeenCalledTimes(1)
  resolveExpense(refreshed.expenses[0]!)
  await waitFor(() => expect(carsApi.get).toHaveBeenCalledTimes(2))
  expect(await screen.findByText(/Залишок: 7\s500/)).toBeVisible()
})

it('rechecks cars.view before dispatching an expense mutation', async () => {
  const currentCabinet = cabinet([
    'cars.view',
    'finance.view',
    'finance.manage',
  ])
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/car-1']}>
      <Routes>
        <Route path="/app/:tenant/cars/:carId" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: /CAR-001/ })
  await user.type(screen.getByLabelText('Назва витрати'), 'Транспорт')
  await user.type(screen.getByLabelText('Сума витрати'), '500')
  currentCabinet.snapshot.permissions.delete('cars.view')
  await user.click(screen.getByRole('button', { name: 'Додати витрату' }))

  expect(carsApi.createExpense).not.toHaveBeenCalled()
})

it('edits an expense with PUT, retains the form while pending, and refetches detail', async () => {
  const user = userEvent.setup()
  const expense = {
    id: 'expense-1',
    name: 'Транспорт',
    amount: 500,
    createdAt: '2026-08-28T12:00:00Z',
  }
  const refreshed = {
    ...detail,
    expenses: [{ ...expense, name: 'Доставка', amount: 750 }],
  }
  vi.mocked(carsApi.get)
    .mockResolvedValueOnce({ ...detail, expenses: [expense] })
    .mockResolvedValueOnce(refreshed)
  let resolveUpdate!: (value: typeof expense) => void
  vi.mocked(carsApi.updateExpense).mockReturnValue(
    new Promise((resolve) => {
      resolveUpdate = resolve
    }),
  )
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/car-1']}>
      <Routes>
        <Route path="/app/:tenant/cars/:carId" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  await screen.findByText(/Транспорт: 500/)
  await user.click(
    screen.getByRole('button', { name: 'Редагувати витрату Транспорт' }),
  )
  const name = screen.getByLabelText('Назва витрати')
  const amount = screen.getByLabelText('Сума витрати')
  await user.clear(name)
  await user.type(name, 'Доставка')
  await user.clear(amount)
  await user.type(amount, '750')
  const save = screen.getByRole('button', { name: 'Зберегти витрату' })
  await user.click(save)

  expect(save).toBeDisabled()
  expect(save.closest('form')).toHaveAttribute('aria-busy', 'true')
  expect(carsApi.updateExpense).toHaveBeenCalledWith(
    'car-1',
    'expense-1',
    { name: 'Доставка', amount: 750 },
    expect.objectContaining({
      signal: expect.any(AbortSignal) as AbortSignal,
    }),
  )
  resolveUpdate(expense)
  await waitFor(() => expect(carsApi.get).toHaveBeenCalledTimes(2))
  expect(await screen.findByText(/Доставка: 750/)).toBeVisible()
})

it('renders car identity, gallery, VIN copy, and gates warehouse access with parts.view', async () => {
  const user = userEvent.setup()
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  vi.mocked(carsApi.get).mockResolvedValue({
    ...detail,
    photos: [
      {
        id: 'photo-1',
        storageKey: 'cars/photo-1',
        url: 'https://cdn.example/car.jpg',
        thumbnailUrl: 'https://cdn.example/car-thumb.jpg',
        sortOrder: 0,
      },
    ],
  })
  vi.mocked(useCabinet).mockReturnValue(
    cabinet(['cars.view', 'cars.manage', 'parts.view']),
  )
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/car-1']}>
      <Routes>
        <Route path="/app/:tenant/cars/:carId" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByText('Рік')).toBeVisible()
  expect(screen.getByText('2020')).toBeVisible()
  expect(
    screen.getByRole('img', { name: 'Фото автомобіля 1' }),
  ).toHaveAttribute('src', 'https://cdn.example/car-thumb.jpg')
  expect(
    screen.getByRole('img', { name: 'Фото автомобіля 1' }).closest('a'),
  ).toHaveAttribute('href', 'https://cdn.example/car.jpg')
  expect(screen.getByRole('link', { name: 'Склад автомобіля' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Копіювати VIN' }))
  expect(writeText).toHaveBeenCalledWith('WBAXX11010A123456')
  expect(await screen.findByRole('status')).toHaveTextContent(
    'VIN скопійовано.',
  )
})

it('denies the warehouse route without parts.view', async () => {
  vi.mocked(useCabinet).mockReturnValue(cabinet(['cars.view', 'cars.manage']))
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/car-1/warehouse']}>
      <Routes>
        <Route
          path="/app/:tenant/cars/:carId/warehouse"
          element={<CarsScreen />}
        />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByRole('alert')).toHaveTextContent('Недостатньо прав')
  expect(carsApi.listParts).not.toHaveBeenCalled()
})

it('normalizes warehouse loading failures and retries without an unhandled rejection', async () => {
  const user = userEvent.setup()
  vi.mocked(useCabinet).mockReturnValue(
    cabinet(['cars.view', 'cars.manage', 'parts.view']),
  )
  vi.mocked(carsApi.listParts)
    .mockRejectedValueOnce({
      kind: 'network',
      message: 'Склад тимчасово недоступний.',
    })
    .mockResolvedValueOnce({
      items: [
        {
          id: 'part-1',
          name: 'Бампер',
          status: 'available',
          quantityAvailable: 1,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    })
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/car-1/warehouse']}>
      <Routes>
        <Route
          path="/app/:tenant/cars/:carId/warehouse"
          element={<CarsScreen />}
        />
      </Routes>
    </MemoryRouter>,
  )

  expect(screen.getByRole('status')).toHaveTextContent('Завантажуємо склад')
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Склад тимчасово недоступний.',
  )
  await user.click(screen.getByRole('button', { name: 'Спробувати ще раз' }))

  expect(await screen.findByText('Бампер · available')).toBeVisible()
  expect(carsApi.listParts).toHaveBeenCalledTimes(2)
  const firstRequest = vi.mocked(carsApi.listParts).mock.calls[0]
  expect(firstRequest?.[0]).toBe('car-1')
  expect(firstRequest?.[1]).toEqual({})
  expect(firstRequest?.[2]?.signal).toBeInstanceOf(AbortSignal)
})

it('retains successful files when another media upload fails and reports that file', async () => {
  const user = userEvent.setup()
  vi.mocked(mediaApi.upload)
    .mockResolvedValueOnce({
      storageKey: 'pending/cars/ok',
      url: 'https://cdn.example/ok.jpg',
    })
    .mockRejectedValueOnce({
      kind: 'validation',
      message: 'Непідтримуваний формат.',
    })
    .mockRejectedValueOnce({
      kind: 'validation',
      message: 'Файл завеликий.',
    })
  function Harness() {
    const [items, setItems] = useState<{ storageKey: string; url: string }[]>(
      [],
    )
    return <MediaPicker entityType="cars" items={items} onChange={setItems} />
  }
  render(<Harness />)

  await user.upload(screen.getByLabelText('Додати фото'), [
    new File(['ok'], 'ok.jpg', { type: 'image/jpeg' }),
    new File(['bad'], 'bad.heic', { type: 'image/heic' }),
    new File(['large'], 'large.jpg', { type: 'image/jpeg' }),
  ])

  expect(
    await screen.findByRole('img', { name: 'Попередній перегляд фото' }),
  ).toHaveAttribute('src', 'https://cdn.example/ok.jpg')
  const errors = within(screen.getByRole('alert')).getAllByRole('listitem')
  expect(errors).toHaveLength(2)
  expect(errors[0]).toHaveTextContent('bad.heic: Непідтримуваний формат.')
  expect(errors[1]).toHaveTextContent('large.jpg: Файл завеликий.')
})

it('allows pending car media upload and removal when the car quota is full', async () => {
  const currentCabinet = cabinet(
    ['cars.view', 'cars.manage', 'finance.manage'],
    { cars: { used: 5, max: 5 } },
  )
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  vi.mocked(mediaApi.upload).mockResolvedValue({
    storageKey: 'pending/cars/photo',
    url: 'https://cdn.example/photo.jpg',
  })
  const user = userEvent.setup()
  function Harness() {
    const [items, setItems] = useState<{ storageKey: string; url: string }[]>(
      [],
    )
    return <MediaPicker entityType="cars" items={items} onChange={setItems} />
  }
  render(<Harness />)

  await user.upload(
    screen.getByLabelText('Додати фото'),
    new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }),
  )
  await screen.findByRole('img', { name: 'Попередній перегляд фото' })
  await user.click(screen.getByRole('button', { name: 'Прибрати фото' }))

  expect(mediaApi.upload).toHaveBeenCalledOnce()
  expect(mediaApi.remove).toHaveBeenCalledOnce()
})

it('retries only remaining initial expenses after partial failure without recreating the car', async () => {
  const user = userEvent.setup()
  vi.mocked(carsApi.create).mockResolvedValue(detail)
  vi.mocked(carsApi.createExpense)
    .mockResolvedValueOnce({
      id: 'expense-1',
      name: 'Доставка',
      amount: 500,
      createdAt: '2026-08-28T12:00:00Z',
    })
    .mockRejectedValueOnce({
      kind: 'conflict',
      message: 'Витрата вже існує.',
    })
    .mockResolvedValueOnce({
      id: 'expense-2',
      name: 'Мито',
      amount: 250,
      createdAt: '2026-08-28T12:01:00Z',
    })
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/new']}>
      <Routes>
        <Route path="/app/:tenant/cars/new" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText('Код'), 'CAR-001')
  await user.type(screen.getByLabelText('Марка'), 'BMW')
  await user.type(screen.getByLabelText('Модель'), 'X5')
  await user.type(screen.getByLabelText('Рік'), '2020')
  await user.type(screen.getByLabelText('Ціна придбання'), '12000')
  await user.click(
    screen.getByRole('button', { name: 'Додати початкову витрату' }),
  )
  await user.type(
    screen.getByLabelText('Назва початкової витрати 1'),
    'Доставка',
  )
  await user.type(screen.getByLabelText('Сума початкової витрати 1'), '500')
  await user.click(
    screen.getByRole('button', { name: 'Додати початкову витрату' }),
  )
  await user.type(screen.getByLabelText('Назва початкової витрати 2'), 'Мито')
  await user.type(screen.getByLabelText('Сума початкової витрати 2'), '250')
  await user.click(screen.getByRole('button', { name: 'Зберегти' }))

  await waitFor(() => expect(carsApi.create).toHaveBeenCalledTimes(1))
  expect(carsApi.createExpense).toHaveBeenCalledWith(
    'car-1',
    { name: 'Доставка', amount: 500 },
    expect.objectContaining({
      signal: expect.any(AbortSignal) as AbortSignal,
    }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Автомобіль створено, але не всі витрати збережено: Витрата вже існує.',
  )
  expect(
    screen.getByRole('link', { name: 'Відкрити автомобіль' }),
  ).toHaveAttribute('href', '/app/demo/cars/car-1')

  await user.click(screen.getByRole('button', { name: 'Зберегти' }))
  await waitFor(() => expect(carsApi.createExpense).toHaveBeenCalledTimes(3))
  expect(carsApi.create).toHaveBeenCalledTimes(1)
  expect(carsApi.createExpense).toHaveBeenNthCalledWith(
    3,
    'car-1',
    { name: 'Мито', amount: 250 },
    expect.objectContaining({
      signal: expect.any(AbortSignal) as AbortSignal,
    }),
  )
})

it('validates every initial expense before creating the car', async () => {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/new']}>
      <Routes>
        <Route path="/app/:tenant/cars/new" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText('Код'), 'CAR-001')
  await user.type(screen.getByLabelText('Марка'), 'BMW')
  await user.type(screen.getByLabelText('Модель'), 'X5')
  await user.type(screen.getByLabelText('Рік'), '2020')
  await user.type(screen.getByLabelText('Ціна придбання'), '12000')
  await user.click(
    screen.getByRole('button', { name: 'Додати початкову витрату' }),
  )
  await user.type(
    screen.getByLabelText('Назва початкової витрати 1'),
    'Доставка',
  )
  await user.click(screen.getByRole('button', { name: 'Зберегти' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Перевірте правильність початкових витрат.',
  )
  expect(carsApi.create).not.toHaveBeenCalled()
})

it('rechecks the latest car permission before dispatching create', async () => {
  const currentCabinet = cabinet([
    'cars.view',
    'cars.manage',
    'finance.view',
    'finance.manage',
  ])
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/new']}>
      <Routes>
        <Route path="/app/:tenant/cars/new" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText('Код'), 'CAR-001')
  await user.type(screen.getByLabelText('Марка'), 'BMW')
  await user.type(screen.getByLabelText('Модель'), 'X5')
  await user.type(screen.getByLabelText('Рік'), '2020')
  await user.type(screen.getByLabelText('Ціна придбання'), '12000')
  currentCabinet.snapshot.permissions.delete('cars.manage')
  await user.click(screen.getByRole('button', { name: 'Зберегти' }))

  expect(carsApi.create).not.toHaveBeenCalled()
})

it('rechecks finance.manage before dispatching a car edit with purchasePrice', async () => {
  const currentCabinet = cabinet(['cars.view', 'cars.manage', 'finance.manage'])
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/car-1/edit']}>
      <Routes>
        <Route path="/app/:tenant/cars/:carId/edit" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  await screen.findByDisplayValue('CAR-001')
  currentCabinet.snapshot.permissions.delete('finance.manage')
  await user.click(screen.getByRole('button', { name: 'Зберегти' }))

  expect(carsApi.update).not.toHaveBeenCalled()
})

it('allows a manager to edit non-financial car fields without submitting purchasePrice', async () => {
  vi.mocked(useCabinet).mockReturnValue(
    cabinet(['cars.view', 'cars.manage', 'finance.view']),
  )
  vi.mocked(carsApi.update).mockResolvedValue(detail)
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/car-1/edit']}>
      <Routes>
        <Route path="/app/:tenant/cars/:carId/edit" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  await screen.findByDisplayValue('CAR-001')
  expect(screen.getByLabelText('Ціна придбання')).toBeDisabled()
  await user.clear(screen.getByLabelText('Нотатки'))
  await user.type(screen.getByLabelText('Нотатки'), 'Оновлено менеджером')
  await user.click(screen.getByRole('button', { name: 'Зберегти' }))

  await waitFor(() => expect(carsApi.update).toHaveBeenCalledOnce())
  const request = vi.mocked(carsApi.update).mock.calls[0]?.[1]
  expect(request).toMatchObject({ notes: 'Оновлено менеджером' })
  expect(request).not.toHaveProperty('purchasePrice')
  expect(carsApi.update).toHaveBeenCalledWith(
    'car-1',
    request,
    expect.objectContaining({
      signal: expect.any(AbortSignal) as AbortSignal,
    }),
  )
})

it('renders committed photos read-only on edit instead of sending pending-media deletes', async () => {
  vi.mocked(carsApi.get).mockResolvedValue({
    ...detail,
    photos: [
      {
        id: 'photo-1',
        storageKey: 'cars/committed/photo-1',
        url: 'https://cdn.example/car.jpg',
        thumbnailUrl: 'https://cdn.example/car-thumb.jpg',
        sortOrder: 0,
      },
    ],
  })
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/car-1/edit']}>
      <Routes>
        <Route path="/app/:tenant/cars/:carId/edit" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(
    await screen.findByRole('img', { name: 'Поточне фото автомобіля 1' }),
  ).toHaveAttribute('src', 'https://cdn.example/car.jpg')
  expect(screen.queryByLabelText('Додати фото')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Прибрати фото' }),
  ).not.toBeInTheDocument()
  expect(mediaApi.remove).not.toHaveBeenCalled()
})

it('loads URL-backed car search and displays the server profitability unchanged', async () => {
  render(
    <MemoryRouter
      initialEntries={[
        '/app/demo/cars?search=BMW&status=active&page=2&pageSize=25',
      ]}
    >
      <Routes>
        <Route path="/app/:tenant/cars" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(
    await screen.findByRole('heading', { name: 'Автомобілі' }),
  ).toBeVisible()
  expect(screen.getByText(/5\s000 \(42%\)/)).toBeVisible()
  expect(carsApi.list).toHaveBeenCalledWith(
    { search: 'BMW', status: 'active', page: 2, pageSize: 25 },
    expect.anything(),
  )
})

it('accepts an unbounded positive page while limiting pageSize to 100', async () => {
  render(
    <MemoryRouter initialEntries={['/app/demo/cars?page=101&pageSize=101']}>
      <Routes>
        <Route path="/app/:tenant/cars" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Автомобілі' })
  expect(carsApi.list).toHaveBeenCalledWith(
    { search: undefined, status: undefined, page: 101, pageSize: 20 },
    expect.anything(),
  )
})

it('writes a changed search to the URL before requesting the server list', async () => {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/demo/cars']}>
      <Routes>
        <Route path="/app/:tenant/cars" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  const search = await screen.findByLabelText('Пошук автомобілів')
  await user.type(search, 'BMW')
  await user.click(screen.getByRole('button', { name: 'Шукати' }))

  await waitFor(() =>
    expect(carsApi.list).toHaveBeenLastCalledWith(
      { search: 'BMW', status: undefined, page: 1, pageSize: 20 },
      expect.anything(),
    ),
  )
})
