import { cn } from '@/lib/utils'
import { navItems } from '@/components/site/nav-items'

interface NavLinksProps {
  activeHref?: string
  className?: string
  onNavigate?: () => void
}

export function NavLinks({ activeHref, className, onNavigate }: NavLinksProps) {
  return (
    <ul
      role="list"
      className={cn('flex flex-wrap items-center gap-1', className)}
    >
      {navItems.map((item) => {
        const isActive = activeHref === item.href
        return (
          <li key={item.label}>
            <a
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              onClick={onNavigate}
              className={cn(
                'flex h-11 items-center rounded-full px-5 text-[15px] transition-colors',
                isActive
                  ? 'border-brand text-brand border'
                  : 'text-neutral-400 hover:text-white',
              )}
            >
              {item.label}
            </a>
          </li>
        )
      })}
    </ul>
  )
}
