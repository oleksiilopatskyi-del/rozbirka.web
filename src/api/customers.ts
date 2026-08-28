import { apiClient } from './client'
import type { Page, RequestOptions } from './contracts'

export interface CustomerListItem {
  id: string
  name: string
  phone: string | null
  notes: string | null
  ordersCount: number
  totalAmount: number | null
  lastOrderAt: string | null
}
export interface CustomerSearchItem {
  id: string
  name: string
  phone: string | null
  ordersCount: number
}
export interface CustomerOrder {
  id: string
  number: number
  status: string
  totalAmount: number | null
  currency: string | null
  partNames: string[]
  createdAt: string
}
export interface CustomerDetail {
  id: string
  name: string
  phone: string | null
  notes: string | null
  isActive: boolean
  createdAt: string
  ordersCount: number | null
  totalAmount: number | null
  averageAmount: number | null
  firstOrderAt: string | null
  lastOrderAt: string | null
  orders: CustomerOrder[]
}
export interface CustomerInput {
  name?: string
  phone?: string | null
  notes?: string | null
}
export interface CustomerPhoneConflict {
  customerId: string
  customerName: string
  isActive: boolean
  message: string
}
export interface CustomerListParams {
  q?: string
  page?: number
  pageSize?: number
}
const requestConfig = (options: RequestOptions) =>
  options.signal ? { signal: options.signal } : {}
const endpoint = (id: string) => `/customers/${encodeURIComponent(id)}`
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const readCustomerPhoneConflict = (
  error: unknown,
): CustomerPhoneConflict | null => {
  if (!isRecord(error) || !isRecord(error['response'])) return null
  const response = error['response']
  if (response['status'] !== 409 || !isRecord(response['data'])) return null
  const conflict = response['data']['error']
  if (
    !isRecord(conflict) ||
    conflict['code'] !== 'CUSTOMER_PHONE_EXISTS' ||
    typeof conflict['customerId'] !== 'string' ||
    typeof conflict['customerName'] !== 'string' ||
    typeof conflict['isActive'] !== 'boolean' ||
    typeof conflict['message'] !== 'string'
  )
    return null
  return {
    customerId: conflict['customerId'],
    customerName: conflict['customerName'],
    isActive: conflict['isActive'],
    message: conflict['message'],
  }
}

export const customersApi = {
  async list(
    params: CustomerListParams = {},
    options: RequestOptions = {},
  ): Promise<Page<CustomerListItem>> {
    return (
      await apiClient.get<Page<CustomerListItem>>('/customers', {
        params,
        ...requestConfig(options),
      })
    ).data
  },
  async search(
    q: string,
    options: RequestOptions = {},
  ): Promise<CustomerSearchItem[]> {
    return (
      await apiClient.get<CustomerSearchItem[]>('/customers/search', {
        params: { q },
        ...requestConfig(options),
      })
    ).data
  },
  async getById(
    id: string,
    options: RequestOptions = {},
  ): Promise<CustomerDetail> {
    return (
      await apiClient.get<CustomerDetail>(endpoint(id), requestConfig(options))
    ).data
  },
  async create(input: Required<Pick<CustomerInput, 'name'>> & CustomerInput) {
    return (
      await apiClient.post<{ customer: CustomerListItem }>('/customers', input)
    ).data
  },
  async update(id: string, input: CustomerInput) {
    return (
      await apiClient.patch<{ customer: CustomerListItem }>(endpoint(id), input)
    ).data
  },
  async activate(id: string): Promise<CustomerDetail> {
    return (await apiClient.patch<CustomerDetail>(`${endpoint(id)}/activate`))
      .data
  },
  async deactivate(id: string): Promise<CustomerDetail> {
    return (await apiClient.patch<CustomerDetail>(`${endpoint(id)}/deactivate`))
      .data
  },
  async remove(id: string): Promise<void> {
    await apiClient.delete(endpoint(id))
  },
}
