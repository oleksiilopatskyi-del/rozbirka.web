import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  marketplaceApi,
  type MarketplaceCatalogResult,
} from '@/api/marketplace'
import type { MarketplaceShopPublicDto } from './marketplace-api-types'
import { ListingCard } from './listing-card'

export function ShopProfileScreen() {
  const { slug } = useParams<{ slug: string }>()
  const [shop, setShop] = useState<MarketplaceShopPublicDto | null>(null)
  const [catalog, setCatalog] = useState<MarketplaceCatalogResult | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'notfound'>('loading')

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    void Promise.all([
      marketplaceApi.getShop(slug),
      marketplaceApi.getShopListings(slug),
    ])
      .then(([s, c]) => {
        if (cancelled) return
        setShop(s)
        setCatalog(c)
        setState('ok')
      })
      .catch(() => {
        if (cancelled) return
        setState('notfound')
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  if (state === 'loading') {
    return (
      <p className="py-16 text-center text-sm text-white/40">Завантаження…</p>
    )
  }
  if (state === 'notfound' || !shop) {
    return (
      <div className="py-16 text-center text-sm text-white/50">
        Магазин не знайдено.{' '}
        <Link to="/marketplace" className="text-brand">
          До каталогу
        </Link>
      </div>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 py-8 text-[#e8eaed]">
      <Link to="/marketplace" className="text-xs text-white/50">
        ← До каталогу
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-white">{shop.name}</h1>
      {shop.city && <p className="mt-1 text-sm text-white/60">{shop.city}</p>}
      {shop.description && (
        <p className="mt-3 text-sm text-white/80">{shop.description}</p>
      )}
      <div className="mt-3 space-y-1 text-sm">
        {shop.phone && (
          <a href={`tel:${shop.phone}`} className="block text-brand">
            {shop.phone}
          </a>
        )}
        {shop.messengerUrl && (
          <a
            href={shop.messengerUrl}
            target="_blank"
            rel="noreferrer"
            className="block text-brand"
          >
            Месенджер
          </a>
        )}
      </div>

      <h2 className="mt-8 mb-3 text-lg font-medium text-white">Оголошення</h2>
      {catalog?.listings.length === 0 && (
        <p className="text-sm text-white/40">
          Поки що немає активних оголошень.
        </p>
      )}
      {(catalog?.listings.length ?? 0) > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {catalog?.listings.map((l) => (
            <ListingCard key={l.slug} listing={l} />
          ))}
        </div>
      )}
    </main>
  )
}
