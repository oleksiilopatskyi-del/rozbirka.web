import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { customersApi } from './customers'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('customersApi', () => {
  it('sends the directory query to the authoritative server search endpoint', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [
        {
          id: 'customer-1',
          name: 'Ірина',
          phone: '+380501112233',
          ordersCount: 2,
        },
      ],
    })

    await expect(customersApi.search('Ірина')).resolves.toEqual([
      {
        id: 'customer-1',
        name: 'Ірина',
        phone: '+380501112233',
        ordersCount: 2,
      },
    ])

    expect(get).toHaveBeenCalledWith('/customers/search', {
      params: { q: 'Ірина' },
    })
  })

  it('keeps CRUD and lifecycle calls on the documented customer endpoints', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { customer: { id: 'customer-1', name: 'Ірина' } },
    })
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({
      data: { customer: { id: 'customer-1', name: 'Олена' } },
    })
    const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue({})
    const controller = new AbortController()
    const options = { signal: controller.signal }

    await customersApi.create(
      { name: 'Ірина', phone: null, notes: null },
      options,
    )
    await customersApi.update('customer-1', { name: 'Олена' }, options)
    await customersApi.activate('customer-1', options)
    await customersApi.deactivate('customer-1', options)
    await customersApi.remove('customer-1', options)

    expect(post).toHaveBeenCalledWith(
      '/customers',
      { name: 'Ірина', phone: null, notes: null },
      { signal: controller.signal },
    )
    expect(patch).toHaveBeenNthCalledWith(
      1,
      '/customers/customer-1',
      { name: 'Олена' },
      { signal: controller.signal },
    )
    expect(patch).toHaveBeenNthCalledWith(
      2,
      '/customers/customer-1/activate',
      undefined,
      { signal: controller.signal },
    )
    expect(patch).toHaveBeenNthCalledWith(
      3,
      '/customers/customer-1/deactivate',
      undefined,
      { signal: controller.signal },
    )
    expect(remove).toHaveBeenCalledWith('/customers/customer-1', {
      signal: controller.signal,
    })
  })
})
