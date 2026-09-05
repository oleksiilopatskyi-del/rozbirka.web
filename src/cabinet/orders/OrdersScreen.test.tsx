import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useCabinet } from '../CabinetContext'
import { tenantRequestScope } from '../tenant-request-scope'
import { OrdersScreen } from './OrdersScreen'

const orderMocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  getById: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
  refund: vi.fn(),
  updateItems: vi.fn(),
  updateNotes: vi.fn(),
  setCustomer: vi.fn(),
}))
const partMocks = vi.hoisted(() => ({ list: vi.fn() }))
const customerMocks = vi.hoisted(() => ({
  search: vi.fn(),
  create: vi.fn(),
  activate: vi.fn(),
}))
vi.mock('@/api/orders', () => ({ ordersApi: orderMocks }))
vi.mock('@/api/parts', () => ({ partsApi: partMocks }))
vi.mock('@/api/customers', async (importOriginal) => ({
  ...(await importOriginal()),
  customersApi: customerMocks,
}))
vi.mock('../CabinetContext', () => ({ useCabinet: vi.fn() }))

const definition = {
  key: 'orders',
  routeSegment: '/orders',
  released: true,
  viewPermission: 'orders.view',
  mutationPermission: 'orders.manage',
  allowedSubscriptionStates: ['active'],
} as never
const cabinet = (
  permissions: string[] = [
    'orders.view',
    'orders.manage',
    'finance.manage',
    'parts.view',
    'customers.view',
    'customers.manage',
  ],
  entitlementState: 'active' | 'cancelled' = 'active',
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
      entitlement: { state: entitlementState, usage: {} },
    },
    error: null,
  }) as unknown as ReturnType<typeof useCabinet>
afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})
beforeEach(() => {
  vi.mocked(useCabinet).mockReturnValue(cabinet())
  orderMocks.list.mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  })
})

it('prevents a duplicate canonical create while the first request is pending', async () => {
  let resolve!: (value: { id: string }) => void
  orderMocks.create.mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const user = userEvent.setup()
  render(
    <MemoryRouter
      initialEntries={['/app/garage/orders/new?customerId=customer-1']}
    >
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText('ID запчастини'), 'part-1')
  await user.type(screen.getByLabelText('Кількість'), '1')
  await user.type(screen.getByLabelText('Ціна за одиницю'), '250')
  const submit = screen.getByRole('button', { name: 'Створити замовлення' })
  await user.click(submit)
  await user.click(submit)

  expect(orderMocks.create).toHaveBeenCalledOnce()
  expect(submit).toBeDisabled()
  resolve({ id: 'order-1' })
})

it.each(['parts.view', 'customers.view'])(
  'blocks canonical creation when %s is revoked after render',
  async (permission) => {
    const access = cabinet()
    vi.mocked(useCabinet).mockReturnValue(access)
    orderMocks.create.mockResolvedValue({ id: 'order-1' })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/app/garage/orders/new']}>
        <OrdersScreen definition={definition} />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('ID запчастини'), 'part-1')
    await user.type(screen.getByLabelText('Кількість'), '1')
    await user.type(screen.getByLabelText('Ціна за одиницю'), '250')
    ;(access.snapshot!.permissions as Set<string>).delete(permission)
    await user.click(
      screen.getByRole('button', { name: 'Створити замовлення' }),
    )

    expect(orderMocks.create).not.toHaveBeenCalled()
  },
)

it('blocks add-item replacement when parts.view is revoked after render', async () => {
  const access = cabinet()
  vi.mocked(useCabinet).mockReturnValue(access)
  orderMocks.getById.mockResolvedValue({
    items: [
      {
        id: 'item-1',
        partId: 'part-1',
        partName: 'Ліхтар',
        quantity: 1,
        unitPrice: 100,
        totalPrice: 100,
      },
    ],
  })
  orderMocks.updateItems.mockResolvedValue({ id: 'order-1' })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/orders/order-1/items/new']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText('ID запчастини'), 'part-2')
  await user.type(screen.getByLabelText('Кількість'), '1')
  await user.type(screen.getByLabelText('Ціна за одиницю'), '75')
  const submit = await screen.findByRole('button', { name: 'Додати позицію' })
  await waitFor(() => expect(submit).toBeEnabled())
  ;(access.snapshot!.permissions as Set<string>).delete('parts.view')
  await user.click(submit)

  expect(orderMocks.updateItems).not.toHaveBeenCalled()
})

it.each([
  ['parts.view', ['orders.view', 'orders.manage', 'customers.view']],
  ['customers.view', ['orders.view', 'orders.manage', 'parts.view']],
])('blocks canonical creation without %s', (_, permissions) => {
  vi.mocked(useCabinet).mockReturnValue(cabinet(permissions))

  render(
    <MemoryRouter initialEntries={['/app/garage/orders/new']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  expect(screen.getByRole('alert')).toHaveTextContent(
    'Потрібен доступ до запчастин і клієнтів.',
  )
  expect(
    screen.queryByRole('button', { name: 'Створити замовлення' }),
  ).not.toBeInTheDocument()
})

it('creates a customer inline before canonical order creation', async () => {
  customerMocks.create.mockResolvedValue({
    customer: { id: 'customer-new', name: 'Нова Ірина' },
  })
  orderMocks.create.mockResolvedValue({ id: 'order-1' })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/orders/new']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText('Ім’я нового клієнта'), 'Нова Ірина')
  await user.type(
    screen.getByLabelText('Телефон нового клієнта'),
    '+380501112233',
  )
  await user.click(screen.getByRole('button', { name: 'Створити клієнта' }))
  await user.type(screen.getByLabelText('ID запчастини'), 'part-1')
  await user.type(screen.getByLabelText('Кількість'), '1')
  await user.type(screen.getByLabelText('Ціна за одиницю'), '250')
  await user.click(screen.getByRole('button', { name: 'Створити замовлення' }))

  expect(customerMocks.create).toHaveBeenCalledWith(
    {
      name: 'Нова Ірина',
      phone: '+380501112233',
      notes: null,
    },
    { signal: tenantRequestScope.signal },
  )
  expect(orderMocks.create).toHaveBeenCalledWith(
    expect.objectContaining({ customerId: 'customer-new' }),
  )
})

it.each([
  [
    'customers.manage',
    cabinet(['orders.view', 'orders.manage', 'parts.view', 'customers.view']),
  ],
  ['an active subscription', cabinet(undefined, 'cancelled')],
])('hides inline customer creation without %s', (_, access) => {
  vi.mocked(useCabinet).mockReturnValue(access)

  render(
    <MemoryRouter initialEntries={['/app/garage/orders/new']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  expect(screen.getByLabelText('Пошук клієнта')).toBeVisible()
  expect(
    screen.queryByRole('group', { name: 'Новий клієнт' }),
  ).not.toBeInTheDocument()
  expect(customerMocks.create).not.toHaveBeenCalled()
})

it.each(['orders.manage', 'customers.view', 'customers.manage'])(
  'blocks inline customer creation when %s is revoked after render',
  async (permission) => {
    const access = cabinet()
    vi.mocked(useCabinet).mockReturnValue(access)
    customerMocks.create.mockResolvedValue({
      customer: { id: 'customer-new', name: 'Нова Ірина' },
    })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/app/garage/orders/new']}>
        <OrdersScreen definition={definition} />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Ім’я нового клієнта'), 'Нова Ірина')
    ;(access.snapshot!.permissions as Set<string>).delete(permission)
    await user.click(screen.getByRole('button', { name: 'Створити клієнта' }))

    expect(customerMocks.create).not.toHaveBeenCalled()
  },
)

it('reuses an active duplicate-phone customer in the pending order', async () => {
  customerMocks.create.mockRejectedValue({
    response: {
      status: 409,
      data: {
        error: {
          code: 'CUSTOMER_PHONE_EXISTS',
          customerId: 'customer-existing',
          customerName: 'Ірина',
          isActive: true,
          message: 'Телефон уже використовується',
        },
      },
    },
  })
  orderMocks.create.mockResolvedValue({ id: 'order-1' })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/orders/new']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText('Ім’я нового клієнта'), 'Нова Ірина')
  await user.type(
    screen.getByLabelText('Телефон нового клієнта'),
    '+380501112233',
  )
  await user.click(screen.getByRole('button', { name: 'Створити клієнта' }))
  await user.click(
    await screen.findByRole('button', { name: 'Використати клієнта Ірина' }),
  )
  await user.type(screen.getByLabelText('ID запчастини'), 'part-1')
  await user.type(screen.getByLabelText('Кількість'), '1')
  await user.type(screen.getByLabelText('Ціна за одиницю'), '250')
  await user.click(screen.getByRole('button', { name: 'Створити замовлення' }))

  expect(orderMocks.create).toHaveBeenCalledWith(
    expect.objectContaining({ customerId: 'customer-existing' }),
  )
})

it('reactivates an inactive duplicate-phone customer before selecting it', async () => {
  customerMocks.create.mockRejectedValue({
    response: {
      status: 409,
      data: {
        error: {
          code: 'CUSTOMER_PHONE_EXISTS',
          customerId: 'customer-inactive',
          customerName: 'Олена',
          isActive: false,
          message: 'Телефон уже використовується',
        },
      },
    },
  })
  customerMocks.activate.mockResolvedValue({
    id: 'customer-inactive',
    name: 'Олена',
  })
  orderMocks.create.mockResolvedValue({ id: 'order-1' })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/orders/new']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText('Ім’я нового клієнта'), 'Нова Олена')
  await user.type(
    screen.getByLabelText('Телефон нового клієнта'),
    '+380501112233',
  )
  await user.click(screen.getByRole('button', { name: 'Створити клієнта' }))
  await user.click(
    await screen.findByRole('button', { name: 'Активувати Олена' }),
  )
  await user.type(screen.getByLabelText('ID запчастини'), 'part-1')
  await user.type(screen.getByLabelText('Кількість'), '1')
  await user.type(screen.getByLabelText('Ціна за одиницю'), '250')
  await user.click(screen.getByRole('button', { name: 'Створити замовлення' }))

  expect(customerMocks.activate).toHaveBeenCalledWith('customer-inactive', {
    signal: tenantRequestScope.signal,
  })
  expect(orderMocks.create).toHaveBeenCalledWith(
    expect.objectContaining({ customerId: 'customer-inactive' }),
  )
})

it('blocks duplicate-customer reactivation when customers.view is revoked after render', async () => {
  const access = cabinet()
  vi.mocked(useCabinet).mockReturnValue(access)
  customerMocks.create.mockRejectedValue({
    response: {
      status: 409,
      data: {
        error: {
          code: 'CUSTOMER_PHONE_EXISTS',
          customerId: 'customer-inactive',
          customerName: 'Олена',
          isActive: false,
          message: 'Телефон уже використовується',
        },
      },
    },
  })
  customerMocks.activate.mockResolvedValue({
    id: 'customer-inactive',
    name: 'Олена',
  })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/orders/new']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText('Ім’я нового клієнта'), 'Нова Олена')
  await user.click(screen.getByRole('button', { name: 'Створити клієнта' }))
  const activate = await screen.findByRole('button', {
    name: 'Активувати Олена',
  })
  ;(access.snapshot!.permissions as Set<string>).delete('customers.view')
  await user.click(activate)

  expect(customerMocks.activate).not.toHaveBeenCalled()
})

it.each([
  ['parts.view', ['orders.view', 'orders.manage', 'customers.view']],
  ['customers.view', ['orders.view', 'orders.manage', 'parts.view']],
])('hides the directory create action without %s', async (_, permissions) => {
  vi.mocked(useCabinet).mockReturnValue(cabinet(permissions))

  render(
    <MemoryRouter initialEntries={['/app/garage/orders']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Замовлення' })
  expect(
    screen.queryByRole('link', { name: 'Нове замовлення' }),
  ).not.toBeInTheDocument()
})

it('uses the reusable customer and part searches to populate a canonical order', async () => {
  partMocks.list.mockResolvedValue({
    items: [
      {
        id: 'part-1',
        name: 'Ліхтар',
        photos: [],
        quantityTotal: 3,
        quantityReserved: 0,
        quantityAvailable: 3,
        quantitySoldTotal: 0,
        status: 'available',
        car: null,
        order: null,
      },
    ],
    page: 1,
    pageSize: 10,
    total: 1,
    totalPages: 1,
  })
  customerMocks.search.mockResolvedValue([
    {
      id: 'customer-1',
      name: 'Ірина',
      phone: null,
      ordersCount: 0,
    },
  ])
  orderMocks.create.mockResolvedValue({ id: 'order-1' })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/orders/new']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText('Пошук запчастини'), 'Ліхтар')
  await user.click(
    await screen.findByRole('button', { name: 'Обрати запчастину Ліхтар' }),
  )
  await user.type(screen.getByLabelText('Пошук клієнта'), 'Ірина')
  await user.click(
    await screen.findByRole('button', { name: 'Обрати клієнта Ірина' }),
  )
  await user.type(screen.getByLabelText('Кількість'), '1')
  await user.type(screen.getByLabelText('Ціна за одиницю'), '250')
  await user.click(screen.getByRole('button', { name: 'Створити замовлення' }))

  expect(partMocks.list).toHaveBeenCalledWith(
    expect.objectContaining({ q: 'Ліхтар', page: 1, pageSize: 10 }),
  )
  expect(customerMocks.search).toHaveBeenCalledWith('Ірина', expect.any(Object))
  expect(orderMocks.create).toHaveBeenCalledWith({
    customerId: 'customer-1',
    notes: null,
    items: [{ partId: 'part-1', quantity: 1, unitPrice: 250 }],
  })
})

it('appends an item to the full Core item list when the replacement endpoint is used', async () => {
  const order = {
    id: 'order-1',
    number: 1,
    status: 'pending',
    customerId: null,
    customerName: null,
    notes: null,
    payments: [],
    history: [],
    totalAmount: 250,
    totalPaid: 0,
    paymentCurrency: 'UAH',
    createdAt: '2026-08-28T00:00:00Z',
    createdByName: 'Олена',
    items: [
      {
        id: 'item-1',
        partId: 'part-1',
        partName: 'Ліхтар',
        quantity: 1,
        unitPrice: 100,
        totalPrice: 100,
      },
      {
        id: 'item-2',
        partId: 'part-2',
        partName: 'Двері',
        quantity: 1,
        unitPrice: 150,
        totalPrice: 150,
      },
    ],
  } as never
  orderMocks.getById.mockResolvedValue(order)
  orderMocks.updateItems.mockResolvedValue(order)
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/orders/order-1/items/new']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText('ID запчастини'), 'part-3')
  await user.type(screen.getByLabelText('Кількість'), '2')
  await user.type(screen.getByLabelText('Ціна за одиницю'), '75')
  await user.click(screen.getByRole('button', { name: 'Додати позицію' }))

  expect(orderMocks.updateItems).toHaveBeenCalledWith('order-1', [
    { partId: 'part-1', quantity: 1, unitPrice: 100 },
    { partId: 'part-2', quantity: 1, unitPrice: 150 },
    { partId: 'part-3', quantity: 2, unitPrice: 75 },
  ])
})

it('blocks add-item submission until the complete existing order has loaded', async () => {
  let resolveOrder!: (value: unknown) => void
  orderMocks.getById.mockReturnValue(
    new Promise((resolve) => {
      resolveOrder = resolve
    }),
  )
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/orders/order-1/items/new']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText('ID запчастини'), 'part-2')
  await user.type(screen.getByLabelText('Кількість'), '1')
  await user.type(screen.getByLabelText('Ціна за одиницю'), '75')
  const submit = screen.getByRole('button', { name: 'Додати позицію' })

  expect(submit).toBeDisabled()
  expect(submit).toHaveAttribute('aria-busy', 'true')
  await user.click(submit)
  expect(orderMocks.updateItems).not.toHaveBeenCalled()

  resolveOrder({
    items: [
      {
        id: 'item-1',
        partId: 'part-1',
        partName: 'Ліхтар',
        quantity: 1,
        unitPrice: 100,
        totalPrice: 100,
      },
    ],
  })

  await waitFor(() => expect(submit).toBeEnabled())
  expect(submit).toHaveAttribute('aria-busy', 'false')
})

it('keeps add-item submission blocked when loading the complete order fails', async () => {
  orderMocks.getById.mockRejectedValue(new Error('network'))
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/orders/order-1/items/new']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText('ID запчастини'), 'part-2')
  await user.type(screen.getByLabelText('Кількість'), '1')
  await user.type(screen.getByLabelText('Ціна за одиницю'), '75')

  expect(await screen.findByRole('alert')).toBeVisible()
  const submit = screen.getByRole('button', { name: 'Додати позицію' })
  expect(submit).toBeDisabled()
  expect(submit).toHaveAttribute('aria-busy', 'false')
  await user.click(submit)
  expect(orderMocks.updateItems).not.toHaveBeenCalled()
})

it('merges an added quantity into the existing part instead of duplicating it', async () => {
  const order = {
    id: 'order-1',
    items: [
      {
        id: 'item-1',
        partId: 'part-1',
        partName: 'Ліхтар',
        quantity: 1,
        unitPrice: 100,
        totalPrice: 100,
      },
      {
        id: 'item-2',
        partId: 'part-2',
        partName: 'Двері',
        quantity: 1,
        unitPrice: 150,
        totalPrice: 150,
      },
    ],
  }
  orderMocks.getById.mockResolvedValue(order)
  orderMocks.updateItems.mockResolvedValue(order)
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/orders/order-1/items/new']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText('ID запчастини'), 'part-1')
  await user.type(screen.getByLabelText('Кількість'), '2')
  await user.type(screen.getByLabelText('Ціна за одиницю'), '75')
  await user.click(
    await screen.findByRole('button', { name: 'Додати позицію' }),
  )

  expect(orderMocks.updateItems).toHaveBeenCalledWith('order-1', [
    { partId: 'part-1', quantity: 3, unitPrice: 75 },
    { partId: 'part-2', quantity: 1, unitPrice: 150 },
  ])
})

it('passes a payment allocation to Core unchanged when confirming an order', async () => {
  const generatedId = '00000000-0000-4000-8000-000000000001'
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(generatedId)
  const order = {
    id: 'order-1',
    number: 1,
    status: 'pending',
    customerId: null,
    customerName: null,
    notes: null,
    items: [],
    payments: [],
    history: [],
    totalAmount: 250,
    totalPaid: 0,
    paymentCurrency: 'UAH',
    createdAt: '2026-08-28T00:00:00Z',
    createdByName: 'Олена',
  } as never
  orderMocks.getById.mockResolvedValue(order)
  orderMocks.confirm.mockResolvedValue(order)
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/orders/order-1']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Замовлення #1' })
  await user.type(screen.getByLabelText('ID рахунку'), 'cash-1')
  await user.type(screen.getByLabelText('Сума платежу'), '250')
  await user.type(screen.getByLabelText('Валюта платежу'), 'UAH')
  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))

  expect(orderMocks.confirm).toHaveBeenCalledWith(
    'order-1',
    { payments: [{ accountId: 'cash-1', amount: 250, currency: 'UAH' }] },
    { idempotencyKey: `order-confirm-${generatedId}` },
  )
})

it('reuses a confirmation key after an ambiguous failure and rotates it when the payment changes', async () => {
  const order = {
    id: 'order-1',
    number: 1,
    status: 'pending',
    customerId: null,
    customerName: null,
    notes: null,
    items: [],
    payments: [],
    history: [],
    totalAmount: 250,
    totalPaid: 0,
    paymentCurrency: 'UAH',
    createdAt: '2026-08-28T00:00:00Z',
    createdByName: 'Олена',
  } as never
  orderMocks.getById.mockResolvedValue(order)
  orderMocks.confirm
    .mockRejectedValueOnce({
      kind: 'network',
      message: 'Немає з’єднання з мережею.',
    })
    .mockRejectedValueOnce({
      kind: 'timeout',
      message: 'Час очікування запиту минув.',
    })
    .mockResolvedValue(order)
  const randomUUID = vi
    .spyOn(globalThis.crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/orders/order-1']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Замовлення #1' })
  await user.type(screen.getByLabelText('ID рахунку'), 'cash-1')
  await user.type(screen.getByLabelText('Сума платежу'), '250')
  await user.type(screen.getByLabelText('Валюта платежу'), 'UAH')
  const submit = screen.getByRole('button', { name: 'Підтвердити' })

  await user.click(submit)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Немає з’єднання з мережею.',
  )
  await user.click(submit)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Час очікування запиту минув.',
  )

  expect(orderMocks.confirm).toHaveBeenNthCalledWith(
    1,
    'order-1',
    expect.any(Object),
    {
      idempotencyKey: 'order-confirm-00000000-0000-4000-8000-000000000001',
    },
  )
  expect(orderMocks.confirm).toHaveBeenNthCalledWith(
    2,
    'order-1',
    expect.any(Object),
    {
      idempotencyKey: 'order-confirm-00000000-0000-4000-8000-000000000001',
    },
  )
  expect(randomUUID).toHaveBeenCalledOnce()

  await user.clear(screen.getByLabelText('Сума платежу'))
  await user.type(screen.getByLabelText('Сума платежу'), '200')
  await user.click(submit)

  expect(orderMocks.confirm).toHaveBeenNthCalledWith(
    3,
    'order-1',
    expect.any(Object),
    {
      idempotencyKey: 'order-confirm-00000000-0000-4000-8000-000000000002',
    },
  )
  expect(randomUUID).toHaveBeenCalledTimes(2)
})

it('rotates a confirmation key when client-side navigation changes the order resource', async () => {
  const order = (id: string) => ({
    id,
    number: id === 'order-1' ? 1 : 2,
    status: 'pending',
    customerId: null,
    customerName: null,
    notes: null,
    items: [],
    payments: [],
    history: [],
    totalAmount: 250,
    totalPaid: 0,
    paymentCurrency: 'UAH',
    createdAt: '2026-08-28T00:00:00Z',
    createdByName: 'Олена',
  })
  orderMocks.getById.mockImplementation((id: string) =>
    Promise.resolve(order(id)),
  )
  orderMocks.confirm.mockRejectedValue({
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
        path: '/app/:tenant/orders/:orderId',
        element: <OrdersScreen definition={definition} />,
      },
    ],
    { initialEntries: ['/app/garage/orders/order-1'] },
  )
  const user = userEvent.setup()
  render(<RouterProvider router={router} />)

  await screen.findByRole('heading', { name: 'Замовлення #1' })
  await user.type(screen.getByLabelText('ID рахунку'), 'cash-1')
  await user.type(screen.getByLabelText('Сума платежу'), '250')
  await user.type(screen.getByLabelText('Валюта платежу'), 'UAH')
  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))
  expect(await screen.findByRole('alert')).toBeVisible()

  await act(async () => {
    await router.navigate('/app/garage/orders/order-2')
  })
  await screen.findByRole('heading', { name: 'Замовлення #2' })
  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))

  expect(orderMocks.confirm).toHaveBeenNthCalledWith(
    1,
    'order-1',
    expect.any(Object),
    {
      idempotencyKey: 'order-confirm-00000000-0000-4000-8000-000000000001',
    },
  )
  expect(orderMocks.confirm).toHaveBeenNthCalledWith(
    2,
    'order-2',
    expect.any(Object),
    {
      idempotencyKey: 'order-confirm-00000000-0000-4000-8000-000000000002',
    },
  )
  expect(randomUUID).toHaveBeenCalledTimes(2)
})

it('preserves a refund key only for ambiguous retries and rotates after definitive outcomes', async () => {
  const order = {
    id: 'order-1',
    number: 1,
    status: 'confirmed',
    customerId: null,
    customerName: null,
    notes: null,
    items: [],
    payments: [],
    history: [],
    totalAmount: 250,
    totalPaid: 250,
    paymentCurrency: 'UAH',
    createdAt: '2026-08-28T00:00:00Z',
    createdByName: 'Олена',
  }
  orderMocks.getById.mockResolvedValue(order)
  orderMocks.refund
    .mockRejectedValueOnce({
      kind: 'network',
      message: 'Немає з’єднання з мережею.',
    })
    .mockRejectedValueOnce({
      kind: 'validation',
      message: 'Перевірте причину повернення.',
    })
    .mockResolvedValue(order)
  const randomUUID = vi
    .spyOn(globalThis.crypto, 'randomUUID')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
    .mockReturnValueOnce('00000000-0000-4000-8000-000000000003')
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/orders/order-1']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Замовлення #1' })
  await user.type(screen.getByLabelText('Причина повернення'), 'Помилка каси')
  const submit = screen.getByRole('button', { name: 'Повернути кошти' })
  await user.click(submit)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Немає з’єднання з мережею.',
  )
  await user.click(submit)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Перевірте причину повернення.',
  )
  await user.click(submit)
  await waitFor(() =>
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
  )
  await user.click(submit)

  for (const [call, uuid] of [
    [1, '00000000-0000-4000-8000-000000000001'],
    [2, '00000000-0000-4000-8000-000000000001'],
    [3, '00000000-0000-4000-8000-000000000002'],
    [4, '00000000-0000-4000-8000-000000000003'],
  ] as const) {
    expect(orderMocks.refund).toHaveBeenNthCalledWith(
      call,
      'order-1',
      { refundReason: 'Помилка каси' },
      { idempotencyKey: `order-refund-${uuid}` },
    )
  }
  expect(randomUUID).toHaveBeenCalledTimes(3)
})

it('hides finance transitions when the snapshot lacks finance.manage', async () => {
  vi.mocked(useCabinet).mockReturnValue(
    cabinet(['orders.view', 'orders.manage']),
  )
  orderMocks.getById.mockResolvedValue({
    id: 'order-1',
    number: 1,
    status: 'pending',
    customerId: null,
    customerName: null,
    notes: null,
    items: [],
    payments: [],
    history: [],
    totalAmount: 250,
    totalPaid: 0,
    paymentCurrency: 'UAH',
    createdAt: '2026-08-28T00:00:00Z',
    createdByName: 'Олена',
  })
  render(
    <MemoryRouter initialEntries={['/app/garage/orders/order-1']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Замовлення #1' })
  expect(
    screen.queryByRole('button', { name: 'Підтвердити' }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Повернути кошти' }),
  ).not.toBeInTheDocument()
})

it('keeps server search, status, and pagination in the order URL', async () => {
  orderMocks.list.mockResolvedValue({
    items: [
      {
        id: 'order-12',
        number: 12,
        status: 'pending',
        customerName: 'Ірина',
        itemCount: 1,
        partNames: ['Двері'],
        paymentAccountNames: [],
        totalAmount: 250,
        createdAt: '2026-08-28T00:00:00Z',
      },
    ],
    page: 2,
    pageSize: 20,
    total: 41,
    totalPages: 3,
  })
  const user = userEvent.setup()
  render(
    <MemoryRouter
      initialEntries={['/app/garage/orders?q=door&status=pending&page=2']}
    >
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  expect(await screen.findByRole('link', { name: /#12/ })).toBeVisible()
  expect(screen.getByLabelText('Пошук замовлень')).toHaveValue('door')
  expect(screen.getByLabelText('Статус замовлення')).toHaveValue('pending')
  expect(orderMocks.list).toHaveBeenCalledWith(
    {
      search: 'door',
      status: 'pending',
      customerId: undefined,
      page: 2,
    },
    expect.any(Object),
  )

  await user.click(screen.getByRole('button', { name: 'Попередня сторінка' }))
  expect(orderMocks.list).toHaveBeenLastCalledWith(
    {
      search: 'door',
      status: 'pending',
      customerId: undefined,
      page: 1,
    },
    expect.any(Object),
  )
})

it('shows authoritative detail and lets orders.manage edit pending fields and cancel', async () => {
  vi.mocked(useCabinet).mockReturnValue(
    cabinet(['orders.view', 'orders.manage']),
  )
  const order = {
    id: 'order-1',
    number: 1,
    status: 'pending',
    customerId: 'customer-1',
    customerName: 'Ірина',
    notes: 'Перевірити',
    items: [
      {
        id: 'item-1',
        partId: 'part-1',
        partName: 'Двері',
        quantity: 1,
        unitPrice: 250,
        totalPrice: 250,
      },
    ],
    payments: [
      {
        id: 'payment-1',
        accountId: 'cash-1',
        accountName: 'Основна каса',
        amount: 100,
        currency: 'UAH',
      },
    ],
    history: [
      {
        eventType: 'created',
        userName: 'Олена',
        createdAt: '2026-08-28T00:00:00Z',
        data: null,
      },
    ],
    totalAmount: 250,
    totalPaid: 100,
    paymentCurrency: 'UAH',
    createdAt: '2026-08-28T00:00:00Z',
    createdByName: 'Олена',
  }
  orderMocks.getById.mockResolvedValue(order)
  orderMocks.updateNotes.mockResolvedValue({ ...order, notes: 'Готово' })
  orderMocks.setCustomer.mockResolvedValue(order)
  orderMocks.cancel.mockResolvedValue({ ...order, status: 'cancelled' })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/orders/order-1']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Замовлення #1' })
  const summaryTerms = screen.getAllByRole('term').map((t) => t.textContent)
  expect(summaryTerms).toEqual(
    expect.arrayContaining(['Клієнт', 'Разом', 'Сплачено']),
  )
  const summaryValues = screen
    .getAllByRole('definition')
    .map((d) => d.textContent?.replace(/\s+/g, ' ').trim())
  expect(summaryValues).toEqual(expect.arrayContaining(['250 UAH', '100 UAH']))
  const payments = screen.getByRole('table', { name: 'Платежі замовлення' })
  expect(within(payments).getByText('Основна каса')).toBeVisible()
  expect(within(payments).getByText('100 UAH')).toBeVisible()
  const audit = screen.getByRole('table', { name: 'Історія замовлення' })
  expect(within(audit).getByText('created')).toBeVisible()
  expect(within(audit).getByText('Олена')).toBeVisible()
  const timestamp = within(audit).getByText('2026-08-28 00:00')
  expect(timestamp.tagName).toBe('TIME')
  expect(timestamp).toHaveAttribute('datetime', '2026-08-28T00:00:00Z')
  expect(screen.getByRole('link', { name: 'Додати позицію' })).toHaveAttribute(
    'href',
    '/app/garage/orders/order-1/items/new',
  )

  await user.clear(screen.getByLabelText('Нотатки замовлення'))
  await user.type(screen.getByLabelText('Нотатки замовлення'), 'Готово')
  await user.click(screen.getByRole('button', { name: 'Зберегти нотатки' }))
  expect(orderMocks.updateNotes).toHaveBeenCalledWith('order-1', 'Готово')

  await user.clear(screen.getByLabelText('ID клієнта замовлення'))
  await user.type(screen.getByLabelText('ID клієнта замовлення'), 'customer-2')
  await user.click(screen.getByRole('button', { name: 'Зберегти клієнта' }))
  expect(orderMocks.setCustomer).toHaveBeenCalledWith('order-1', 'customer-2')

  expect(
    screen.queryByRole('button', { name: 'Підтвердити' }),
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Скасувати замовлення' }))
  expect(orderMocks.cancel).toHaveBeenCalledWith('order-1')
})

it('passes multiple payment allocations to Core unchanged', async () => {
  const generatedId = '00000000-0000-4000-8000-000000000002'
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(generatedId)
  const order = {
    id: 'order-1',
    number: 1,
    status: 'pending',
    customerId: null,
    customerName: null,
    notes: null,
    items: [],
    payments: [],
    history: [],
    totalAmount: 300,
    totalPaid: 0,
    paymentCurrency: 'UAH',
    createdAt: '2026-08-28T00:00:00Z',
    createdByName: 'Олена',
  }
  orderMocks.getById.mockResolvedValue(order)
  orderMocks.confirm.mockResolvedValue(order)
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/orders/order-1']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Замовлення #1' })
  await user.type(screen.getByLabelText('ID рахунку'), 'cash-1')
  await user.type(screen.getByLabelText('Сума платежу'), '200')
  await user.type(screen.getByLabelText('Валюта платежу'), 'UAH')
  await user.click(screen.getByRole('button', { name: 'Додати платіж' }))
  await user.type(screen.getByLabelText('ID рахунку 2'), 'bank-1')
  await user.type(screen.getByLabelText('Сума платежу 2'), '100')
  await user.type(screen.getByLabelText('Валюта платежу 2'), 'UAH')
  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))

  expect(orderMocks.confirm).toHaveBeenCalledWith(
    'order-1',
    {
      payments: [
        { accountId: 'cash-1', amount: 200, currency: 'UAH' },
        { accountId: 'bank-1', amount: 100, currency: 'UAH' },
      ],
    },
    { idempotencyKey: `order-confirm-${generatedId}` },
  )
})

it('replaces the full pending item set when quantity, price, or removal changes', async () => {
  const order = {
    id: 'order-1',
    number: 1,
    status: 'pending',
    customerId: null,
    customerName: null,
    notes: null,
    items: [
      {
        id: 'item-1',
        partId: 'part-1',
        partName: 'Ліхтар',
        quantity: 1,
        unitPrice: 100,
        totalPrice: 100,
      },
      {
        id: 'item-2',
        partId: 'part-2',
        partName: 'Двері',
        quantity: 1,
        unitPrice: 150,
        totalPrice: 150,
      },
    ],
    payments: [],
    history: [],
    totalAmount: 250,
    totalPaid: 0,
    paymentCurrency: 'UAH',
    createdAt: '2026-08-28T00:00:00Z',
    createdByName: 'Олена',
  }
  const repriced = {
    ...order,
    items: [
      { ...order.items[0], quantity: 2, unitPrice: 125, totalPrice: 250 },
      order.items[1],
    ],
  }
  orderMocks.getById.mockResolvedValue(order)
  orderMocks.updateItems
    .mockResolvedValueOnce(repriced)
    .mockResolvedValueOnce({ ...repriced, items: [repriced.items[0]] })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/orders/order-1']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Замовлення #1' })
  await user.clear(screen.getByLabelText('Кількість Ліхтар'))
  await user.type(screen.getByLabelText('Кількість Ліхтар'), '2')
  await user.clear(screen.getByLabelText('Ціна Ліхтар'))
  await user.type(screen.getByLabelText('Ціна Ліхтар'), '125')
  await user.click(screen.getByRole('button', { name: 'Зберегти позиції' }))

  expect(orderMocks.updateItems).toHaveBeenNthCalledWith(1, 'order-1', [
    { partId: 'part-1', quantity: 2, unitPrice: 125 },
    { partId: 'part-2', quantity: 1, unitPrice: 150 },
  ])

  await user.click(
    await screen.findByRole('button', { name: 'Видалити Двері' }),
  )
  expect(orderMocks.updateItems).toHaveBeenNthCalledWith(2, 'order-1', [
    { partId: 'part-1', quantity: 2, unitPrice: 125 },
  ])
})

it('cancels a pending order when its final item is removed', async () => {
  const order = {
    id: 'order-1',
    number: 1,
    status: 'pending',
    customerId: null,
    customerName: null,
    notes: null,
    items: [
      {
        id: 'item-1',
        partId: 'part-1',
        partName: 'Ліхтар',
        quantity: 1,
        unitPrice: 100,
        totalPrice: 100,
      },
    ],
    payments: [],
    history: [],
    totalAmount: 100,
    totalPaid: 0,
    paymentCurrency: 'UAH',
    createdAt: '2026-08-28T00:00:00Z',
    createdByName: 'Олена',
  }
  orderMocks.getById.mockResolvedValue(order)
  orderMocks.cancel.mockResolvedValue({ ...order, status: 'cancelled' })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/orders/order-1']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await user.click(
    await screen.findByRole('button', { name: 'Видалити Ліхтар' }),
  )

  expect(orderMocks.cancel).toHaveBeenCalledWith('order-1')
  expect(orderMocks.updateItems).not.toHaveBeenCalled()
})

it('renders audit timestamps and data for otherwise identical events', async () => {
  orderMocks.getById.mockResolvedValue({
    id: 'order-1',
    number: 1,
    status: 'confirmed',
    customerId: null,
    customerName: null,
    notes: null,
    items: [],
    payments: [],
    history: [
      {
        eventType: 'item_updated',
        userName: 'Олена',
        createdAt: '2026-08-28T10:15:00Z',
        data: 'quantity: 2',
      },
      {
        eventType: 'item_updated',
        userName: 'Олена',
        createdAt: '2026-08-28T10:15:00Z',
        data: 'unitPrice: 125',
      },
    ],
    totalAmount: 250,
    totalPaid: 250,
    paymentCurrency: 'UAH',
    createdAt: '2026-08-28T00:00:00Z',
    createdByName: 'Олена',
  })
  render(
    <MemoryRouter initialEntries={['/app/garage/orders/order-1']}>
      <OrdersScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Замовлення #1' })
  const stamps = screen.getAllByText(/2026.*10:15/)
  expect(stamps).toHaveLength(2)
  for (const stamp of stamps) {
    expect(stamp.tagName).toBe('TIME')
    expect(stamp).toHaveAttribute('datetime', '2026-08-28T10:15:00Z')
  }
  expect(screen.getByText('quantity: 2')).toBeVisible()
  expect(screen.getByText('unitPrice: 125')).toBeVisible()
})
