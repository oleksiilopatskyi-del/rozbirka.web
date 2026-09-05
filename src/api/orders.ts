import { apiClient, withIdempotency } from './client'
import type { IdempotentMutation, Page, RequestOptions } from './contracts'

export interface OrderListItem {
  id: string
  number: number
  status: string
  customerName: string | null
  itemCount: number
  partNames: string[]
  paymentAccountNames: string[]
  totalAmount: number | null
  createdAt: string
}
export interface OrderItemInput {
  partId: string
  quantity: number
  unitPrice: number
}
export interface CreateOrderInput {
  customerId: string | null
  notes: string | null
  items: OrderItemInput[]
}
export interface ConfirmPayment {
  accountId: string
  amount: number
  currency: string
}
export interface OrderDetail {
  id: string
  number: number
  status: string
  customerId: string | null
  customerName: string | null
  notes: string | null
  items: (OrderItemInput & {
    id: string
    partName: string
    totalPrice: number
  })[]
  payments: (ConfirmPayment & { id: string; accountName: string })[]
  history: {
    eventType: string
    userName: string
    createdAt: string
    data: string | null
  }[]
  totalAmount: number | null
  totalPaid: number | null
  paymentCurrency: string | null
  createdAt: string
  createdByName: string
}
export interface OrderListParams {
  search?: string
  status?: string
  customerId?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}
const endpoint = (id: string) => `/orders/${encodeURIComponent(id)}`
const requestConfig = (options: RequestOptions) =>
  options.signal ? { signal: options.signal } : {}

export const ordersApi = {
  async list(
    params: OrderListParams = {},
    options: RequestOptions = {},
  ): Promise<Page<OrderListItem>> {
    return (
      await apiClient.get<Page<OrderListItem>>('/orders', {
        params,
        ...requestConfig(options),
      })
    ).data
  },
  async getById(
    id: string,
    options: RequestOptions = {},
  ): Promise<OrderDetail> {
    return (
      await apiClient.get<OrderDetail>(endpoint(id), requestConfig(options))
    ).data
  },
  async create(input: CreateOrderInput): Promise<OrderDetail> {
    return (await apiClient.post<OrderDetail>('/orders', input)).data
  },
  async updateItems(id: string, items: OrderItemInput[]): Promise<OrderDetail> {
    return (
      await apiClient.put<OrderDetail>(`${endpoint(id)}/items`, { items })
    ).data
  },
  async updateNotes(id: string, notes: string | null): Promise<OrderDetail> {
    return (
      await apiClient.put<OrderDetail>(`${endpoint(id)}/notes`, { notes })
    ).data
  },
  async setCustomer(
    id: string,
    customerId: string | null,
  ): Promise<OrderDetail> {
    return (
      await apiClient.put<OrderDetail>(`${endpoint(id)}/customer`, {
        customerId,
      })
    ).data
  },
  async confirm(
    id: string,
    input: { payments: ConfirmPayment[] },
    replay: IdempotentMutation,
  ): Promise<OrderDetail> {
    return (
      await apiClient.post<OrderDetail>(
        `${endpoint(id)}/confirm`,
        input,
        withIdempotency({}, replay),
      )
    ).data
  },
  async cancel(id: string): Promise<OrderDetail> {
    return (await apiClient.post<OrderDetail>(`${endpoint(id)}/cancel`)).data
  },
  async refund(
    id: string,
    input: { refundReason: string },
    replay: IdempotentMutation,
  ): Promise<OrderDetail> {
    return (
      await apiClient.post<OrderDetail>(
        `${endpoint(id)}/refund`,
        input,
        withIdempotency({}, replay),
      )
    ).data
  },
}
