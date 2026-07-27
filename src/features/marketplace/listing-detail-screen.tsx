import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { marketplaceApi } from '@/api/marketplace'
import type { MarketplaceListingDetailDto } from './marketplace-api-types'

export function ListingDetailScreen() {
  const { slugOrId } = useParams<{ slugOrId: string }>()
  const [listing, setListing] = useState<MarketplaceListingDetailDto | null>(
    null,
  )
  const [state, setState] = useState<'loading' | 'ok' | 'notfound'>('loading')

  useEffect(() => {
    if (!slugOrId) return
    let cancelled = false
    void marketplaceApi
      .getListing(slugOrId)
      .then((l) => {
        if (cancelled) return
        setListing(l)
        setState('ok')
      })
      .catch(() => {
        if (cancelled) return
        setState('notfound')
      })
    return () => {
      cancelled = true
    }
  }, [slugOrId])

  if (state === 'loading') {
    return (
      <p className="py-16 text-center text-sm text-white/40">Завантаження…</p>
    )
  }
  if (state === 'notfound' || !listing) {
    return (
      <div className="py-16 text-center text-sm text-white/50">
        Оголошення не знайдено.{' '}
        <Link to="/marketplace" className="text-brand">
          До каталогу
        </Link>
      </div>
    )
  }

  const vehicle = [
    listing.vehicleMake,
    listing.vehicleModel,
    listing.vehicleYear,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-8 text-[#e8eaed]">
      <Link to="/marketplace" className="text-xs text-white/50">
        ← До каталогу
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-white">
        {listing.title}
      </h1>
      {vehicle && <p className="mt-1 text-sm text-white/60">{vehicle}</p>}
      {listing.photos.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {listing.photos.map((p) => (
            <img
              key={p}
              src={p}
              alt={listing.title}
              className="aspect-square w-full rounded-lg object-cover"
            />
          ))}
        </div>
      )}
      <p className="mt-4 text-xl font-semibold text-white">
        {listing.price != null
          ? `${listing.price.toLocaleString('uk-UA')} ${listing.currency}`
          : 'Ціна за запитом'}
      </p>
      {listing.oemCode && (
        <p className="mt-1 text-sm text-white/50">OEM: {listing.oemCode}</p>
      )}
      {listing.description && (
        <p className="mt-4 whitespace-pre-line text-sm text-white/80">
          {listing.description}
        </p>
      )}

      <section className="mt-8 rounded-xl border border-white/10 bg-[#16181c] p-4">
        <Link
          to={`/marketplace/shops/${listing.shop.slug}`}
          className="text-sm font-medium text-white"
        >
          {listing.shop.name}
        </Link>
        {listing.shop.city && (
          <p className="text-xs text-white/50">{listing.shop.city}</p>
        )}
        <div className="mt-3 space-y-1 text-sm">
          {listing.shop.publicContactName && (
            <p className="text-white/70">{listing.shop.publicContactName}</p>
          )}
          {listing.shop.phone && (
            <a href={`tel:${listing.shop.phone}`} className="block text-brand">
              {listing.shop.phone}
            </a>
          )}
          {listing.shop.messengerUrl && (
            <a
              href={listing.shop.messengerUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-brand"
            >
              Написати в месенджер
            </a>
          )}
        </div>
      </section>
    </main>
  )
}
