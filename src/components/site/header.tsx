import { useEffect, useRef, useState } from 'react'
import { LogIn, Menu, User as UserIcon, X } from 'lucide-react'
import { Link } from 'react-router'
import { PageContainer } from '@/components/layout/page-container'
import { BrandLogo } from '@/components/site/brand-logo'
import { NavLinks } from '@/components/site/nav-links'
import { AppStoreBadge, GooglePlayBadge } from '@/components/site/store-badges'
import { useAuth } from '@/auth/AuthContext'

export function SiteHeader() {
  const { status, user } = useAuth()
  const isAuthed = status === 'authenticated'
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

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
                  {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty strings should fall through */}
                  {user?.displayName || user?.phone || 'Кабінет'}
                </span>
                <span className="bg-brand grid size-9 place-items-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5">
                  <UserIcon
                    className="text-brand-foreground size-4"
                    aria-hidden
                  />
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

          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            aria-controls="mobile-site-menu"
            aria-label={open ? 'Закрити меню' : 'Відкрити меню'}
            onClick={() => setOpen((value) => !value)}
            className="grid size-11 place-items-center rounded-full text-white ring-1 ring-white/15 lg:hidden"
          >
            {open ? (
              <X className="size-5" aria-hidden />
            ) : (
              <Menu className="size-5" aria-hidden />
            )}
          </button>
        </nav>
        {open && (
          <nav
            id="mobile-site-menu"
            aria-label="Мобільна навігація"
            className="bg-surface-1 mt-3 flex flex-col gap-4 rounded-[28px] p-5 ring-1 ring-white/[0.06] lg:hidden"
          >
            <NavLinks
              className="flex-col items-stretch"
              onNavigate={() => setOpen(false)}
            />
            <div className="flex flex-col gap-3 sm:flex-row">
              <AppStoreBadge />
              <GooglePlayBadge />
            </div>
            <Link
              to={isAuthed ? '/account' : '/login'}
              onClick={() => setOpen(false)}
              className="bg-brand text-brand-foreground inline-flex min-h-11 items-center justify-center rounded-full px-5"
            >
              {isAuthed ? 'Кабінет' : 'Увійти'}
            </Link>
          </nav>
        )}
      </PageContainer>
    </header>
  )
}
