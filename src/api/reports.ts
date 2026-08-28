import { apiClient } from './client'
import type { Page, RequestOptions } from './contracts'

export type ReportType = 'carSales' | (string & {})
export type ReportStatus =
  | 'queued'
  | 'processing'
  // The Core service currently serializes its Processing state as `running`.
  // Keep it as a compatibility alias while web consumers use `processing`.
  | 'running'
  | 'completed'
  | 'failed'
  | 'expired'
  | (string & {})

export interface ReportJob {
  id: string
  type: ReportType
  status: ReportStatus
  stage: string
  progress: number
  itemsTotal: number | null
  itemsProcessed: number | null
  requestedAt: string
  startedAt: string | null
  completedAt: string | null
  expiresAt: string
  errorMessage: string | null
  fileSizeBytes: number | null
}

export interface CreateReportRequest {
  type: 'carSales'
  carSales: {
    from: string
    to: string
  }
}

export interface ReportListParams {
  page?: number
  pageSize?: number
}

export interface ReportDownload {
  blob: Blob
  filename: string
}

export interface StreamedReportDownload {
  filename: string
  streamed: boolean
}

const requestConfig = (options: RequestOptions) =>
  options.signal ? { signal: options.signal } : {}

const reportPath = (id: string) => `/reports/${encodeURIComponent(id)}`

const contentDisposition = (headers: unknown): string | null => {
  if (headers instanceof Headers) return headers.get('content-disposition')
  if (headers && typeof headers === 'object') {
    const value = (headers as Record<string, unknown>)['content-disposition']
    return typeof value === 'string' ? value : null
  }
  return null
}

export function parseReportFilename(
  disposition: string | null,
  reportId: string,
): string {
  if (disposition) {
    const extended = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
    if (extended) {
      try {
        return decodeURIComponent(extended)
      } catch {
        // A malformed server filename must not block a successful download.
      }
    }
    const regular = /filename="?([^";]+)"?/i.exec(disposition)?.[1]
    if (regular) return regular
  }
  return `report-${reportId}.pdf`
}

export const reportsApi = {
  async list(
    params: ReportListParams = {},
    options: RequestOptions = {},
  ): Promise<Page<ReportJob>> {
    const response = await apiClient.get<Page<ReportJob>>('/reports', {
      params,
      ...requestConfig(options),
    })
    return response.data
  },

  async get(id: string, options: RequestOptions = {}): Promise<ReportJob> {
    const response = await apiClient.get<ReportJob>(
      reportPath(id),
      requestConfig(options),
    )
    return response.data
  },

  async create(
    request: CreateReportRequest,
    options: RequestOptions = {},
  ): Promise<ReportJob> {
    const response = await apiClient.post<ReportJob>(
      '/reports',
      request,
      requestConfig(options),
    )
    return response.data
  },

  async download(
    id: string,
    options: RequestOptions = {},
  ): Promise<ReportDownload> {
    const response = await apiClient.get<Blob>(`${reportPath(id)}/download`, {
      responseType: 'blob',
      ...requestConfig(options),
    })
    return {
      blob: response.data,
      filename: parseReportFilename(contentDisposition(response.headers), id),
    }
  },
}

const isReadableStream = (
  value: unknown,
): value is ReadableStream<Uint8Array> =>
  value !== null &&
  typeof value === 'object' &&
  'pipeTo' in value &&
  typeof value.pipeTo === 'function'

/**
 * Streams to a browser-owned WritableStream when Fetch exposes a response body.
 * The fallback keeps the one Blob required by the public download API and never
 * constructs a second application-level buffer.
 */
export async function downloadReportTo(
  id: string,
  destination: WritableStream<Uint8Array>,
  options: RequestOptions = {},
): Promise<StreamedReportDownload> {
  const response = await apiClient.get<unknown>(`${reportPath(id)}/download`, {
    // Axios defaults to XHR in browsers; Fetch is required for a readable body.
    adapter: 'fetch',
    responseType: 'stream',
    ...requestConfig(options),
  })
  const filename = parseReportFilename(contentDisposition(response.headers), id)
  if (isReadableStream(response.data)) {
    await response.data.pipeTo(destination)
    return { filename, streamed: true }
  }

  if (response.data instanceof Blob) {
    await response.data.stream().pipeTo(destination)
    return { filename, streamed: false }
  }

  const { blob, filename: fallbackFilename } = await reportsApi.download(
    id,
    options,
  )
  await blob.stream().pipeTo(destination)
  return { filename: fallbackFilename, streamed: false }
}
