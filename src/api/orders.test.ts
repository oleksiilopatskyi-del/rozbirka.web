import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { ordersApi } from './orders'

afterEach(() => vi.restoreAllMocks())

describe('ordersApi', () => {
  it('uses the canonical order endpoints and carries an idempotency key only for replay-safe transitions', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ data: { id: 'order-1' } })
    const create = {
      customerId: 'customer-1',
      notes: null,
      items: [{ partId: 'part-1', quantity: 1, unitPrice: 250 }],
    }
    const key = 'order-confirm-0001'

    await ordersApi.create(create)
    await ordersApi.confirm(
      'order-1',
      { payments: [{ accountId: 'cash-1', amount: 250, currency: 'UAH' }] },
      { idempotencyKey: key },
    )
    await ordersApi.cancel('order-1')
    await ordersApi.refund(
      'order-1',
      { refundReason: 'Повернення' },
      { idempotencyKey: 'order-refund-0001' },
    )

    expect(post).toHaveBeenNthCalledWith(1, '/orders', create)
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/orders/order-1/confirm',
      { payments: [{ accountId: 'cash-1', amount: 250, currency: 'UAH' }] },
      { idempotency: { idempotencyKey: key } },
    )
    expect(post).toHaveBeenNthCalledWith(3, '/orders/order-1/cancel')
    expect(post).toHaveBeenNthCalledWith(
      4,
      '/orders/order-1/refund',
      { refundReason: 'Повернення' },
      { idempotency: { idempotencyKey: 'order-refund-0001' } },
    )
  })
})
