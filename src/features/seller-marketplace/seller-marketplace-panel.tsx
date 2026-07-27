import { useCallback, useEffect, useState } from 'react'
import { marketplaceApi } from '@/api/marketplace'
import type {
  MarketplaceSellerListingDto,
  MarketplaceSellerPartDto,
  MarketplaceSellerSummaryDto,
  MarketplaceShopDto,
  UpsertMarketplaceShopRequest,
} from '@/features/marketplace/marketplace-api-types'

interface ShopForm {
  displayName: string
  description: string
  city: string
  phone: string
  messengerUrl: string
  publicContactName: string
  isPublished: boolean
}

const emptyForm: ShopForm = {
  displayName: '',
  description: '',
  city: '',
  phone: '',
  messengerUrl: '',
  publicContactName: '',
  isPublished: false,
}

function shopToForm(shop: MarketplaceShopDto | null): ShopForm {
  if (!shop) return emptyForm
  return {
    displayName: shop.name,
    description: shop.description ?? '',
    city: shop.city ?? '',
    phone: shop.phone ?? '',
    messengerUrl: shop.messengerUrl ?? '',
    publicContactName: shop.publicContactName ?? '',
    isPublished: shop.isPublished,
  }
}

function formToRequest(f: ShopForm): UpsertMarketplaceShopRequest {
  return {
    displayName: f.displayName.trim(),
    description: f.description.trim() || null,
    city: f.city.trim() || null,
    phone: f.phone.trim() || null,
    messengerUrl: f.messengerUrl.trim() || null,
    publicContactName: f.publicContactName.trim() || null,
    isPublished: f.isPublished,
  }
}

export function SellerMarketplacePanel() {
  const [summary, setSummary] = useState<MarketplaceSellerSummaryDto | null>(
    null,
  )
  const [listings, setListings] = useState<MarketplaceSellerListingDto[]>([])
  const [parts, setParts] = useState<MarketplaceSellerPartDto[]>([])
  const [form, setForm] = useState<ShopForm>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const applyData = useCallback(
    (
      s: MarketplaceSellerSummaryDto,
      l: MarketplaceSellerListingDto[],
      p: MarketplaceSellerPartDto[],
    ) => {
      setSummary(s)
      setForm(shopToForm(s.shop))
      setListings(l)
      setParts(p)
    },
    [],
  )

  const refresh = useCallback(async () => {
    const [s, l, p] = await Promise.all([
      marketplaceApi.getSellerSummary(),
      marketplaceApi.getSellerListings(),
      marketplaceApi.searchSellerParts(),
    ])
    applyData(s, l.items, p.items)
  }, [applyData])

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      marketplaceApi.getSellerSummary(),
      marketplaceApi.getSellerListings(),
      marketplaceApi.searchSellerParts(),
    ])
      .then(([s, l, p]) => {
        if (cancelled) return
        applyData(s, l.items, p.items)
      })
      .catch(() => {
        if (!cancelled) setError('Не вдалось завантажити магазин.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [applyData])

  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>) => {
      setBusy(key)
      setError(null)
      try {
        await fn()
        await refresh()
      } catch {
        setError('Дію не вдалось виконати.')
      } finally {
        setBusy(null)
      }
    },
    [refresh],
  )

  const saveShop = () =>
    run('shop', () => marketplaceApi.upsertSellerShop(formToRequest(form)))

  if (loading) {
    return (
      <p className="py-12 text-center text-sm text-white/40">Завантаження…</p>
    )
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Shop form */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-white">Магазин</h2>
        <label className="block text-sm">
          <span className="text-white/60">Назва</span>
          <input
            value={form.displayName}
            onChange={(e) =>
              setForm((f) => ({ ...f, displayName: e.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#16181c] px-3 py-2 text-white"
          />
        </label>
        <label className="block text-sm">
          <span className="text-white/60">Місто</span>
          <input
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#16181c] px-3 py-2 text-white"
          />
        </label>
        <label className="block text-sm">
          <span className="text-white/60">Телефон</span>
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#16181c] px-3 py-2 text-white"
          />
        </label>
        <label className="block text-sm">
          <span className="text-white/60">Месенджер (Telegram/Viber URL)</span>
          <input
            value={form.messengerUrl}
            onChange={(e) =>
              setForm((f) => ({ ...f, messengerUrl: e.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#16181c] px-3 py-2 text-white"
          />
        </label>
        <label className="block text-sm">
          <span className="text-white/60">Контактна особа</span>
          <input
            value={form.publicContactName}
            onChange={(e) =>
              setForm((f) => ({ ...f, publicContactName: e.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#16181c] px-3 py-2 text-white"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            checked={form.isPublished}
            onChange={(e) =>
              setForm((f) => ({ ...f, isPublished: e.target.checked }))
            }
          />
          Опублікувати магазин
        </label>
        <button
          type="button"
          disabled={busy === 'shop'}
          onClick={() => void saveShop()}
          className="bg-brand rounded-lg px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          Зберегти магазин
        </button>
      </section>

      {/* Listings */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-white">
          Оголошення ({summary?.publishedListings ?? 0} опубліковано)
        </h2>
        {listings.length === 0 && (
          <p className="text-sm text-white/40">Немає оголошень.</p>
        )}
        <ul className="space-y-2">
          {listings.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-[#16181c] px-3 py-2 text-sm"
            >
              <span className="text-white">
                {l.title} <span className="text-white/40">· {l.status}</span>
              </span>
              <span className="flex gap-2">
                {l.status !== 'published' && (
                  <button
                    type="button"
                    disabled={busy === l.id}
                    onClick={() =>
                      void run(l.id, () => marketplaceApi.publishListing(l.id))
                    }
                    className="text-brand"
                  >
                    Опублікувати
                  </button>
                )}
                {l.status === 'published' && (
                  <button
                    type="button"
                    disabled={busy === l.id}
                    onClick={() =>
                      void run(l.id, () => marketplaceApi.hideListing(l.id))
                    }
                    className="text-white/60"
                  >
                    Сховати
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy === l.id}
                  onClick={() =>
                    void run(l.id, () => marketplaceApi.archiveListing(l.id))
                  }
                  className="text-red-300"
                >
                  Архів
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Add from warehouse */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-white">
          Додати зі складу ({summary?.availableWarehouseParts ?? 0} доступно)
        </h2>
        <ul className="space-y-2">
          {parts.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-[#16181c] px-3 py-2 text-sm"
            >
              <span className="text-white">
                {p.name}{' '}
                <span className="text-white/40">
                  · {p.quantityAvailable} шт
                </span>
              </span>
              <button
                type="button"
                disabled={p.alreadyListed || busy === p.id}
                onClick={() =>
                  void run(p.id, () =>
                    marketplaceApi.createListingFromPart(p.id),
                  )
                }
                className="text-brand disabled:text-white/30"
              >
                {p.alreadyListed ? 'Вже в маркеті' : 'Створити оголошення'}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
