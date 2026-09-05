import { apiClient, withIdempotency } from './client'
import type { IdempotentMutation, Page, RequestOptions } from './contracts'

export interface CashRegister {
  id: string
  name: string
  type: string
  isActive: boolean
  balances: Record<string, number>
}
export interface CashDailySummary {
  date: string
  timeZone: string
  startUtc: string
  endUtc: string
  registers: {
    id: string
    name: string
    type: string
    isActive: boolean
    sortOrder: number
    currencies: {
      currency: string
      income: number
      expense: number
      net: number
      balance: number
      operationCount: number
    }[]
  }[]
}
export interface CashTransaction {
  id: string
  type: string
  direction: string
  amount: number
  currency: string
  note: string | null
  createdAt: string
  createdByName: string
  referenceId: string | null
}
export interface CashTransactionInput {
  type: 'manual_in' | 'manual_out'
  amount: number
  currency: string | null
  note: string | null
}
export interface CashTransferInput {
  fromRegisterId: string
  fromCurrency: string
  toRegisterId: string
  toCurrency: string
  amountOut: number
  amountIn: number
  note?: string | null
}
export interface CashTransferResult {
  out: CashTransaction
  in: CashTransaction
}
export interface CashTransactionParams {
  currency?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}
const endpoint = (id: string) => `/cash/${encodeURIComponent(id)}`
const requestConfig = (options: RequestOptions) =>
  options.signal ? { signal: options.signal } : {}

export const cashApi = {
  async list(
    activeOnly?: boolean,
    options: RequestOptions = {},
  ): Promise<CashRegister[]> {
    return (
      await apiClient.get<CashRegister[]>('/cash', {
        params: activeOnly === undefined ? undefined : { activeOnly },
        ...requestConfig(options),
      })
    ).data
  },
  async dailySummary(
    date: string,
    timeZone: string,
    options: RequestOptions = {},
  ): Promise<CashDailySummary> {
    return (
      await apiClient.get<CashDailySummary>('/cash/daily-summary', {
        params: { Date: date, TimeZone: timeZone },
        ...requestConfig(options),
      })
    ).data
  },
  async getById(
    id: string,
    options: RequestOptions = {},
  ): Promise<CashRegister> {
    return (
      await apiClient.get<CashRegister>(endpoint(id), requestConfig(options))
    ).data
  },
  async create(input: {
    name: string
    type: string
    currencies?: string[] | null
    initialBalances?: Record<string, number> | null
  }): Promise<CashRegister> {
    return (await apiClient.post<CashRegister>('/cash', input)).data
  },
  async update(id: string, input: { name: string }): Promise<CashRegister> {
    return (await apiClient.put<CashRegister>(endpoint(id), input)).data
  },
  async activate(id: string): Promise<CashRegister> {
    return (await apiClient.patch<CashRegister>(`${endpoint(id)}/activate`))
      .data
  },
  async deactivate(id: string): Promise<CashRegister> {
    return (await apiClient.patch<CashRegister>(`${endpoint(id)}/deactivate`))
      .data
  },
  async remove(id: string): Promise<void> {
    await apiClient.delete(endpoint(id))
  },
  async addCurrency(id: string, currency: string): Promise<void> {
    await apiClient.post(`${endpoint(id)}/currencies`, { currency })
  },
  async removeCurrency(id: string, currency: string): Promise<void> {
    await apiClient.delete(
      `${endpoint(id)}/currencies/${encodeURIComponent(currency)}`,
    )
  },
  async transactions(
    id: string,
    params: CashTransactionParams = {},
    options: RequestOptions = {},
  ): Promise<Page<CashTransaction>> {
    return (
      await apiClient.get<Page<CashTransaction>>(
        `${endpoint(id)}/transactions`,
        { params, ...requestConfig(options) },
      )
    ).data
  },
  async createTransaction(
    id: string,
    input: CashTransactionInput,
    replay: IdempotentMutation,
  ): Promise<CashTransaction> {
    return (
      await apiClient.post<CashTransaction>(
        `${endpoint(id)}/transactions`,
        input,
        withIdempotency({}, replay),
      )
    ).data
  },
  async transfer(
    input: CashTransferInput,
    replay: IdempotentMutation,
  ): Promise<CashTransferResult> {
    return (
      await apiClient.post<CashTransferResult>(
        '/cash/transfer',
        input,
        withIdempotency({}, replay),
      )
    ).data
  },
}
