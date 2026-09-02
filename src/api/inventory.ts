import { apiClient } from './client'
import type { RequestOptions } from './contracts'
import type { components } from './generated/core'

export type Warehouse = components['schemas']['WarehouseDto']
export type WarehouseDetail = components['schemas']['WarehouseDetailDto']
export type InventoryZone = components['schemas']['InventoryZoneDto']
export type InventorySession = components['schemas']['InventorySessionDto']
export type InventorySessionResults =
  components['schemas']['InventorySessionResultsDto']
export type InventoryPartResult =
  components['schemas']['InventoryPartResultDto']
export type InventoryAuditEvent =
  components['schemas']['InventoryAuditEventDto']
export type InventoryScan = components['schemas']['InventoryScanDto']
export type InventoryAdjustment =
  components['schemas']['InventoryAdjustmentDto']
export type PartInventoryZone = components['schemas']['PartInventoryZoneDto']

export interface WarehouseInput {
  name: string
  code: string
}

export interface WarehouseUpdate extends WarehouseInput {
  isActive: boolean
}

export interface ZoneInput {
  warehouseId: string
  name: string
  code: string
}

export interface ZoneUpdate {
  name: string
  code: string
  isActive: boolean
}

export interface InventoryZoneQuery extends RequestOptions {
  warehouseId?: string
  activeOnly?: boolean
}

const config = ({ signal }: RequestOptions = {}) =>
  signal ? { signal } : undefined
const id = encodeURIComponent

export const inventoryApi = {
  async getWarehouses(options: RequestOptions = {}): Promise<Warehouse[]> {
    return (await apiClient.get<Warehouse[]>('/warehouses', config(options)))
      .data
  },
  async getWarehouse(
    warehouseId: string,
    options: RequestOptions = {},
  ): Promise<WarehouseDetail> {
    return (
      await apiClient.get<WarehouseDetail>(
        `/warehouses/${id(warehouseId)}`,
        config(options),
      )
    ).data
  },
  async getZones(options: InventoryZoneQuery = {}): Promise<InventoryZone[]> {
    const { warehouseId, activeOnly, ...requestOptions } = options
    return (
      await apiClient.get<InventoryZone[]>('/inventory/zones', {
        ...config(requestOptions),
        params: {
          ...(warehouseId ? { warehouseId } : {}),
          ...(activeOnly !== undefined ? { activeOnly } : {}),
        },
      })
    ).data
  },
  async getZone(
    zoneId: string,
    options: RequestOptions = {},
  ): Promise<InventoryZone> {
    return (
      await apiClient.get<InventoryZone>(
        `/inventory/zones/${id(zoneId)}`,
        config(options),
      )
    ).data
  },
  async createWarehouse(
    input: WarehouseInput,
    options: RequestOptions = {},
  ): Promise<Warehouse> {
    return (
      await apiClient.post<Warehouse>('/warehouses', input, config(options))
    ).data
  },
  async updateWarehouse(
    warehouseId: string,
    input: WarehouseUpdate,
    options: RequestOptions = {},
  ): Promise<Warehouse> {
    return (
      await apiClient.put<Warehouse>(
        `/warehouses/${id(warehouseId)}`,
        input,
        config(options),
      )
    ).data
  },
  async archiveWarehouse(
    warehouseId: string,
    options: RequestOptions = {},
  ): Promise<void> {
    await apiClient.delete(`/warehouses/${id(warehouseId)}`, config(options))
  },
  async createZone(
    input: ZoneInput,
    options: RequestOptions = {},
  ): Promise<InventoryZone> {
    return (
      await apiClient.post<InventoryZone>(
        '/inventory/zones',
        input,
        config(options),
      )
    ).data
  },
  async updateZone(
    zoneId: string,
    input: ZoneUpdate,
    options: RequestOptions = {},
  ): Promise<InventoryZone> {
    return (
      await apiClient.put<InventoryZone>(
        `/inventory/zones/${id(zoneId)}`,
        input,
        config(options),
      )
    ).data
  },
  async archiveZone(
    zoneId: string,
    options: RequestOptions = {},
  ): Promise<void> {
    await apiClient.delete(`/inventory/zones/${id(zoneId)}`, config(options))
  },
  async getPartZones(
    partId: string,
    options: RequestOptions = {},
  ): Promise<PartInventoryZone[]> {
    return (
      await apiClient.get<PartInventoryZone[]>(
        `/parts/${id(partId)}/inventory-zones`,
        config(options),
      )
    ).data
  },
  async replacePartZones(
    partId: string,
    zoneIds: string[],
    options: RequestOptions = {},
  ): Promise<PartInventoryZone[]> {
    return (
      await apiClient.put<PartInventoryZone[]>(
        `/parts/${id(partId)}/inventory-zones`,
        { zoneIds },
        config(options),
      )
    ).data
  },
  async getSessions(options: RequestOptions = {}): Promise<InventorySession[]> {
    return (
      await apiClient.get<InventorySession[]>(
        '/inventory/sessions',
        config(options),
      )
    ).data
  },
  async getSession(
    sessionId: string,
    options: RequestOptions = {},
  ): Promise<InventorySession> {
    return (
      await apiClient.get<InventorySession>(
        `/inventory/sessions/${id(sessionId)}`,
        config(options),
      )
    ).data
  },
  async createSession(
    zoneIds: string[],
    options: RequestOptions = {},
  ): Promise<InventorySession> {
    return (
      await apiClient.post<InventorySession>(
        '/inventory/sessions',
        { zoneIds },
        config(options),
      )
    ).data
  },
  async startSession(
    sessionId: string,
    options: RequestOptions = {},
  ): Promise<InventorySession> {
    return (
      await apiClient.post<InventorySession>(
        `/inventory/sessions/${id(sessionId)}/start`,
        undefined,
        config(options),
      )
    ).data
  },
  async reopenSession(
    sessionId: string,
    options: RequestOptions = {},
  ): Promise<InventorySession> {
    return (
      await apiClient.post<InventorySession>(
        `/inventory/sessions/${id(sessionId)}/reopen`,
        undefined,
        config(options),
      )
    ).data
  },
  async completeSession(
    sessionId: string,
    options: RequestOptions = {},
  ): Promise<InventorySession> {
    return (
      await apiClient.post<InventorySession>(
        `/inventory/sessions/${id(sessionId)}/complete`,
        undefined,
        config(options),
      )
    ).data
  },
  async cancelSession(
    sessionId: string,
    reason: string,
    options: RequestOptions = {},
  ): Promise<InventorySession> {
    return (
      await apiClient.post<InventorySession>(
        `/inventory/sessions/${id(sessionId)}/cancel`,
        { reason },
        config(options),
      )
    ).data
  },
  async getResults(
    sessionId: string,
    options: RequestOptions = {},
  ): Promise<InventorySessionResults> {
    return (
      await apiClient.get<InventorySessionResults>(
        `/inventory/sessions/${id(sessionId)}/results`,
        config(options),
      )
    ).data
  },
  async getAudit(
    sessionId: string,
    options: RequestOptions = {},
  ): Promise<InventoryAuditEvent[]> {
    return (
      await apiClient.get<InventoryAuditEvent[]>(
        `/inventory/sessions/${id(sessionId)}/audit`,
        config(options),
      )
    ).data
  },
  async getScans(
    sessionId: string,
    zoneId: string,
    options: RequestOptions = {},
  ): Promise<InventoryScan[]> {
    return (
      await apiClient.get<InventoryScan[]>(
        `/inventory/sessions/${id(sessionId)}/zones/${id(zoneId)}/scans`,
        config(options),
      )
    ).data
  },
  async applyAdjustment(
    sessionId: string,
    partId: string,
    reason: string,
    options: RequestOptions = {},
  ): Promise<InventoryAdjustment> {
    return (
      await apiClient.post<InventoryAdjustment>(
        `/inventory/sessions/${id(sessionId)}/adjustments/${id(partId)}`,
        { reason },
        config(options),
      )
    ).data
  },
}
