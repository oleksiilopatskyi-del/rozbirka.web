import { apiClient } from './client'
import type { Page, RequestOptions } from './contracts'

export interface PartListItem {
  id: string
  name: string
  photos: string[]
  quantityTotal: number
  quantityReserved: number
  quantityAvailable: number
  quantitySoldTotal: number
  status: string
  car: {
    id: string
    make: string
    model: string
    year: number
    vin: string | null
  } | null
  order: { id: string; number: number } | null
}

export interface PartDetail {
  id: string
  name: string
  condition: string
  notes: string | null
  qrCode: string
  unit: string
  source: string
  oemCode: string | null
  carId: string | null
  carCode: string | null
  carBrand: string | null
  carModel: string | null
  carYear: number | null
  intakeId: string | null
  createdAt: string
  createdById: string
  createdByName: string
  desiredSalePrice: number | null
  salePrice: number | null
  effectiveSalePrice: number | null
  soldAt: string | null
  partType: string | null
  photos: {
    id: string
    storageKey: string
    url: string
    thumbnailUrl: string
    sortOrder: number
  }[]
  quantityTotal: number
  quantityReserved: number
  quantityAvailable: number
  quantitySoldTotal: number
  status: string
  compatCarBrand: string | null
  compatCarModel: string | null
  compatCarYear: number | null
  order: {
    id: string
    number: number
    status: string
    customerName: string | null
    createdAt: string
    confirmedAt: string | null
    payments: { amount: number; currency: string; accountName: string }[] | null
  } | null
  reservations:
    | {
        orderId: string
        orderNumber: number
        quantity: number
        customerName: string | null
      }[]
    | null
  soldOrders:
    | {
        orderId: string
        orderNumber: number
        quantitySold: number
        unitPrice: number
        confirmedAt: string | null
        customerName: string | null
      }[]
    | null
}

export interface PartsSummary {
  total: number
  available: number
  reserved: number
  sold: number
}
export interface PartHistory {
  partId: string
  events: {
    id: string
    eventType: string
    data: string | null
    createdAt: string
    user: { id: string; name: string }
    order: { id: string; number: number } | null
  }[]
}
export interface PartListOptions {
  q?: string
  status?: string
  make?: string
  page?: number
  pageSize?: number
  carIds?: string[]
  intakeIds?: string[]
  signal?: AbortSignal
}
export interface CreatePartRequest {
  sourceType: string
  carId?: string | null
  intakeId?: string | null
  name: string
  partType?: string | null
  oemCode?: string | null
  condition?: string | null
  notes?: string | null
  quantity: number
  unit?: string | null
  photoKeys: string[]
  carBrand?: string | null
  carModel?: string | null
  carYear?: number | null
  desiredSalePrice?: number | null
}
export interface UpdatePartRequest {
  name?: string | null
  condition?: string | null
  notes?: string | null
  quantity?: number | null
  partType?: string | null
  unit?: string | null
  photoKeys?: string[] | null
  desiredSalePrice: { isSet: boolean; value?: number | null }
}

const requestConfig = (options: RequestOptions) =>
  options.signal ? { signal: options.signal } : {}

export const partsApi = {
  async list(options: PartListOptions = {}): Promise<Page<PartListItem>> {
    const { signal, pageSize = 30, carIds, intakeIds, ...params } = options
    const response = await apiClient.get<Page<PartListItem>>('/parts', {
      params: {
        ...params,
        per_page: pageSize,
        ...(carIds?.length ? { car_ids: carIds } : {}),
        ...(intakeIds?.length ? { intake_ids: intakeIds } : {}),
      },
      ...(signal ? { signal } : {}),
    })
    return response.data
  },
  async summary(options: RequestOptions = {}): Promise<PartsSummary> {
    return (
      await apiClient.get<PartsSummary>(
        '/parts/summary',
        requestConfig(options),
      )
    ).data
  },
  async makes(options: RequestOptions = {}): Promise<string[]> {
    return (
      await apiClient.get<{ makes: string[] }>(
        '/parts/makes',
        requestConfig(options),
      )
    ).data.makes
  },
  async get(id: string, options: RequestOptions = {}): Promise<PartDetail> {
    return (
      await apiClient.get<PartDetail>(
        `/parts/${encodeURIComponent(id)}`,
        requestConfig(options),
      )
    ).data
  },
  async history(
    id: string,
    options: RequestOptions = {},
  ): Promise<PartHistory> {
    return (
      await apiClient.get<PartHistory>(
        `/parts/${encodeURIComponent(id)}/history`,
        requestConfig(options),
      )
    ).data
  },
  async create(
    request: CreatePartRequest,
    options: RequestOptions = {},
  ): Promise<PartDetail> {
    return (
      await apiClient.post<PartDetail>(
        '/parts',
        request,
        requestConfig(options),
      )
    ).data
  },
  async update(
    id: string,
    request: UpdatePartRequest,
    options: RequestOptions = {},
  ): Promise<PartDetail> {
    return (
      await apiClient.put<PartDetail>(
        `/parts/${encodeURIComponent(id)}`,
        request,
        requestConfig(options),
      )
    ).data
  },
  async delete(id: string, options: RequestOptions = {}): Promise<void> {
    await apiClient.delete(
      `/parts/${encodeURIComponent(id)}`,
      requestConfig(options),
    )
  },
}
