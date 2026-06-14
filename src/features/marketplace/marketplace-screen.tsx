import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Search } from 'lucide-react'
import { marketplaceApi, type MarketplaceCatalogResult } from '@/api/marketplace'
import type { MarketplaceCatalogParams } from './marketplace-api-types'
import { ListingCard } from './listing-card'

const SORTS: { value: NonNullable<MarketplaceCatalogParams['sort']>; label: string }[] = [
  { value: 'newest', label: 'Новіші' },
  { value: 'price_asc', label: 'Дешевші' },
  { value: 'price_desc', label: 'Дорожчі' },
]

export function MarketplaceScreen() {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<MarketplaceCatalogParams>({ sort: 'newest' })
  const [data, setData] = useState<MarketplaceCatalogResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((params: MarketplaceCatalogParams) => {
    setLoading(true)
    setError(null)
    marketplaceApi
      .getCatalog(params)
      .then(setData)
      .catch(() => { setError('Каталог тимчасово недоступний.') })
      .finally(() => { setLoading(false) })
  }, [])

  useEffect(() => { load(filters) }, [load, filters])

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    setFilters((f) => ({ ...f, q: query.trim() || undefined }))
  }

  const setSort = (sort: MarketplaceCatalogParams['sort']) =>
    setFilters((f) => ({ ...f, sort }))

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 py-8 text-[#e8eaed]">
      <h1 className="mb-6 text-2xl font-semibold text-white">Каталог запчастин з розборок</h1>

      <form role="search" onSubmit={onSearch} className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-white/40" />
          <input
            type="search"
            aria-label="Пошук запчастини, OEM-коду, марки або моделі"
            value={query}
            onChange={(e) => { setQuery(e.target.value) }}
            placeholder="Пошук: назва, OEM-код, марка…"
            className="w-full rounded-lg border border-white/10 bg-[#16181c] py-2 pr-3 pl-9 text-sm text-white placeholder:text-white/30"
          />
        </div>
        <button type="submit" className="rounded-lg bg-brand px-4 text-sm font-medium text-black">
          Знайти
        </button>
      </form>

      <div className="mb-4 flex gap-2">
        {SORTS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => { setSort(s.value) }}
            aria-pressed={filters.sort === s.value}
            className={`rounded-full border px-3 py-1 text-xs ${filters.sort === s.value ? 'border-brand text-brand' : 'border-white/10 text-white/60'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {loading && !data && (
        <p className="py-12 text-center text-sm text-white/40">Завантаження…</p>
      )}
      {!loading && !error && data && data.listings.length === 0 && (
        <p className="py-12 text-center text-sm text-white/40">
          Нічого не знайдено за вашим запитом.
        </p>
      )}
      {data && data.listings.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.listings.map((l) => (
            <ListingCard key={l.slug} listing={l} />
          ))}
        </div>
      )}
    </main>
  )
}
