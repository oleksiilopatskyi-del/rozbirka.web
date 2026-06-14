import { Link } from 'react-router'
import type { MarketplaceListingCardDto } from './marketplace-api-types'

export function ListingCard({ listing }: { listing: MarketplaceListingCardDto }) {
  const vehicle = [listing.vehicleMake, listing.vehicleModel, listing.vehicleYear]
    .filter(Boolean)
    .join(' ')
  return (
    <Link
      to={`/marketplace/listings/${listing.slug}`}
      className="group block overflow-hidden rounded-[10px] border border-white/8 bg-[#16181c] transition-colors hover:border-white/20"
    >
      <article>
        <div className="aspect-[4/3] w-full bg-zinc-800/60">
          {listing.photo && (
            <img src={listing.photo} alt={listing.title} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="space-y-1 p-3">
          <h3 className="line-clamp-1 text-sm font-medium text-white">{listing.title}</h3>
          {vehicle && <p className="line-clamp-1 text-xs text-white/50">{vehicle}</p>}
          {listing.oemCode && <p className="text-xs text-white/40">OEM: {listing.oemCode}</p>}
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-semibold text-white">
              {listing.price != null
                ? `${listing.price.toLocaleString('uk-UA')} ${listing.currency}`
                : 'Ціна за запитом'}
            </span>
            <span className="text-xs text-white/40">{listing.shop.city ?? ''}</span>
          </div>
        </div>
      </article>
    </Link>
  )
}
