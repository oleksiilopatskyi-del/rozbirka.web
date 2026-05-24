import { LogIn, User as UserIcon } from 'lucide-react'
import { Link } from 'react-router'
import { PageContainer } from '@/components/layout/page-container'
import { BrandLogo } from '@/components/site/brand-logo'
import { NavLinks } from '@/components/site/nav-links'
import { AppStoreBadge, GooglePlayBadge } from '@/components/site/store-badges'
import { useAuth } from '@/auth/AuthContext'

export function SiteHeader() {
  const { status, user } = useAuth()
  const isAuthed = status === 'authenticated'

  return (
    <header className="bg-background px-6 py-6">
      <PageContainer>
        <nav
          aria-label="Головна навігація"
          className="bg-surface-1 flex h-[72px] items-center justify-between rounded-full pr-3 pl-8 ring-1 ring-white/[0.06]"
        >
          <div className="flex items-center gap-6">
            <BrandLogo />
            <NavLinks activeHref="#top" className="hidden lg:flex" />
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <AppStoreBadge />
            <GooglePlayBadge />
            {isAuthed ? (
              <Link
                to="/account"
                className="group flex h-12 items-center gap-3 rounded-full pr-1.5 pl-5 text-[15px] text-white ring-1 ring-white/10 transition-all duration-300 hover:bg-white/[0.06] hover:ring-white/25"
              >
                <span className="max-w-[160px] truncate">
                  {user?.displayName || user?.phone || 'Кабінет'}
                </span>
                <span className="bg-brand grid size-9 place-items-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5">
                  <UserIcon className="text-brand-foreground size-4" aria-hidden />
                </span>
              </Link>
            ) : (
              <Link
                to="/login"
                className="group flex h-12 items-center gap-3 rounded-full pr-1.5 pl-5 text-[15px] text-white ring-1 ring-white/10 transition-all duration-300 hover:bg-white/[0.06] hover:ring-white/25"
              >
                <span>Увійти</span>
                <span className="grid size-9 place-items-center rounded-full ring-1 ring-white/15 transition-transform duration-300 group-hover:translate-x-0.5">
                  <LogIn className="size-4" aria-hidden />
                </span>
              </Link>
            )}
          </div>

          <Link
            to={isAuthed ? '/account' : '/login'}
            className="bg-brand hover:bg-brand-hover text-brand-foreground flex h-11 items-center rounded-full px-5 text-[14px] font-medium transition-colors lg:hidden"
          >
            {isAuthed ? 'Кабінет' : 'Увійти'}
          </Link>
        </nav>
      </PageContainer>
    </header>
  )
}
