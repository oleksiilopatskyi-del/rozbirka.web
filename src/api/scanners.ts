import { apiClient } from './client'
import type { RequestOptions } from './contracts'
import type { PartDetail } from './parts'

const requestConfig = (options: RequestOptions) =>
  options.signal ? { signal: options.signal } : {}

export const scannersApi = {
  async resolveQr(
    qrCode: string,
    options: RequestOptions = {},
  ): Promise<PartDetail> {
    return (
      await apiClient.get<PartDetail>(
        `/parts/qr/${encodeURIComponent(qrCode)}`,
        requestConfig(options),
      )
    ).data
  },
  decodeVin: { available: false as const },
  decodeOem: { available: false as const },
}
