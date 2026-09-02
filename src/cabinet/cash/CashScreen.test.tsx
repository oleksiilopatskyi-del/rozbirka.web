import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useCabinet } from '../CabinetContext'
import { cabinetModules } from '../module-registry'
import { CashScreen } from './CashScreen'

const cashMocks = vi.hoisted(() => ({
  list: vi.fn(),
  dailySummary: vi.fn(),
  getById: vi.fn(),
  transactions: vi.fn(),
  createTransaction: vi.fn(),
  transfer: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  activate: vi.fn(),
  deactivate: vi.fn(),
  remove: vi.fn(),
  addCurrency: vi.fn(),
  removeCurrency: vi.fn(),
}))

vi.mock('@/api/cash', () => ({
  cashApi: cashMocks,
}))
vi.mock('../CabinetContext', () => ({ useCabinet: vi.fn() }))
const definition = {
  key: 'cash',
  routeSegment: '/cash',
  released: true,
  viewPermission: 'finance.view',
  mutationPermission: 'finance.manage',
  allowedSubscriptionStates: ['active'],
} as never
const cabinet = (
  permissions: string[] = ['finance.view', 'finance.manage'],
  entitlementState: 'active' | 'cancelled' = 'active',
  cashRegisters = { used: 0, max: 5 as number | null },
) =>
  ({
    status: 'ready',
    targetTenant: { id: 'tenant-1', slug: 'garage' },
    snapshot: {
      userId: 'user-1',
      tenantId: 'tenant-1',
      generation: 1,
      permissions: new Set(permissions),
      features: new Set(),
      entitlement: { state: entitlementState, usage: { cashRegisters } },
    },
    error: null,
  }) as unknown as ReturnType<typeof useCabinet>
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})
beforeEach(() => {
  vi.mocked(useCabinet).mockReturnValue(cabinet())
  cashMocks.list.mockResolvedValue([])
})

it('renders Core daily balances without calculating them in the browser', async () => {
  cashMocks.list.mockResolvedValue([])
  cashMocks.dailySummary.mockResolvedValue({
    date: '2026-08-28',
    timeZone: 'Europe/Kyiv',
    startUtc: '2026-08-27T21:00:00Z',
    endUtc: '2026-08-28T21:00:00Z',
    registers: [
      {
        id: 'cash-1',
        name: 'Каса',
        type: 'cash',
        isActive: true,
        sortOrder: 0,
        currencies: [
          {
            currency: 'UAH',
            income: 1000,
            expense: 200,
            net: 800,
            balance: 1800,
            operationCount: 4,
          },
        ],
      },
    ],
  })

  render(
    <MemoryRouter initialEntries={['/app/garage/cash?date=2026-08-28']}>
      <CashScreen definition={definition} />
    </MemoryRouter>,
  )

  expect(await screen.findByText('1800 UAH')).toBeVisible()
  expect(screen.getByText('1000 / 200')).toBeVisible()
})

it('uses the selected timezone rather than UTC when defaulting the finance date', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-28T23:30:00Z'))
  vi.stubEnv('TZ', 'Europe/Kyiv')
  cashMocks.list.mockResolvedValue([])
  cashMocks.dailySummary.mockResolvedValue({
    date: '2026-08-29',
    timeZone: 'Europe/Kiev',
    startUtc: '2026-08-28T21:00:00Z',
    endUtc: '2026-08-29T21:00:00Z',
    registers: [],
  })

  act(() => {
    render(
      <MemoryRouter initialEntries={['/app/garage/cash']}>
        <CashScreen definition={definition} />
      </MemoryRouter>,
    )
  })

  expect(cashMocks.dailySummary).toHaveBeenCalledWith(
    '2026-08-29',
    'Europe/Kiev',
    expect.any(Object),
  )
})

it('uses the Core manual movement enum values instead of generic income and expense', async () => {
  cashMocks.getById.mockResolvedValue({
    id: 'cash-1',
    name: 'Каса',
    type: 'cash',
    isActive: true,
    balances: { UAH: 100 },
  })
  cashMocks.transactions.mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  })

  render(
    <MemoryRouter initialEntries={['/app/garage/cash/cash-1']}>
      <CashScreen definition={definition} />
    </MemoryRouter>,
  )

  expect(
    await screen.findByRole('option', { name: 'Надходження' }),
  ).toHaveValue('manual_in')
  expect(screen.getByRole('option', { name: 'Витрата' })).toHaveValue(
    'manual_out',
  )
})

it('keeps existing-register mutations available when the production cash quota is exhausted', async () => {
  vi.mocked(useCabinet).mockReturnValue(
    cabinet(undefined, 'active', { used: 5, max: 5 }),
  )
  const register = {
    id: 'cash-1',
    name: 'Основна каса',
    type: 'cash',
    isActive: true,
    balances: { UAH: 100 },
  }
  const destination = {
    id: 'cash-2',
    name: 'Валютна каса',
    type: 'cash',
    isActive: true,
    balances: { USD: 10 },
  }
  cashMocks.getById.mockResolvedValue(register)
  cashMocks.list.mockResolvedValue([register, destination])
  cashMocks.transactions.mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  })
  cashMocks.createTransaction.mockResolvedValue({})
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/cash/cash-1']}>
      <CashScreen definition={cabinetModules.cash} />
    </MemoryRouter>,
  )

  expect(await screen.findByRole('link', { name: 'Редагувати' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Видалити касу' })).toBeVisible()
  expect(
    screen.getByRole('heading', { name: 'Переказ між касами' }),
  ).toBeVisible()
  await user.type(screen.getByLabelText('Сума'), '25')
  await user.click(screen.getByRole('button', { name: 'Записати операцію' }))

  expect(cashMocks.createTransaction).toHaveBeenCalledOnce()
})

it('allows editing an existing register but still meters new register creation at the cash quota', async () => {
  vi.mocked(useCabinet).mockReturnValue(
    cabinet(undefined, 'active', { used: 5, max: 5 }),
  )
  cashMocks.getById.mockResolvedValue({
    id: 'cash-1',
    name: 'Основна каса',
    type: 'cash',
    isActive: true,
    balances: { UAH: 100 },
  })
  cashMocks.update.mockResolvedValue({ id: 'cash-1' })
  const user = userEvent.setup()
  const { unmount } = render(
    <MemoryRouter initialEntries={['/app/garage/cash/cash-1/edit']}>
      <CashScreen definition={cabinetModules.cash} />
    </MemoryRouter>,
  )

  const editSubmit = await screen.findByRole('button', { name: 'Зберегти' })
  expect(editSubmit).toBeEnabled()
  await user.click(editSubmit)
  expect(cashMocks.update).toHaveBeenCalledWith('cash-1', {
    name: 'Основна каса',
  })

  unmount()
  render(
    <MemoryRouter initialEntries={['/app/garage/cash/new']}>
      <CashScreen definition={cabinetModules.cash} />
    </MemoryRouter>,
  )
  await user.type(screen.getByLabelText('Назва'), 'Ще одна каса')
  expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled()
})

it('submits one idempotent transfer and reloads authoritative balances and ledger', async () => {
  const sourceBefore = {
    id: 'cash-source',
    name: 'Основна каса',
    type: 'cash',
    isActive: true,
    balances: { UAH: 100 },
  }
  const sourceAfter = { ...sourceBefore, balances: { UAH: 75 } }
  const destinationBefore = {
    id: 'cash-destination',
    name: 'Валютна каса',
    type: 'cash',
    isActive: true,
    balances: { USD: 10 },
  }
  const destinationAfter = {
    ...destinationBefore,
    balances: { USD: 25 },
  }
  cashMocks.getById
    .mockResolvedValueOnce(sourceBefore)
    .mockResolvedValue(sourceAfter)
  cashMocks.list
    .mockResolvedValueOnce([sourceBefore, destinationBefore])
    .mockResolvedValue([sourceAfter, destinationAfter])
  cashMocks.transactions
    .mockResolvedValueOnce({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    })
    .mockResolvedValue({
      items: [
        {
          id: 'transaction-out',
          type: 'transfer_out',
          direction: 'out',
          amount: 30,
          currency: 'UAH',
          note: 'Обмін',
          createdAt: '2026-08-28T12:00:00Z',
          createdByName: 'Олена',
          referenceId: 'transfer-1',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    })
  let resolveTransfer!: (value: unknown) => void
  cashMocks.transfer.mockReturnValue(
    new Promise((resolve) => {
      resolveTransfer = resolve
    }),
  )
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
    '00000000-0000-4000-8000-000000000001',
  )
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/cash/cash-source']}>
      <CashScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Переказ між касами' })
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Каса-отримувач' }),
    'cash-destination',
  )
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Валюта списання' }),
    'UAH',
  )
  await user.type(screen.getByLabelText('Сума списання'), '30')
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Валюта зарахування' }),
    'USD',
  )
  await user.type(screen.getByLabelText('Сума зарахування'), '15')
  await user.type(screen.getByLabelText('Нотатка переказу'), 'Обмін')
  const submit = screen.getByRole('button', { name: 'Переказати кошти' })
  await user.click(submit)
  await user.click(submit)

  expect(cashMocks.transfer).toHaveBeenCalledOnce()
  expect(cashMocks.transfer).toHaveBeenCalledWith(
    {
      fromRegisterId: 'cash-source',
      fromCurrency: 'UAH',
      toRegisterId: 'cash-destination',
      toCurrency: 'USD',
      amountOut: 30,
      amountIn: 15,
      note: 'Обмін',
    },
    {
      idempotencyKey: 'cash-transfer-00000000-0000-4000-8000-000000000001',
    },
  )
  expect(submit).toBeDisabled()
  resolveTransfer({
    out: {
      id: 'transaction-out',
      type: 'transfer_out',
      direction: 'out',
      amount: 30,
      currency: 'UAH',
      note: 'Обмін',
      createdAt: '2026-08-28T12:00:00Z',
      createdByName: 'Олена',
      referenceId: 'transfer-1',
    },
    in: {
      id: 'transaction-in',
      type: 'transfer_in',
      direction: 'in',
      amount: 15,
      currency: 'USD',
      note: 'Обмін',
      createdAt: '2026-08-28T12:00:00Z',
      createdByName: 'Олена',
      referenceId: 'transfer-1',
    },
  })

  expect(await screen.findByText('75')).toBeVisible()
  expect(screen.getByText('Баланс каси-отримувача: 25 USD')).toBeVisible()
  expect(screen.getByText(/30 UAH/)).toBeVisible()
  expect(cashMocks.getById).toHaveBeenCalledTimes(2)
  expect(cashMocks.list).toHaveBeenCalledTimes(2)
  expect(cashMocks.transactions).toHaveBeenCalledTimes(2)
})

it('reuses a transfer key after an ambiguous failure and rotates it when the payload changes', async () => {
  const source = {
    id: 'cash-source',
    name: 'Основна каса',
    type: 'cash',
    isActive: true,
    balances: { UAH: 100 },
  }
  const destination = {
    id: 'cash-destination',
    name: 'Валютна каса',
    type: 'cash',
    isActive: true,
    balances: { USD: 10 },
  }
  cashMocks.getById.mockResolvedValue(source)
  cashMocks.list.mockResolvedValue([source, destination])
  cashMocks.transactions.mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  })
  cashMocks.transfer
    .mockRejectedValueOnce({
      kind: 'network',
      message: 'Немає з’єднання з мережею.',
    })
    .mockRejectedValueOnce({
      kind: 'timeout',
      message: 'Час очікування запиту минув.',
    })
    .mockResolvedValue({})
  const randomUUID = vi
    .spyOn(globalThis.crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/cash/cash-source']}>
      <CashScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Переказ між касами' })
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Каса-отримувач' }),
    'cash-destination',
  )
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Валюта списання' }),
    'UAH',
  )
  await user.type(screen.getByLabelText('Сума списання'), '30')
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Валюта зарахування' }),
    'USD',
  )
  await user.type(screen.getByLabelText('Сума зарахування'), '15')
  const submit = screen.getByRole('button', { name: 'Переказати кошти' })

  await user.click(submit)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Немає з’єднання з мережею.',
  )
  await user.click(submit)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Час очікування запиту минув.',
  )

  expect(cashMocks.transfer).toHaveBeenNthCalledWith(1, expect.any(Object), {
    idempotencyKey: 'cash-transfer-00000000-0000-4000-8000-000000000001',
  })
  expect(cashMocks.transfer).toHaveBeenNthCalledWith(2, expect.any(Object), {
    idempotencyKey: 'cash-transfer-00000000-0000-4000-8000-000000000001',
  })
  expect(randomUUID).toHaveBeenCalledOnce()

  await user.type(screen.getByLabelText('Нотатка переказу'), 'Інший намір')
  await user.click(submit)

  expect(cashMocks.transfer).toHaveBeenNthCalledWith(3, expect.any(Object), {
    idempotencyKey: 'cash-transfer-00000000-0000-4000-8000-000000000002',
  })
  expect(randomUUID).toHaveBeenCalledTimes(2)
})

it('reuses a movement key after an ambiguous failure and rotates it after success', async () => {
  const register = {
    id: 'cash-1',
    name: 'Основна каса',
    type: 'cash',
    isActive: true,
    balances: { UAH: 100 },
  }
  cashMocks.getById.mockResolvedValue(register)
  cashMocks.transactions.mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  })
  cashMocks.createTransaction
    .mockRejectedValueOnce({
      kind: 'network',
      message: 'Немає з’єднання з мережею.',
    })
    .mockResolvedValue({})
  const randomUUID = vi
    .spyOn(globalThis.crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/cash/cash-1']}>
      <CashScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Ручна операція' })
  await user.type(screen.getByLabelText('Сума'), '25')
  await user.type(screen.getByLabelText('Валюта'), 'UAH')
  const submit = screen.getByRole('button', { name: 'Записати операцію' })

  await user.click(submit)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Немає з’єднання з мережею.',
  )
  expect(screen.getByRole('heading', { name: 'Ручна операція' })).toBeVisible()
  await user.click(submit)

  expect(cashMocks.createTransaction).toHaveBeenNthCalledWith(
    1,
    'cash-1',
    expect.any(Object),
    {
      idempotencyKey: 'cash-movement-00000000-0000-4000-8000-000000000001',
    },
  )
  expect(cashMocks.createTransaction).toHaveBeenNthCalledWith(
    2,
    'cash-1',
    expect.any(Object),
    {
      idempotencyKey: 'cash-movement-00000000-0000-4000-8000-000000000001',
    },
  )
  expect(randomUUID).toHaveBeenCalledOnce()

  await user.type(screen.getByLabelText('Сума'), '25')
  await user.click(submit)

  expect(cashMocks.createTransaction).toHaveBeenNthCalledWith(
    3,
    'cash-1',
    expect.any(Object),
    {
      idempotencyKey: 'cash-movement-00000000-0000-4000-8000-000000000002',
    },
  )
  expect(randomUUID).toHaveBeenCalledTimes(2)
})

it('blocks a manual movement when finance.view is revoked after render', async () => {
  const access = cabinet()
  vi.mocked(useCabinet).mockReturnValue(access)
  cashMocks.getById.mockResolvedValue({
    id: 'cash-1',
    name: 'Основна каса',
    type: 'cash',
    isActive: true,
    balances: { UAH: 100 },
  })
  cashMocks.transactions.mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  })
  cashMocks.createTransaction.mockResolvedValue({})
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/cash/cash-1']}>
      <CashScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Ручна операція' })
  await user.type(screen.getByLabelText('Сума'), '25')
  ;(access.snapshot!.permissions as Set<string>).delete('finance.view')
  await user.click(screen.getByRole('button', { name: 'Записати операцію' }))

  expect(cashMocks.createTransaction).not.toHaveBeenCalled()
})

it('rotates a movement key when client-side navigation changes the register resource', async () => {
  const register = (id: string) => ({
    id,
    name: id === 'cash-1' ? 'Основна каса' : 'Резервна каса',
    type: 'cash',
    isActive: true,
    balances: { UAH: 100 },
  })
  cashMocks.getById.mockImplementation((id: string) =>
    Promise.resolve(register(id)),
  )
  cashMocks.transactions.mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  })
  cashMocks.createTransaction.mockRejectedValue({
    kind: 'network',
    message: 'Немає з’єднання з мережею.',
  })
  const randomUUID = vi
    .spyOn(globalThis.crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
  const router = createMemoryRouter(
    [
      {
        path: '/app/:tenant/cash/:registerId',
        element: <CashScreen definition={definition} />,
      },
    ],
    { initialEntries: ['/app/garage/cash/cash-1'] },
  )
  const user = userEvent.setup()
  render(<RouterProvider router={router} />)

  await screen.findByRole('heading', { name: 'Основна каса' })
  await user.type(screen.getByLabelText('Сума'), '25')
  await user.type(screen.getByLabelText('Валюта'), 'UAH')
  await user.click(screen.getByRole('button', { name: 'Записати операцію' }))
  expect(await screen.findByRole('alert')).toBeVisible()

  await act(async () => {
    await router.navigate('/app/garage/cash/cash-2')
  })
  await screen.findByRole('heading', { name: 'Резервна каса' })
  await user.click(screen.getByRole('button', { name: 'Записати операцію' }))

  expect(cashMocks.createTransaction).toHaveBeenNthCalledWith(
    1,
    'cash-1',
    expect.any(Object),
    {
      idempotencyKey: 'cash-movement-00000000-0000-4000-8000-000000000001',
    },
  )
  expect(cashMocks.createTransaction).toHaveBeenNthCalledWith(
    2,
    'cash-2',
    expect.any(Object),
    {
      idempotencyKey: 'cash-movement-00000000-0000-4000-8000-000000000002',
    },
  )
  expect(randomUUID).toHaveBeenCalledTimes(2)
})

it('keeps the transfer form available while surfacing an explicit conflict', async () => {
  const source = {
    id: 'cash-source',
    name: 'Основна каса',
    type: 'cash',
    isActive: true,
    balances: { UAH: 100 },
  }
  const destination = {
    id: 'cash-destination',
    name: 'Валютна каса',
    type: 'cash',
    isActive: true,
    balances: { USD: 10 },
  }
  cashMocks.getById.mockResolvedValue(source)
  cashMocks.list.mockResolvedValue([source, destination])
  cashMocks.transactions.mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  })
  cashMocks.transfer.mockRejectedValue({
    kind: 'conflict',
    status: 409,
    message: 'Недостатньо коштів для переказу.',
  })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/cash/cash-source']}>
      <CashScreen definition={definition} />
    </MemoryRouter>,
  )

  await user.selectOptions(
    await screen.findByRole('combobox', { name: 'Каса-отримувач' }),
    'cash-destination',
  )
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Валюта списання' }),
    'UAH',
  )
  await user.type(screen.getByLabelText('Сума списання'), '150')
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Валюта зарахування' }),
    'USD',
  )
  await user.type(screen.getByLabelText('Сума зарахування'), '30')
  await user.click(screen.getByRole('button', { name: 'Переказати кошти' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Недостатньо коштів для переказу.',
  )
  expect(
    screen.getByRole('heading', { name: 'Переказ між касами' }),
  ).toBeVisible()
})

it.each([
  ['finance.manage', cabinet(['finance.view'])],
  ['an active subscription', cabinet(undefined, 'cancelled')],
])('hides transfers without %s', async (_, access) => {
  vi.mocked(useCabinet).mockReturnValue(access)
  cashMocks.getById.mockResolvedValue({
    id: 'cash-source',
    name: 'Основна каса',
    type: 'cash',
    isActive: true,
    balances: { UAH: 100 },
  })
  cashMocks.transactions.mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  })

  render(
    <MemoryRouter initialEntries={['/app/garage/cash/cash-source']}>
      <CashScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Основна каса' })
  expect(
    screen.queryByRole('heading', { name: 'Переказ між касами' }),
  ).not.toBeInTheDocument()
  expect(cashMocks.transfer).not.toHaveBeenCalled()
})

it('passes URL-backed ledger currency, date, and page filters to Core', async () => {
  cashMocks.getById.mockResolvedValue({
    id: 'cash-1',
    name: 'Каса',
    type: 'cash',
    isActive: true,
    balances: { UAH: 100 },
  })
  cashMocks.transactions.mockResolvedValue({
    items: [],
    page: 2,
    pageSize: 20,
    total: 30,
    totalPages: 2,
  })

  render(
    <MemoryRouter
      initialEntries={[
        '/app/garage/cash/cash-1?currency=UAH&from=2026-08-01&to=2026-08-28&page=2',
      ]}
    >
      <CashScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Каса' })
  expect(cashMocks.transactions).toHaveBeenCalledWith(
    'cash-1',
    {
      currency: 'UAH',
      from: '2026-08-01',
      to: '2026-08-28',
      page: 2,
    },
    expect.any(Object),
  )
})

it('preserves ledger total pages and moves backward and forward through the URL', async () => {
  cashMocks.getById.mockResolvedValue({
    id: 'cash-1',
    name: 'Каса',
    type: 'cash',
    isActive: true,
    balances: { UAH: 100 },
  })
  cashMocks.transactions.mockResolvedValue({
    items: [],
    page: 2,
    pageSize: 20,
    total: 61,
    totalPages: 4,
  })
  const user = userEvent.setup()
  render(
    <MemoryRouter
      initialEntries={['/app/garage/cash/cash-1?currency=UAH&page=2']}
    >
      <CashScreen definition={definition} />
    </MemoryRouter>,
  )

  expect(await screen.findByText('Сторінка 2 з 4')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Попередня сторінка' }))
  expect(cashMocks.transactions).toHaveBeenLastCalledWith(
    'cash-1',
    {
      currency: 'UAH',
      from: undefined,
      to: undefined,
      page: 1,
    },
    expect.any(Object),
  )

  await user.click(screen.getByRole('button', { name: 'Наступна сторінка' }))
  expect(cashMocks.transactions).toHaveBeenLastCalledWith(
    'cash-1',
    {
      currency: 'UAH',
      from: undefined,
      to: undefined,
      page: 2,
    },
    expect.any(Object),
  )
})

it('creates a register with contract-supported currencies and opening balances', async () => {
  cashMocks.create.mockResolvedValue({ id: 'cash-2' })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/cash/new']}>
      <CashScreen definition={definition} />
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText('Назва'), 'Основна каса')
  await user.type(screen.getByLabelText('Валюти'), 'UAH, USD')
  await user.type(
    screen.getByLabelText('Початкові баланси'),
    'UAH: 1000, USD: 25',
  )
  await user.click(screen.getByRole('button', { name: 'Зберегти' }))

  expect(cashMocks.create).toHaveBeenCalledWith({
    name: 'Основна каса',
    type: 'cash',
    currencies: ['UAH', 'USD'],
    initialBalances: { UAH: 1000, USD: 25 },
  })
})

it('renders the register type as immutable in edit mode', async () => {
  cashMocks.getById.mockResolvedValue({
    id: 'cash-1',
    name: 'Основна каса',
    type: 'bank',
    isActive: true,
    balances: { UAH: 100 },
  })
  render(
    <MemoryRouter initialEntries={['/app/garage/cash/cash-1/edit']}>
      <CashScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Редагувати касу' })
  expect(screen.getByText('Тип каси: bank')).toBeVisible()
  expect(
    screen.queryByRole('combobox', { name: 'Тип' }),
  ).not.toBeInTheDocument()
})

it('manages register currencies and lifecycle through documented endpoints', async () => {
  const register = {
    id: 'cash-1',
    name: 'Каса',
    type: 'cash',
    isActive: true,
    balances: { UAH: 100 },
  }
  cashMocks.getById.mockResolvedValue(register)
  cashMocks.transactions.mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  })
  cashMocks.addCurrency.mockResolvedValue(undefined)
  cashMocks.removeCurrency.mockResolvedValue(undefined)
  cashMocks.deactivate.mockResolvedValue({ ...register, isActive: false })
  cashMocks.activate.mockResolvedValue(register)
  cashMocks.remove.mockResolvedValue(undefined)
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/cash/cash-1']}>
      <CashScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Каса' })
  await user.type(screen.getByLabelText('Нова валюта'), 'USD')
  await user.click(screen.getByRole('button', { name: 'Додати валюту' }))
  expect(cashMocks.addCurrency).toHaveBeenCalledWith('cash-1', 'USD')

  await user.click(screen.getByRole('button', { name: 'Видалити UAH' }))
  expect(cashMocks.removeCurrency).toHaveBeenCalledWith('cash-1', 'UAH')

  await user.click(screen.getByRole('button', { name: 'Деактивувати касу' }))
  expect(cashMocks.deactivate).toHaveBeenCalledWith('cash-1')

  await user.click(
    await screen.findByRole('button', { name: 'Активувати касу' }),
  )
  expect(cashMocks.activate).toHaveBeenCalledWith('cash-1')

  const deleteTrigger = screen.getByRole('button', { name: 'Видалити касу' })
  await user.click(deleteTrigger)
  const dialog = screen.getByRole('alertdialog', {
    name: 'Підтвердити видалення каси',
  })
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(screen.getByRole('button', { name: 'Скасувати' })).toHaveFocus()
  await user.tab({ shift: true })
  expect(
    screen.getByRole('button', { name: 'Підтвердити видалення' }),
  ).toHaveFocus()
  await user.tab()
  expect(screen.getByRole('button', { name: 'Скасувати' })).toHaveFocus()
  await user.click(screen.getByRole('button', { name: 'Скасувати' }))
  await waitFor(() => expect(deleteTrigger).toHaveFocus())
  await user.click(deleteTrigger)
  await user.click(
    screen.getByRole('button', { name: 'Підтвердити видалення' }),
  )
  expect(cashMocks.remove).toHaveBeenCalledWith('cash-1')
})

it('hides cash mutations without finance.manage and renders quota failures', async () => {
  vi.mocked(useCabinet).mockReturnValue(cabinet(['finance.view']))
  cashMocks.list.mockResolvedValue([])
  cashMocks.dailySummary.mockResolvedValue({
    date: '2026-08-28',
    timeZone: 'Europe/Kiev',
    startUtc: '2026-08-27T21:00:00Z',
    endUtc: '2026-08-28T21:00:00Z',
    registers: [],
  })
  const { unmount } = render(
    <MemoryRouter initialEntries={['/app/garage/cash?date=2026-08-28']}>
      <CashScreen definition={definition} />
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { name: 'Каси' })
  expect(
    screen.queryByRole('link', { name: 'Нова каса' }),
  ).not.toBeInTheDocument()
  unmount()

  vi.mocked(useCabinet).mockReturnValue(cabinet())
  cashMocks.create.mockRejectedValue({
    kind: 'unknown',
    status: 402,
    message: 'Quota exceeded',
  })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/cash/new']}>
      <CashScreen definition={definition} />
    </MemoryRouter>,
  )
  await user.type(screen.getByLabelText('Назва'), 'Ще одна каса')
  await user.click(screen.getByRole('button', { name: 'Зберегти' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Функція потребує активної підписки.',
  )
})
