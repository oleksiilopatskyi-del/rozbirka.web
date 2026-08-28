import { apiClient } from './client'
import type { RequestOptions } from './contracts'

export interface StickerData {
  id: string
  name: string
  qrCode: string
  carCode: string | null
  carBrand: string | null
  carModel: string | null
  carYear: number | null
  carId: string | null
  quantity: number
  createdAt: string
}
export interface StickerBatch {
  items: StickerData[]
}

const requestConfig = (options: RequestOptions) =>
  options.signal ? { signal: options.signal } : {}

export const stickersApi = {
  async getBatchData(
    ids: string[],
    options: RequestOptions = {},
  ): Promise<StickerBatch> {
    return (
      await apiClient.post<StickerBatch>(
        '/parts/batch-sticker',
        { ids },
        requestConfig(options),
      )
    ).data
  },
  pdf: { available: false as const },
}
