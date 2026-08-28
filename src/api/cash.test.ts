import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { cashApi } from './cash'

afterEach(() => vi.restoreAllMocks())

describe('cashApi', () => {
  it('gets daily totals from Core with its selected date and timezone', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: {
        date: '2026-08-28',
        timeZone: 'Europe/Kyiv',
        startUtc: '2026-08-27T21:00:00Z',
        endUtc: '2026-08-28T21:00:00Z',
        registers: [],
      },
    })

    await expect(
      cashApi.dailySummary('2026-08-28', 'Europe/Kyiv'),
    ).resolves.toMatchObject({ registers: [] })
    expect(get).toHaveBeenCalledWith('/cash/daily-summary', {
      params: { Date: '2026-08-28', TimeZone: 'Europe/Kyiv' },
    })
  })

  it('sends manual ledger movements with the contract idempotency option', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ data: { id: 'transaction-1' } })

    await cashApi.createTransaction(
      'cash-1',
      { type: 'manual_in', amount: 500, currency: 'UAH', note: 'Повернення' },
      { idempotencyKey: 'cash-movement-0001' },
    )

    expect(post).toHaveBeenCalledWith(
      '/cash/cash-1/transactions',
      { type: 'manual_in', amount: 500, currency: 'UAH', note: 'Повернення' },
      { idempotency: { idempotencyKey: 'cash-movement-0001' } },
    )
  })

  it('sends the exact atomic transfer contract with its caller replay key', async () => {
    const transfer = {
      out: {
        id: 'transaction-out',
        type: 'transfer_out',
        direction: 'out',
        amount: 100,
        currency: 'UAH',
        note: 'Обмін',
        createdAt: '2026-08-28T12:00:00Z',
        createdByName: 'Олена',
        referenceId: 'transfer-1',
      },
      in: {
        id: 'transaction-in',
        type: 'transfer_in',
        direction: 'in',
        amount: 2.5,
        currency: 'USD',
        note: 'Обмін',
        createdAt: '2026-08-28T12:00:00Z',
        createdByName: 'Олена',
        referenceId: 'transfer-1',
      },
    }
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ data: transfer })

    await expect(
      cashApi.transfer(
        {
          fromRegisterId: 'cash-source',
          fromCurrency: 'UAH',
          toRegisterId: 'cash-destination',
          toCurrency: 'USD',
          amountOut: 100,
          amountIn: 2.5,
          note: 'Обмін',
        },
        { idempotencyKey: 'cash-transfer-0001' },
      ),
    ).resolves.toEqual(transfer)
    expect(post).toHaveBeenCalledWith(
      '/cash/transfer',
      {
        fromRegisterId: 'cash-source',
        fromCurrency: 'UAH',
        toRegisterId: 'cash-destination',
        toCurrency: 'USD',
        amountOut: 100,
        amountIn: 2.5,
        note: 'Обмін',
      },
      { idempotency: { idempotencyKey: 'cash-transfer-0001' } },
    )
  })
})
