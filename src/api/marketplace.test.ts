import { beforeEach, describe, expect, it, vi } from 'vitest'
import { marketplaceApi } from './marketplace'
import { apiClient, publicApiClient } from './client'

vi.mock('./client', () => ({
  apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn() },
  publicApiClient: { get: vi.fn() },
}))

describe('marketplaceApi', () => {
  beforeEach(() => {
    vi.mocked(publicApiClient.get).mockReset()
    vi.mocked(apiClient.get).mockReset()
  })

  it('calls the spec public listings path with all compacted params', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({
      data: { items: [], page: 1, pageSize: 30, total: 0 },
    })
    await marketplaceApi.getCatalog({
      q: 'фара', city: 'Львів', make: 'Audi', yearFrom: 2010,
      minPrice: 100, sort: 'price_asc', pageSize: 12,
    })
    expect(publicApiClient.get).toHaveBeenCalledWith('/marketplace/listings', {
      params: { q: 'фара', city: 'Львів', make: 'Audi', yearFrom: 2010, minPrice: 100, sort: 'price_asc', per_page: 12 },
    })
  })

  it('maps card DTOs to catalog listings without inventing featured/stats', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({
      data: {
        items: [{
          slug: 'fara-1', title: 'Фара', price: 6400, currency: 'UAH', photo: null,
          condition: 'good', vehicleMake: 'Audi', vehicleModel: 'Q5', vehicleYear: 2014,
          oemCode: '8R0941004', quantityAvailable: 2,
          shop: { slug: 'shop-1', name: 'AvtoParts', city: 'Львів' },
        }],
        page: 1, pageSize: 30, total: 1,
      },
    })
    const result = await marketplaceApi.getCatalog({})
    expect(result.total).toBe(1)
    expect(result.listings[0]?.slug).toBe('fara-1')
    expect(result.listings[0]).not.toHaveProperty('featured')
  })

  it('fetches listing detail by slug', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({ data: { slug: 'fara-1', title: 'Фара', photos: [], currency: 'UAH', quantityAvailable: 1, shop: { slug: 's', name: 'n', description: null, city: null, logoUrl: null, phone: null, messengerUrl: null, publicContactName: null } } })
    const detail = await marketplaceApi.getListing('fara-1')
    expect(publicApiClient.get).toHaveBeenCalledWith('/marketplace/listings/fara-1')
    expect(detail.slug).toBe('fara-1')
  })
})
