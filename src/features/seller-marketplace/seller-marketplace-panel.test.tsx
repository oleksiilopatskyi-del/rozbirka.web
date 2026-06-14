import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { marketplaceApi } from '@/api/marketplace'
import { SellerMarketplacePanel } from './seller-marketplace-panel'

vi.mock('@/api/marketplace', () => ({
  marketplaceApi: {
    getSellerSummary: vi.fn(),
    getSellerListings: vi.fn(),
    searchSellerParts: vi.fn(),
    upsertSellerShop: vi.fn(),
  },
}))

/* eslint-disable @typescript-eslint/unbound-method */
const getSellerSummary = vi.mocked(marketplaceApi.getSellerSummary)
const getSellerListings = vi.mocked(marketplaceApi.getSellerListings)
const searchSellerParts = vi.mocked(marketplaceApi.searchSellerParts)
/* eslint-enable @typescript-eslint/unbound-method */

describe('SellerMarketplacePanel', () => {
  beforeEach(() => {
    getSellerSummary.mockResolvedValue({
      shop: {
        id: 's1',
        slug: 'shop',
        name: 'AvtoParts',
        description: null,
        city: 'Львів',
        logoUrl: null,
        phone: '+380501112233',
        messengerUrl: null,
        publicContactName: 'Іван',
        isPublished: true,
      },
      draftListings: 0,
      publishedListings: 1,
      hiddenListings: 0,
      availableWarehouseParts: 4,
    })
    getSellerListings.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 30,
      total: 0,
      totalPages: 0,
    })
    searchSellerParts.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 30,
      total: 0,
      totalPages: 0,
    })
  })

  it('hydrates the shop phone from the loaded shop (no data loss)', async () => {
    render(<SellerMarketplacePanel />)
    const phone = await screen.findByDisplayValue('+380501112233')
    expect(phone).toBeInTheDocument()
  })
})
