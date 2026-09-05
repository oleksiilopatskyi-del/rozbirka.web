import { apiClient } from './client'
import type { Page, RequestOptions } from './contracts'

export type IntakeStatus = 'active' | 'closed'

const intakeStatuses = new Set<IntakeStatus>(['active', 'closed'])

export const isIntakeStatus = (value: unknown): value is IntakeStatus =>
  typeof value === 'string' && intakeStatuses.has(value as IntakeStatus)

export interface IntakeAuthor {
  id: string
  displayName: string
}

export interface IntakeListItem {
  id: string
  name: string | null
  supplier: string | null
  purchasedAt: string | null
  totalCost: number | null
  partsCount: number
  soldCount: number
  createdAt: string
  createdBy: IntakeAuthor
}

export interface IntakePhoto {
  url: string
  thumbnailUrl: string
}

export interface IntakePartPhoto {
  thumbnailUrl: string
}

export interface IntakePart {
  id: string
  name: string
  partType: string | null
  condition: string
  quantity: number
  unit: string
  status: string
  qrCode: string
  photos: IntakePartPhoto[]
  createdAt: string
}

export interface IntakeProfitability {
  invested: number
  recouped: number
  recoupedPercent: number | null
  partsAvailable: number
  partsSold: number
}

export interface Intake extends IntakeListItem {
  notes: string | null
  photos: IntakePhoto[]
  parts: IntakePart[]
  profitability?: IntakeProfitability | null
}

export interface IntakeListParams {
  search?: string | undefined
  status?: IntakeStatus | undefined
  page?: number | undefined
  pageSize?: number | undefined
}

export interface CreateIntakeRequest {
  name?: string | null | undefined
  supplier?: string | null | undefined
  purchasedAt?: string | null | undefined
  totalCost?: number | null | undefined
  notes?: string | null | undefined
  photoKeys?: string[] | null | undefined
}

export interface UpdateIntakeRequest {
  name?: string | null | undefined
  supplier?: string | null | undefined
  purchasedAt?: string | null | undefined
  totalCost?: number | null | undefined
  notes?: string | null | undefined
}

export interface AddIntakePartRequest {
  name: string
  partType?: string | null | undefined
  condition?: string | null | undefined
  quantity: number
  unit?: string | null | undefined
  notes?: string | null | undefined
  photoKeys: string[]
}

/** OpenAPI PartDetailDto returned by POST /intakes/{id}/parts. */
export interface IntakePartCreateResult {
  id: string
  name: string
  partType: string | null
  condition: string
  unit: string
  source: string
  status: string
  qrCode: string
  quantityTotal: number
  quantityAvailable: number
  quantityReserved: number
  quantitySoldTotal: number
  createdAt: string
  createdById: string
  createdByName: string
  photos: {
    id: string
    storageKey: string
    url: string
    thumbnailUrl: string
    sortOrder: number
  }[]
}

const requestConfig = (options: RequestOptions) =>
  options.signal ? { signal: options.signal } : {}

export const intakesApi = {
  async list(
    params: IntakeListParams = {},
    options: RequestOptions = {},
  ): Promise<Page<IntakeListItem>> {
    const safeParams = {
      ...params,
      ...(!isIntakeStatus(params.status) ? { status: undefined } : {}),
    }
    const response = await apiClient.get<Page<IntakeListItem>>('/intakes', {
      params: safeParams,
      ...requestConfig(options),
    })
    return response.data
  },

  async get(id: string, options: RequestOptions = {}): Promise<Intake> {
    const response = await apiClient.get<Intake>(
      `/intakes/${id}`,
      requestConfig(options),
    )
    return response.data
  },

  async create(
    request: CreateIntakeRequest,
    options: RequestOptions = {},
  ): Promise<Intake> {
    const safeRequest: CreateIntakeRequest = {
      name: request.name,
      supplier: request.supplier,
      purchasedAt: request.purchasedAt,
      totalCost: request.totalCost,
      notes: request.notes,
      photoKeys: request.photoKeys,
    }
    const response = await apiClient.post<Intake>(
      '/intakes',
      safeRequest,
      requestConfig(options),
    )
    return response.data
  },

  async update(
    id: string,
    request: UpdateIntakeRequest,
    options: RequestOptions = {},
  ): Promise<Intake> {
    const safeRequest: UpdateIntakeRequest = {
      name: request.name,
      supplier: request.supplier,
      purchasedAt: request.purchasedAt,
      totalCost: request.totalCost,
      notes: request.notes,
    }
    const response = await apiClient.patch<Intake>(
      `/intakes/${id}`,
      safeRequest,
      requestConfig(options),
    )
    return response.data
  },

  async remove(id: string, options: RequestOptions = {}): Promise<void> {
    await apiClient.delete(`/intakes/${id}`, requestConfig(options))
  },

  async addPart(
    id: string,
    request: AddIntakePartRequest,
    options: RequestOptions = {},
  ): Promise<IntakePartCreateResult> {
    const safeRequest: AddIntakePartRequest = {
      name: request.name,
      partType: request.partType,
      condition: request.condition,
      quantity: request.quantity,
      unit: request.unit,
      notes: request.notes,
      photoKeys: request.photoKeys,
    }
    const response = await apiClient.post<IntakePartCreateResult>(
      `/intakes/${id}/parts`,
      safeRequest,
      requestConfig(options),
    )
    return response.data
  },
}
