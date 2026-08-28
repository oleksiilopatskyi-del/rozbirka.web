import { apiClient } from './client'
import type { Page, RequestOptions } from './contracts'

export type CarStatus = 'active' | 'archived'

export interface CarProfitability {
  invested: number
  recouped: number
  remaining: number
  recoupedPercent: number | null
  partsTotal: number
  partsAvailable: number
  partsSold: number
}

export interface CarListProfitability {
  invested: number
  recouped: number
  recoupedPercent: number | null
  partsAvailable: number
}

export interface CarListItem {
  id: string
  code: string
  brand: string
  model: string
  year: number
  color: string | null
  status: string
  acquiredAt: string
  partsCount: number
  soldPartsCount: number
  coverPhotoUrl: string | null
  profitability?: CarListProfitability | null
}

export interface CarPhoto {
  id: string
  storageKey: string
  url: string
  thumbnailUrl: string
  sortOrder: number
}

export interface CarExpense {
  id: string
  name: string
  amount: number
  createdAt: string
}

export interface Car {
  id: string
  code: string
  brand: string
  model: string
  year: number
  color: string | null
  vin: string | null
  notes: string | null
  status: string
  acquiredAt: string
  createdAt: string
  purchasePrice: number
  photos: CarPhoto[]
  profitability?: CarProfitability | null
  expenses?: CarExpense[] | null
}

export interface CarPartListItem {
  id: string
  name: string
  status: string
  quantityAvailable: number
}

export interface CarListParams {
  search?: string | undefined
  status?: CarStatus | undefined
  page?: number | undefined
  pageSize?: number | undefined
}

export interface CreateCarRequest {
  code: string
  brand: string
  model: string
  year: number
  purchasePrice: number
  color?: string | null | undefined
  vin?: string | null | undefined
  acquiredAt?: string | null | undefined
  notes?: string | null | undefined
  photoKeys?: string[] | null | undefined
}

export interface UpdateCarRequest {
  code?: string | null | undefined
  brand?: string | null | undefined
  model?: string | null | undefined
  year?: number | null | undefined
  purchasePrice?: number | null | undefined
  color?: string | null | undefined
  vin?: string | null | undefined
  acquiredAt?: string | null | undefined
  notes?: string | null | undefined
}

export interface CarExpenseRequest {
  name: string
  amount: number
}

const carStatuses = new Set<CarStatus>(['active', 'archived'])

export const isCarStatus = (value: unknown): value is CarStatus =>
  typeof value === 'string' && carStatuses.has(value as CarStatus)

const requestConfig = (options: RequestOptions) =>
  options.signal ? { signal: options.signal } : {}

export const carsApi = {
  async list(
    params: CarListParams = {},
    options: RequestOptions = {},
  ): Promise<Page<CarListItem>> {
    const safeParams = {
      ...params,
      ...(!isCarStatus(params.status) ? { status: undefined } : {}),
    }
    const response = await apiClient.get<Page<CarListItem>>('/cars', {
      params: safeParams,
      ...requestConfig(options),
    })
    return response.data
  },

  async get(id: string, options: RequestOptions = {}): Promise<Car> {
    const response = await apiClient.get<Car>(
      `/cars/${id}`,
      requestConfig(options),
    )
    return response.data
  },

  async create(
    request: CreateCarRequest,
    options: RequestOptions = {},
  ): Promise<Car> {
    const safeRequest: CreateCarRequest = {
      code: request.code,
      brand: request.brand,
      model: request.model,
      year: request.year,
      purchasePrice: request.purchasePrice,
      color: request.color,
      vin: request.vin,
      acquiredAt: request.acquiredAt,
      notes: request.notes,
      photoKeys: request.photoKeys,
    }
    const response = await apiClient.post<Car>(
      '/cars',
      safeRequest,
      requestConfig(options),
    )
    return response.data
  },

  async update(
    id: string,
    request: UpdateCarRequest,
    options: RequestOptions = {},
  ): Promise<Car> {
    const safeRequest: UpdateCarRequest = {
      code: request.code,
      brand: request.brand,
      model: request.model,
      year: request.year,
      purchasePrice: request.purchasePrice,
      color: request.color,
      vin: request.vin,
      acquiredAt: request.acquiredAt,
      notes: request.notes,
    }
    const response = await apiClient.put<Car>(
      `/cars/${id}`,
      safeRequest,
      requestConfig(options),
    )
    return response.data
  },

  async remove(id: string, options: RequestOptions = {}): Promise<void> {
    await apiClient.delete(`/cars/${id}`, requestConfig(options))
  },

  async archive(id: string, options: RequestOptions = {}): Promise<void> {
    await apiClient.patch(
      `/cars/${id}/archive`,
      undefined,
      requestConfig(options),
    )
  },

  async listParts(
    id: string,
    params: Pick<CarListParams, 'status' | 'page' | 'pageSize'> = {},
    options: RequestOptions = {},
  ): Promise<Page<CarPartListItem>> {
    const response = await apiClient.get<Page<CarPartListItem>>(
      `/cars/${id}/parts`,
      {
        params,
        ...requestConfig(options),
      },
    )
    return response.data
  },

  async createExpense(
    id: string,
    request: CarExpenseRequest,
    options: RequestOptions = {},
  ): Promise<CarExpense> {
    const response = await apiClient.post<CarExpense>(
      `/cars/${id}/expenses`,
      request,
      requestConfig(options),
    )
    return response.data
  },

  async updateExpense(
    id: string,
    expenseId: string,
    request: CarExpenseRequest,
    options: RequestOptions = {},
  ): Promise<CarExpense> {
    const response = await apiClient.put<CarExpense>(
      `/cars/${id}/expenses/${expenseId}`,
      request,
      requestConfig(options),
    )
    return response.data
  },

  async removeExpense(
    id: string,
    expenseId: string,
    options: RequestOptions = {},
  ): Promise<void> {
    await apiClient.delete(
      `/cars/${id}/expenses/${expenseId}`,
      requestConfig(options),
    )
  },
}
