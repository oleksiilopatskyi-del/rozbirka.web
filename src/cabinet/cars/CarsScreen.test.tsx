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
    screen.queryByRole('button', { name: 'Створити автомобіль' }),
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
  expect(screen.getByText('Витрат ще немає')).toBeVisible()
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
  await user.click(screen.getByRole('button', { name: 'Додати витрату' }))
  const form = within(await screen.findByRole('dialog'))
  await user.type(form.getByLabelText('Назва витрати'), 'Транспорт')
  await user.type(form.getByLabelText('Сума витрати'), '500')
  const save = form.getByRole('button', { name: 'Додати витрату' })
  await user.click(save)
  expect(save).toBeDisabled()
  await user.click(save)
  expect(carsApi.createExpense).toHaveBeenCalledTimes(1)
  resolveExpense(refreshed.expenses[0]!)
  await waitFor(() => expect(carsApi.get).toHaveBeenCalledTimes(2))
  // The refreshed figure is what profitability is judged by, so assert it on
  // the labelled stat rather than wherever the number happens to appear first.
  const remaining = await screen.findByText('Лишилось')
  expect(remaining.parentElement).toHaveTextContent(/7\s500/)
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
  await user.click(screen.getByRole('button', { name: 'Додати витрату' }))
  const form = within(await screen.findByRole('dialog'))
  await user.type(form.getByLabelText('Назва витрати'), 'Транспорт')
  await user.type(form.getByLabelText('Сума витрати'), '500')
  currentCabinet.snapshot.permissions.delete('cars.view')
  await user.click(form.getByRole('button', { name: 'Додати витрату' }))

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

  const expensesTable = await screen.findByRole('table', {
    name: 'Витрати автомобіля',
  })
  const transportRow = within(expensesTable).getByRole('row', {
    name: /Транспорт/,
  })
  expect(
    within(transportRow).getByRole('cell', { name: /500\s?\$/ }),
  ).toBeVisible()
  await user.click(
    within(transportRow).getByRole('button', {
      name: 'Дії з витратою Транспорт',
    }),
  )
  await user.click(
    within(await screen.findByRole('menu')).getByRole('menuitem', {
      name: 'Редагувати',
    }),
  )
  const form = within(await screen.findByRole('dialog'))
  const name = form.getByLabelText('Назва витрати')
  const amount = form.getByLabelText('Сума витрати')
  await user.clear(name)
  await user.type(name, 'Доставка')
  await user.clear(amount)
  await user.type(amount, '750')
  const save = form.getByRole('button', { name: 'Зберегти витрату' })
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
  const deliveryRow = await screen.findByRole('row', { name: /Доставка/ })
  expect(
    within(deliveryRow).getByRole('cell', { name: /750\s?\$/ }),
  ).toBeVisible()
  expect(screen.getByText('Разом 1 витрата')).toBeVisible()
})

it('renders car identity, gallery, and VIN copy', async () => {
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
  vi.mocked(useCabinet).mockReturnValue(cabinet(['cars.view', 'cars.manage']))
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/car-1']}>
      <Routes>
        <Route path="/app/:tenant/cars/:carId" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  // The year reads both in the identity line and in the spec cell.
  expect(await screen.findByText('Рік')).toBeVisible()
  expect(screen.getAllByText('2020').length).toBeGreaterThan(0)
  expect(
    screen.getByAltText(/Передня частина — фото автомобіля/),
  ).toHaveAttribute('src', 'https://cdn.example/car-thumb.jpg')
  // Without parts.view the car page keeps quiet about the warehouse instead of
  // offering a link that would deny on arrival.
  expect(
    screen.queryByRole('region', { name: 'Запчастини авто' }),
  ).not.toBeInTheDocument()
  expect(carsApi.listParts).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Копіювати VIN' }))
  expect(writeText).toHaveBeenCalledWith('WBAXX11010A123456')
  expect(await screen.findByRole('status')).toHaveTextContent(
    'VIN скопійовано.',
  )
})

it('previews the first parts and links to the warehouse filtered by this car', async () => {
  vi.mocked(useCabinet).mockReturnValue(
    cabinet(['cars.view', 'cars.manage', 'parts.view']),
  )
  vi.mocked(carsApi.listParts).mockResolvedValue({
    items: [
      {
        id: 'part-1',
        name: 'Бампер',
        status: 'available',
        quantityAvailable: 1,
      },
    ],
    page: 1,
    pageSize: 5,
    total: 12,
    totalPages: 3,
  })
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/car-1']}>
      <Routes>
        <Route path="/app/:tenant/cars/:carId" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  const section = await screen.findByRole('region', { name: 'Запчастини авто' })
  expect(section).toHaveTextContent('12 позицій з цього авто')
  expect(section).toHaveTextContent('Показано 1 із 12')
  const partRow = within(section).getByRole('row', { name: /Бампер/ })
  expect(within(partRow).getByRole('cell', { name: 'Доступна' })).toBeVisible()
  expect(
    within(section).getByRole('link', { name: 'Відкрити на складі' }),
  ).toHaveAttribute('href', '/app/demo/parts?car_ids=car-1')
  const request = vi.mocked(carsApi.listParts).mock.calls[0]
  expect(request?.[0]).toBe('car-1')
  expect(request?.[1]).toEqual({ pageSize: 5 })
  expect(request?.[2]?.signal).toBeInstanceOf(AbortSignal)
})

it('normalizes a failed parts preview and retries without an unhandled rejection', async () => {
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
      pageSize: 5,
      total: 1,
      totalPages: 1,
    })
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/car-1']}>
      <Routes>
        <Route path="/app/:tenant/cars/:carId" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  const section = await screen.findByRole('region', { name: 'Запчастини авто' })
  expect(await within(section).findByRole('alert')).toHaveTextContent(
    'Склад тимчасово недоступний.',
  )
  await user.click(
    within(section).getByRole('button', { name: 'Спробувати ще раз' }),
  )

  const partsTable = await within(section).findByRole('table', {
    name: 'Запчастини автомобіля на складі',
  })
  const partRow = within(partsTable).getByRole('row', { name: /Бампер/ })
  expect(within(partRow).getByRole('cell', { name: '1' })).toBeVisible()
  expect(carsApi.listParts).toHaveBeenCalledTimes(2)
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
  expect(screen.getByText('ok.jpg')).toBeVisible()
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

  await user.type(screen.getByRole('textbox', { name: 'Код' }), 'CAR-001')
  await user.type(screen.getByRole('textbox', { name: 'Марка' }), 'BMW')
  await user.type(screen.getByRole('textbox', { name: 'Модель' }), 'X5')
  await user.type(screen.getByRole('textbox', { name: 'Рік' }), '2020')
  await user.type(
    screen.getByRole('textbox', { name: 'Ціна придбання' }),
    '12000',
  )
  await user.click(screen.getByRole('button', { name: 'Додати витрату' }))
  await user.type(screen.getByLabelText('Назва витрати 1'), 'Доставка')
  await user.type(screen.getByLabelText('Сума витрати 1'), '500')
  await user.click(screen.getByRole('button', { name: 'Додати витрату' }))
  await user.type(screen.getByLabelText('Назва витрати 2'), 'Мито')
  await user.type(screen.getByLabelText('Сума витрати 2'), '250')
  await user.click(screen.getByRole('button', { name: 'Створити автомобіль' }))

  await waitFor(() => expect(carsApi.create).toHaveBeenCalledTimes(1))
  expect(carsApi.createExpense).toHaveBeenCalledWith(
    'car-1',
    { name: 'Доставка', amount: 500 },
    expect.objectContaining({
      signal: expect.any(AbortSignal) as AbortSignal,
    }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Автомобіль створено, але не всі витрати збережено: Витрата вже існує. Виправте дані витрати й надішліть форму ще раз — автомобіль не створиться повторно.',
  )
  expect(
    screen.getByRole('link', { name: 'Відкрити автомобіль' }),
  ).toHaveAttribute('href', '/app/demo/cars/car-1')

  await user.click(screen.getByRole('button', { name: 'Створити автомобіль' }))
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

  await user.type(screen.getByRole('textbox', { name: 'Код' }), 'CAR-001')
  await user.type(screen.getByRole('textbox', { name: 'Марка' }), 'BMW')
  await user.type(screen.getByRole('textbox', { name: 'Модель' }), 'X5')
  await user.type(screen.getByRole('textbox', { name: 'Рік' }), '2020')
  await user.type(
    screen.getByRole('textbox', { name: 'Ціна придбання' }),
    '12000',
  )
  await user.click(screen.getByRole('button', { name: 'Додати витрату' }))
  await user.type(screen.getByLabelText('Назва витрати 1'), 'Доставка')
  await user.click(screen.getByRole('button', { name: 'Створити автомобіль' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Перевірте правильність початкових витрат. Кожна потребує назви до 200 символів і суми більшої за нуль.',
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

  await user.type(screen.getByRole('textbox', { name: 'Код' }), 'CAR-001')
  await user.type(screen.getByRole('textbox', { name: 'Марка' }), 'BMW')
  await user.type(screen.getByRole('textbox', { name: 'Модель' }), 'X5')
  await user.type(screen.getByRole('textbox', { name: 'Рік' }), '2020')
  await user.type(
    screen.getByRole('textbox', { name: 'Ціна придбання' }),
    '12000',
  )
  currentCabinet.snapshot.permissions.delete('cars.manage')
  await user.click(screen.getByRole('button', { name: 'Створити автомобіль' }))

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
  await user.click(screen.getByRole('button', { name: 'Зберегти зміни' }))

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
  expect(screen.getByRole('textbox', { name: 'Ціна придбання' })).toBeDisabled()
  const notes = screen.getByRole('textbox', { name: 'Нотатки' })
  await user.clear(notes)
  await user.type(notes, 'Оновлено менеджером')
  await user.click(screen.getByRole('button', { name: 'Зберегти зміни' }))

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
  // The card states what came back and how far that is in words and figures;
  // the bar under them is decoration, so it carries no duplicate reading.
  const card = within(
    await screen.findByRole('list', { name: 'Список автомобілів' }),
  ).getByRole('link', { name: /CAR-001/ })
  expect(card).toHaveAttribute('href', '/app/demo/cars/car-1')
  expect(card).toHaveTextContent(/5\s000/)
  expect(card).toHaveTextContent('42%')
  expect(card).toHaveTextContent('Запчастин 3')
  expect(card).toHaveTextContent('Продано 1')
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

it('reads a paid-off car as profit rather than a negative remainder', async () => {
  vi.mocked(carsApi.get).mockResolvedValue({
    ...detail,
    profitability: {
      ...detail.profitability,
      invested: 10380,
      recouped: 11537,
      remaining: -1157,
      recoupedPercent: 111,
    },
  })
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/car-1']}>
      <Routes>
        <Route path="/app/:tenant/cars/:carId" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByText('Прибуток')).toBeVisible()
  expect(screen.getAllByText(/1\s157/).length).toBeGreaterThan(0)
  expect(screen.queryByText('Лишилось')).not.toBeInTheDocument()
  expect(
    screen.getByRole('progressbar', { name: /Окупність/ }),
  ).toHaveAttribute('aria-valuenow', '111')
})

it('keeps destructive car actions out of the header row', async () => {
  const user = userEvent.setup()
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
  expect(
    screen.queryByRole('button', { name: 'Видалити' }),
  ).not.toBeInTheDocument()

  await user.click(
    screen.getByRole('button', { name: 'Інші дії з автомобілем' }),
  )
  const menu = await screen.findByRole('menu')
  expect(
    within(menu).getByRole('menuitem', { name: 'Архівувати' }),
  ).toBeVisible()
  expect(within(menu).getByRole('menuitem', { name: 'Видалити' })).toBeVisible()
})

it('says which shots are missing when a car has no photos yet', async () => {
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/car-1']}>
      <Routes>
        <Route path="/app/:tenant/cars/:carId" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  const photos = await screen.findByRole('region', { name: 'Фото' })
  expect(photos).toHaveTextContent('Фото цього авто ще немає.')
  expect(photos).toHaveTextContent(/передня частина, задня чверть, бік/)
  expect(
    within(photos).queryByRole('button', { name: /відкрити/ }),
  ).not.toBeInTheDocument()
})

it('opens the gallery viewer and pages through the shots', async () => {
  const user = userEvent.setup()
  vi.mocked(carsApi.get).mockResolvedValue({
    ...detail,
    photos: [
      {
        id: 'photo-1',
        storageKey: 'cars/photo-1',
        url: 'https://cdn.example/front.jpg',
        thumbnailUrl: 'https://cdn.example/front-thumb.jpg',
        sortOrder: 0,
      },
      {
        id: 'photo-2',
        storageKey: 'cars/photo-2',
        url: 'https://cdn.example/rear.jpg',
        thumbnailUrl: 'https://cdn.example/rear-thumb.jpg',
        sortOrder: 1,
      },
    ],
  })
  render(
    <MemoryRouter initialEntries={['/app/demo/cars/car-1']}>
      <Routes>
        <Route path="/app/:tenant/cars/:carId" element={<CarsScreen />} />
      </Routes>
    </MemoryRouter>,
  )

  await user.click(
    await screen.findByRole('button', {
      name: 'Передня частина — фото автомобіля CAR-001 — відкрити на весь екран',
    }),
  )
  const viewer = await screen.findByRole('dialog')
  expect(
    within(viewer).getByAltText('Передня частина — фото автомобіля CAR-001'),
  ).toHaveAttribute('src', 'https://cdn.example/front.jpg')
  expect(viewer).toHaveTextContent('1 з 2')

  await user.click(
    within(viewer).getByRole('button', { name: 'Наступне фото' }),
  )
  expect(
    within(viewer).getByAltText('Задня чверть — фото автомобіля CAR-001'),
  ).toHaveAttribute('src', 'https://cdn.example/rear.jpg')
  expect(viewer).toHaveTextContent('2 з 2')

  await user.click(within(viewer).getByRole('button', { name: 'Закрити фото' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  )
})
