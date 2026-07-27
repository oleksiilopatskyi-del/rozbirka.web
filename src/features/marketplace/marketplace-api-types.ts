export interface MarketplaceShopSummaryDto {
  slug: string
  name: string
  city: string | null
}

export interface MarketplaceShopPublicDto {
  slug: string
  name: string
  description: string | null
  city: string | null
  logoUrl: string | null
  phone: string | null
  messengerUrl: string | null
  publicContactName: string | null
}

export interface MarketplaceListingCardDto {
  slug: string
  title: string
  price: number | null
  currency: string
  photo: string | null
  condition: string | null
  vehicleMake: string | null
  vehicleModel: string | null
  vehicleYear: number | null
  oemCode: string | null
  quantityAvailable: number
  shop: MarketplaceShopSummaryDto
}

export interface MarketplaceListingDetailDto {
  slug: string
  title: string
  description: string | null
  price: number | null
  currency: string
  photos: string[]
  condition: string | null
  vehicleMake: string | null
  vehicleModel: string | null
  vehicleYear: number | null
  oemCode: string | null
  quantityAvailable: number
  shop: MarketplaceShopPublicDto
}

export interface MarketplaceCatalogParams {
  q?: string
  city?: string
  make?: string
  model?: string
  yearFrom?: number
  yearTo?: number
  condition?: string
  minPrice?: number
  maxPrice?: number
  sort?: 'price_asc' | 'price_desc' | 'newest'
  page?: number
  pageSize?: number
}

// Seller
export interface MarketplaceShopDto {
  id: string
  slug: string
  name: string
  description: string | null
  city: string | null
  logoUrl: string | null
  phone: string | null
  messengerUrl: string | null
  publicContactName: string | null
  isPublished: boolean
}

export interface UpsertMarketplaceShopRequest {
  displayName: string
  description: string | null
  city: string | null
  phone: string | null
  messengerUrl: string | null
  publicContactName: string | null
  isPublished: boolean
}

export interface MarketplaceSellerListingDto {
  id: string
  shopId: string
  partId: string
  slug: string
  title: string
  description: string | null
  price: number | null
  currency: string
  photos: string[]
  condition: string | null
  vehicleMake: string | null
  vehicleModel: string | null
  vehicleYear: number | null
  oemCode: string | null
  quantityPublished: number
  quantityAvailable: number
  status: 'draft' | 'published' | 'hidden' | 'sold' | 'archived'
}

export interface MarketplaceSellerPartDto {
  id: string
  name: string
  photos: string[]
  quantityTotal: number
  quantityAvailable: number
  carMake: string | null
  carModel: string | null
  carYear: number | null
  condition: string | null
  oemCode: string | null
  alreadyListed: boolean
  listingId: string | null
}

export interface MarketplaceSellerSummaryDto {
  shop: MarketplaceShopDto | null
  draftListings: number
  publishedListings: number
  hiddenListings: number
  availableWarehouseParts: number
}

export interface UpdateMarketplaceListingRequest {
  title?: string
  description?: string
  price?: number
  quantityPublished?: number
}
