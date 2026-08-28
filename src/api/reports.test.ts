import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import {
  downloadReportTo,
  parseReportFilename,
  reportsApi,
  type ReportJob,
} from './reports'

const report: ReportJob = {
  id: 'report-1',
  type: 'carSales',
  status: 'queued',
  stage: 'queued',
  progress: 0,
  itemsTotal: null,
  itemsProcessed: null,
  requestedAt: '2026-08-28T08:00:00Z',
  startedAt: null,
  completedAt: null,
  expiresAt: '2026-09-04T08:00:00Z',
  errorMessage: null,
  fileSizeBytes: null,
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('reportsApi', () => {
  it('sends pagination and the caller abort signal when listing report jobs', async () => {
    const signal = new AbortController().signal
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        items: [report],
        page: 2,
        pageSize: 10,
        total: 11,
        totalPages: 2,
      },
    })

    await expect(
      reportsApi.list({ page: 2, pageSize: 10 }, { signal }),
    ).resolves.toEqual({
      items: [report],
      page: 2,
      pageSize: 10,
      total: 11,
      totalPages: 2,
    })

    expect(get).toHaveBeenCalledWith('/reports', {
      params: { page: 2, pageSize: 10 },
      signal,
    })
  })

  it('creates a car-sales job with its exact selected date range', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: report })
    const input = {
      type: 'carSales' as const,
      carSales: {
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-28T23:59:59.999Z',
      },
    }

    await expect(reportsApi.create(input)).resolves.toEqual(report)

    expect(post).toHaveBeenCalledWith('/reports', input, {})
  })

  it('polls one report by encoded id and forwards cancellation', async () => {
    const signal = new AbortController().signal
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: report })

    await expect(reportsApi.get('report/one', { signal })).resolves.toEqual(
      report,
    )

    expect(get).toHaveBeenCalledWith('/reports/report%2Fone', { signal })
  })

  it('downloads an authenticated Blob without putting a bearer token in the URL', async () => {
    const blob = new Blob(['pdf'], { type: 'application/pdf' })
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: blob,
      headers: { 'content-disposition': 'attachment; filename="sales.pdf"' },
    })

    await expect(reportsApi.download('report-1')).resolves.toEqual({
      blob,
      filename: 'sales.pdf',
    })

    expect(get).toHaveBeenCalledWith('/reports/report-1/download', {
      responseType: 'blob',
    })
    expect(get.mock.calls[0]?.[0]).not.toContain('token=')
    expect(get.mock.calls[0]?.[0]).not.toContain('Bearer')
  })

  it('parses RFC 5987 and regular content-disposition filenames safely', () => {
    expect(
      parseReportFilename(
        "attachment; filename*=UTF-8''sales%20report%20%231.pdf",
        'report-1',
      ),
    ).toBe('sales report #1.pdf')
    expect(
      parseReportFilename('attachment; filename="sales.pdf"', 'report-1'),
    ).toBe('sales.pdf')
    expect(parseReportFilename(null, 'report-1')).toBe('report-report-1.pdf')
  })

  it('hands the shared api client stream directly to the browser writable stream', async () => {
    const pipeTo = vi.fn().mockResolvedValue(undefined)
    const destination = new WritableStream<Uint8Array>()
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { pipeTo },
      headers: {
        'content-disposition': 'attachment; filename="direct.pdf"',
      },
    })
    const signal = new AbortController().signal

    await expect(
      downloadReportTo('report-1', destination, { signal }),
    ).resolves.toEqual({
      filename: 'direct.pdf',
      streamed: true,
    })

    expect(pipeTo).toHaveBeenCalledWith(destination)
    expect(get).toHaveBeenCalledWith('/reports/report-1/download', {
      adapter: 'fetch',
      responseType: 'stream',
      signal,
    })
  })

  it('falls back to one Blob handoff when the shared stream response has no body', async () => {
    const blob = Object.assign(new Blob(['pdf'], { type: 'application/pdf' }), {
      stream: () => new ReadableStream<Uint8Array>({ start: (c) => c.close() }),
    })
    const get = vi
      .spyOn(apiClient, 'get')
      .mockResolvedValueOnce({ data: undefined, headers: {} })
      .mockResolvedValueOnce({
        data: blob,
        headers: {
          'content-disposition': 'attachment; filename="fallback.pdf"',
        },
      })

    await expect(
      downloadReportTo('report-1', new WritableStream<Uint8Array>()),
    ).resolves.toEqual({ filename: 'fallback.pdf', streamed: false })

    expect(get).toHaveBeenCalledTimes(2)
  })

  it('preserves stream errors and caller cancellation through the shared client', async () => {
    const controller = new AbortController()
    const get = vi
      .spyOn(apiClient, 'get')
      .mockRejectedValue(new Error('offline'))

    await expect(
      downloadReportTo('report-1', new WritableStream<Uint8Array>(), {
        signal: controller.signal,
      }),
    ).rejects.toThrow('offline')

    expect(get).toHaveBeenCalledWith('/reports/report-1/download', {
      adapter: 'fetch',
      responseType: 'stream',
      signal: controller.signal,
    })
    controller.abort('download-cancelled')
    expect(get.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })
})
