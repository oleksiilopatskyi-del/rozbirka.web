import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useCabinet } from '../CabinetContext'
import { CustomersScreen } from './CustomersScreen'

const customerMocks = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  activate: vi.fn(),
  deactivate: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('@/api/customers', async (importOriginal) => ({
  ...(await importOriginal()),
  customersApi: customerMocks,
}))
vi.mock('../CabinetContext', () => ({ useCabinet: vi.fn() }))

const definition = {
  key: 'customers',
  routeSegment: '/customers',
  released: true,
  viewPermission: 'customers.view',
  mutationPermission: 'customers.manage',
  allowedSubscriptionStates: ['active'],
} as never
const cabinet = (
  permissions: string[] = [
    'customers.view',
    'customers.manage',
    'orders.view',
    'orders.manage',
    'parts.view',
    'finance.view',
  ],
) =>
  ({
    status: 'ready',
    targetTenant: { id: 'tenant-1', slug: 'garage' },
    snapshot: {
      userId: 'user-1',
      tenantId: 'tenant-1',
      generation: 1,
      role: 'manager',
      permissions: new Set(permissions),
      features: new Set(),
      entitlement: { state: 'active', usage: {} },
    },
    error: null,
  }) as unknown as ReturnType<typeof useCabinet>

afterEach(() => {
  vi.clearAllMocks()
})
beforeEach(() => vi.mocked(useCabinet).mockReturnValue(cabinet()))

it('renders the server-returned directory result instead of deriving customer statistics locally', async () => {
  const user = userEvent.setup()
  customerMocks.list.mockResolvedValue({
    items: [
      {
        id: 'customer-1',
        name: 'Ірина',
        phone: null,
        notes: null,
        ordersCount: 3,
        totalAmount: 100,
        lastOrderAt: null,
      },
    ],
    page: 1,
    pageSize: 20,
    total: 27,
    totalPages: 2,
  })

  render(
    <MemoryRouter initialEntries={['/app/garage/customers?q=Ірина&page=1']}>
      <CustomersScreen definition={definition} />
    </MemoryRouter>,
  )

  expect(await screen.findByText('Ірина')).toBeVisible()
  expect(screen.getByText('знайдено')).toBeVisible()
  expect(screen.getByText('27')).toBeVisible()
  expect(customerMocks.list).toHaveBeenCalledWith(
    { q: 'Ірина', page: 1 },
    expect.any(Object),
  )

  await user.click(screen.getByRole('button', { name: 'Наступна сторінка' }))
  expect(customerMocks.list).toHaveBeenLastCalledWith(
    { q: 'Ірина', page: 2 },
    expect.any(Object),
  )
})

it('treats the new-customer route as a form rather than a customer identifier', () => {
  render(
    <MemoryRouter initialEntries={['/app/garage/customers/new']}>
      <CustomersScreen definition={definition} />
    </MemoryRouter>,
  )

  expect(screen.getByRole('heading', { name: 'Новий клієнт' })).toBeVisible()
  expect(customerMocks.getById).not.toHaveBeenCalled()
})

it('uses browser-native contact links and carries only the customer id to a new order', async () => {
  const user = userEvent.setup()
  const writeText = vi.spyOn(navigator.clipboard, 'writeText')
  customerMocks.getById.mockResolvedValue({
    id: 'customer-1',
    name: 'Ірина',
    phone: '+380501112233',
    notes: null,
    isActive: true,
    createdAt: '2026-08-28T00:00:00Z',
    orders: [
      {
        id: 'order-7',
        number: 7,
        status: 'confirmed',
        totalAmount: 10500,
        currency: 'UAH',
        partNames: ['Двері'],
        createdAt: '2026-08-28T00:00:00Z',
      },
    ],
    ordersCount: 9,
    totalAmount: 10500,
    averageAmount: 1166.67,
    firstOrderAt: null,
    lastOrderAt: null,
  })

  render(
    <MemoryRouter initialEntries={['/app/garage/customers/customer-1']}>
      <CustomersScreen definition={definition} />
    </MemoryRouter>,
  )

  expect(await screen.findByText('9')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Зателефонувати' })).toHaveAttribute(
    'href',
    'tel:+380501112233',
  )
  expect(screen.getByRole('link', { name: 'SMS' })).toHaveAttribute(
    'href',
    'sms:+380501112233',
  )
  expect(
    screen.getByRole('link', { name: 'Створити замовлення' }),
  ).toHaveAttribute('href', '/app/garage/orders/new?customerId=customer-1')
  expect(screen.getByRole('link', { name: /#7/ })).toHaveAttribute(
    'href',
    '/app/garage/orders/order-7',
  )

  await user.click(screen.getByRole('button', { name: 'Копіювати телефон' }))
  expect(writeText).toHaveBeenCalledWith('+380501112233')
})

it('offers reuse and reactivation for the documented duplicate-phone conflict', async () => {
  customerMocks.create.mockRejectedValue({
    response: {
      status: 409,
      data: {
        error: {
          code: 'CUSTOMER_PHONE_EXISTS',
          customerId: 'customer-existing',
          customerName: 'Ірина',
          isActive: false,
          message: 'Телефон уже використовується',
        },
      },
    },
  })
  customerMocks.activate.mockResolvedValue({ id: 'customer-existing' })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/customers/new']}>
      <CustomersScreen definition={definition} />
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText('Ім’я'), 'Нова Ірина')
  await user.type(screen.getByLabelText('Телефон'), '+380501112233')
  await user.click(screen.getByRole('button', { name: 'Зберегти' }))

  expect(
    await screen.findByRole('link', { name: 'Використати клієнта Ірина' }),
  ).toHaveAttribute('href', '/app/garage/customers/customer-existing')
  await user.click(screen.getByRole('button', { name: 'Активувати Ірина' }))
  expect(customerMocks.activate).toHaveBeenCalledWith(
    'customer-existing',
    expect.objectContaining({
      signal: expect.any(AbortSignal) as AbortSignal,
    }),
  )
})

it('rechecks orders.view before reactivating a duplicate from customer edit', async () => {
  const currentCabinet = cabinet()
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  customerMocks.getById.mockResolvedValue({
    id: 'customer-1',
    name: 'Ірина',
    phone: '+380501112233',
    notes: null,
    isActive: true,
    createdAt: '2026-08-28T00:00:00Z',
    orders: [],
    ordersCount: 0,
    totalAmount: null,
    averageAmount: null,
    firstOrderAt: null,
    lastOrderAt: null,
  })
  customerMocks.update.mockRejectedValue({
    response: {
      status: 409,
      data: {
        error: {
          code: 'CUSTOMER_PHONE_EXISTS',
          customerId: 'customer-existing',
          customerName: 'Олена',
          isActive: false,
          message: 'Телефон уже використовується',
        },
      },
    },
  })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/customers/customer-1/edit']}>
      <CustomersScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByDisplayValue('Ірина')
  await user.click(screen.getByRole('button', { name: 'Зберегти' }))
  const reactivate = await screen.findByRole('button', {
    name: 'Активувати Олена',
  })
  ;(currentCabinet.snapshot?.permissions as Set<string>).delete('orders.view')
  await user.click(reactivate)

  expect(customerMocks.activate).not.toHaveBeenCalled()
})

it('blocks create and edit mutations when the customer module decision denies them', async () => {
  vi.mocked(useCabinet).mockReturnValue(cabinet(['customers.view']))
  customerMocks.getById.mockResolvedValue({
    id: 'customer-1',
    name: 'Ірина',
    phone: null,
    notes: null,
    isActive: true,
    createdAt: '2026-08-28T00:00:00Z',
    orders: [],
    ordersCount: 0,
    totalAmount: null,
    averageAmount: null,
    firstOrderAt: null,
    lastOrderAt: null,
  })
  const user = userEvent.setup()
  const { unmount } = render(
    <MemoryRouter initialEntries={['/app/garage/customers/new']}>
      <CustomersScreen definition={definition} />
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText('Ім’я'), 'Нова Ірина')
  expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled()
  expect(customerMocks.create).not.toHaveBeenCalled()
  unmount()

  vi.mocked(useCabinet).mockReturnValue(
    cabinet(['customers.view', 'orders.view']),
  )
  render(
    <MemoryRouter initialEntries={['/app/garage/customers/customer-1/edit']}>
      <CustomersScreen definition={definition} />
    </MemoryRouter>,
  )
  await screen.findByDisplayValue('Ірина')
  expect(screen.getByRole('button', { name: 'Зберегти' })).toBeDisabled()
  expect(customerMocks.update).not.toHaveBeenCalled()
})

it('rechecks the latest customer permission before dispatching create', async () => {
  const currentCabinet = cabinet()
  vi.mocked(useCabinet).mockReturnValue(currentCabinet)
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/customers/new']}>
      <CustomersScreen definition={definition} />
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText('Ім’я'), 'Нова Ірина')
  const permissions = currentCabinet.snapshot?.permissions as Set<string>
  permissions.delete('customers.manage')
  await user.click(screen.getByRole('button', { name: 'Зберегти' }))

  expect(customerMocks.create).not.toHaveBeenCalled()
})

it('passes the guarded tenant signal to customer create', async () => {
  customerMocks.create.mockResolvedValue({ customer: { id: 'customer-1' } })
  customerMocks.getById.mockResolvedValue({
    id: 'customer-1',
    name: 'Нова Ірина',
    phone: null,
    notes: null,
    isActive: true,
    createdAt: '2026-08-28T00:00:00Z',
    orders: [],
    ordersCount: 0,
    totalAmount: null,
    averageAmount: null,
    firstOrderAt: null,
    lastOrderAt: null,
  })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/customers/new']}>
      <CustomersScreen definition={definition} />
    </MemoryRouter>,
  )

  await user.type(screen.getByLabelText('Ім’я'), 'Нова Ірина')
  await user.click(screen.getByRole('button', { name: 'Зберегти' }))

  expect(customerMocks.create).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Нова Ірина' }),
    expect.objectContaining({
      signal: expect.any(AbortSignal) as AbortSignal,
    }),
  )
})

it('does not fetch bundled detail for an edit route without orders.view', async () => {
  vi.mocked(useCabinet).mockReturnValue(
    cabinet(['customers.view', 'customers.manage']),
  )
  render(
    <MemoryRouter initialEntries={['/app/garage/customers/customer-1/edit']}>
      <CustomersScreen definition={definition} />
    </MemoryRouter>,
  )

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Потрібен доступ до замовлень',
  )
  expect(customerMocks.getById).not.toHaveBeenCalled()
})

it('does not fetch or render bundled order and finance detail without orders.view', async () => {
  vi.mocked(useCabinet).mockReturnValue(
    cabinet(['customers.view', 'customers.manage', 'finance.view']),
  )
  render(
    <MemoryRouter initialEntries={['/app/garage/customers/customer-1']}>
      <CustomersScreen definition={definition} />
    </MemoryRouter>,
  )

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Потрібен доступ до замовлень',
  )
  expect(customerMocks.getById).not.toHaveBeenCalled()
  expect(
    screen.queryByRole('heading', { name: 'Історія замовлень' }),
  ).not.toBeInTheDocument()
  expect(screen.queryByText('Витрачено')).not.toBeInTheDocument()
})

it('uses access decisions and customer eligibility for order, lifecycle, and delete actions', async () => {
  const customer = {
    id: 'customer-1',
    name: 'Ірина',
    phone: null,
    notes: null,
    isActive: false,
    createdAt: '2026-08-28T00:00:00Z',
    orders: [],
    ordersCount: 2,
    totalAmount: 500,
    averageAmount: 250,
    firstOrderAt: null,
    lastOrderAt: null,
  }
  customerMocks.getById.mockResolvedValue(customer)
  vi.mocked(useCabinet).mockReturnValue(
    cabinet([
      'customers.view',
      'customers.manage',
      'orders.view',
      'orders.manage',
      'finance.view',
    ]),
  )
  render(
    <MemoryRouter initialEntries={['/app/garage/customers/customer-1']}>
      <CustomersScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Ірина' })
  expect(
    screen.queryByRole('link', { name: 'Створити замовлення' }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Редагувати' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Активувати' })).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Видалити' }),
  ).not.toBeInTheDocument()
})

it('hides finance metrics without finance.view and preserves a nullable order count', async () => {
  vi.mocked(useCabinet).mockReturnValue(
    cabinet(['customers.view', 'customers.manage', 'orders.view']),
  )
  customerMocks.getById.mockResolvedValue({
    id: 'customer-1',
    name: 'Ірина',
    phone: null,
    notes: null,
    isActive: true,
    createdAt: '2026-08-28T00:00:00Z',
    orders: [],
    ordersCount: null,
    totalAmount: null,
    averageAmount: null,
    firstOrderAt: null,
    lastOrderAt: null,
  })
  render(
    <MemoryRouter initialEntries={['/app/garage/customers/customer-1']}>
      <CustomersScreen definition={definition} />
    </MemoryRouter>,
  )

  await screen.findByRole('heading', { name: 'Ірина' })
  expect(screen.getByText('—')).toBeVisible()
  expect(screen.queryByText('Витрачено')).not.toBeInTheDocument()
  expect(screen.queryByText('Середній чек')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Видалити' }),
  ).not.toBeInTheDocument()
})

it('contains delete-dialog focus and restores it to the trigger on close', async () => {
  customerMocks.getById.mockResolvedValue({
    id: 'customer-1',
    name: 'Ірина',
    phone: null,
    notes: null,
    isActive: true,
    createdAt: '2026-08-28T00:00:00Z',
    orders: [],
    ordersCount: 0,
    totalAmount: null,
    averageAmount: null,
    firstOrderAt: null,
    lastOrderAt: null,
  })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/app/garage/customers/customer-1']}>
      <CustomersScreen definition={definition} />
    </MemoryRouter>,
  )

  const trigger = await screen.findByRole('button', { name: 'Видалити' })
  await user.click(trigger)
  const confirm = screen.getByRole('button', { name: 'Підтвердити' })
  const cancel = screen.getByRole('button', { name: 'Скасувати' })
  expect(cancel).toHaveFocus()

  await user.tab({ shift: true })
  expect(confirm).toHaveFocus()
  await user.tab()
  expect(cancel).toHaveFocus()
  await user.click(cancel)
  await waitFor(() => expect(trigger).toHaveFocus())
})
