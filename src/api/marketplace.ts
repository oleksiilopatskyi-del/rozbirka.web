import { apiClient, publicApiClient } from './client'
import type { PagedResult } from './types'
import type {
  MarketplaceCatalogParams,
  MarketplaceListingCardDto,
  MarketplaceListingDetailDto,
  MarketplaceSellerListingDto,
  MarketplaceSellerPartDto,
  MarketplaceSellerSummaryDto,
  MarketplaceShopDto,
  MarketplaceShopPublicDto,
  UpdateMarketplaceListingRequest,
  UpsertMarketplaceShopRequest,
} from '@/features/marketplace/marketplace-api-types'

export interface MarketplaceCatalogResult {
  listings: MarketplaceListingCardDto[]
  total: number
}

function compactParams(p: MarketplaceCatalogParams): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (p.q) out['q'] = p.q
  if (p.city) out['city'] = p.city
  if (p.make) out['make'] = p.make
  if (p.model) out['model'] = p.model
  if (p.yearFrom != null) out['yearFrom'] = p.yearFrom
  if (p.yearTo != null) out['yearTo'] = p.yearTo
  if (p.condition) out['condition'] = p.condition
  if (p.minPrice != null) out['minPrice'] = p.minPrice
  if (p.maxPrice != null) out['maxPrice'] = p.maxPrice
  if (p.sort && p.sort !== 'newest') out['sort'] = p.sort
  if (p.page != null) out['page'] = p.page
  if (p.pageSize != null) out['per_page'] = p.pageSize
  return out
}

export const marketplaceApi = {
  async getCatalog(params: MarketplaceCatalogParams = {}): Promise<MarketplaceCatalogResult> {
    try {
      const resp = await publicApiClient.get<PagedResult<MarketplaceListingCardDto>>(
        '/marketplace/listings', { params: compactParams(params) })
      return { listings: resp.data.items, total: resp.data.total }
    } catch (error) {
      if (import.meta.env.DEV) {
        const { mockCatalog } = await import('@/features/marketplace/mock-data')
        return mockCatalog
      }
      throw error
    }
  },

  async getListing(slugOrId: string): Promise<MarketplaceListingDetailDto> {
    const resp = await publicApiClient.get<MarketplaceListingDetailDto>(`/marketplace/listings/${slugOrId}`)
    return resp.data
  },

  async getShop(slug: string): Promise<MarketplaceShopPublicDto> {
    const resp = await publicApiClient.get<MarketplaceShopPublicDto>(`/marketplace/shops/${slug}`)
    return resp.data
  },

  async getShopListings(slug: string, params: MarketplaceCatalogParams = {}): Promise<MarketplaceCatalogResult> {
    const resp = await publicApiClient.get<PagedResult<MarketplaceListingCardDto>>(
      `/marketplace/shops/${slug}/listings`, { params: compactParams(params) })
    return { listings: resp.data.items, total: resp.data.total }
  },

  // ---- Seller ----
  async getSellerShop(): Promise<MarketplaceShopDto | null> {
    const resp = await apiClient.get<MarketplaceShopDto | null>('/marketplace/shop')
    return resp.data
  },
  async upsertSellerShop(payload: UpsertMarketplaceShopRequest): Promise<MarketplaceShopDto> {
    const resp = await apiClient.put<MarketplaceShopDto>('/marketplace/shop', payload)
    return resp.data
  },
  async getSellerSummary(): Promise<MarketplaceSellerSummaryDto> {
    const resp = await apiClient.get<MarketplaceSellerSummaryDto>('/marketplace/seller/summary')
    return resp.data
  },
  async getSellerListings(page = 1, pageSize = 30): Promise<PagedResult<MarketplaceSellerListingDto>> {
    const resp = await apiClient.get<PagedResult<MarketplaceSellerListingDto>>('/marketplace/seller/listings', { params: { page, per_page: pageSize } })
    return resp.data
  },
  async searchSellerParts(q?: string, page = 1, pageSize = 30): Promise<PagedResult<MarketplaceSellerPartDto>> {
    const resp = await apiClient.get<PagedResult<MarketplaceSellerPartDto>>('/marketplace/seller/parts', { params: { q, page, per_page: pageSize } })
    return resp.data
  },
  async createListingFromPart(partId: string): Promise<MarketplaceSellerListingDto> {
    const resp = await apiClient.post<MarketplaceSellerListingDto>(`/marketplace/seller/listings/from-part/${partId}`)
    return resp.data
  },
  async updateListing(id: string, payload: UpdateMarketplaceListingRequest): Promise<MarketplaceSellerListingDto> {
    const resp = await apiClient.patch<MarketplaceSellerListingDto>(`/marketplace/seller/listings/${id}`, payload)
    return resp.data
  },
  async publishListing(id: string): Promise<MarketplaceSellerListingDto> {
    const resp = await apiClient.post<MarketplaceSellerListingDto>(`/marketplace/seller/listings/${id}/publish`)
    return resp.data
  },
  async hideListing(id: string): Promise<MarketplaceSellerListingDto> {
    const resp = await apiClient.post<MarketplaceSellerListingDto>(`/marketplace/seller/listings/${id}/hide`)
    return resp.data
  },
  async archiveListing(id: string): Promise<MarketplaceSellerListingDto> {
    const resp = await apiClient.post<MarketplaceSellerListingDto>(`/marketplace/seller/listings/${id}/archive`)
    return resp.data
  },
}
