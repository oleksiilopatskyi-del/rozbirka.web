import type { ReactNode } from 'react'
import { Link } from 'react-router'

export function MarketplaceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0e0f11] text-white">
      <header role="banner" className="border-b border-white/8">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-4 py-3">
          <Link
            to="/marketplace"
            className="text-sm font-semibold tracking-tight"
          >
            Rozbirka Маркет
          </Link>
          <Link
            to="/account"
            className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/80 hover:border-white/30"
          >
            Кабінет магазину
          </Link>
        </div>
      </header>
      {children}
    </div>
  )
}
