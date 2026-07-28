import { Link } from 'react-router'
import type { SeoBreadcrumb } from '@/seo/product-seo'

interface BreadcrumbsProps {
  items: readonly SeoBreadcrumb[]
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Хлібні крихти">
      <ol className="flex flex-wrap items-center gap-2 text-sm text-neutral-400">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1
          return (
            <li key={item.path} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden>/</span>}
              <Link
                to={item.path}
                aria-current={isCurrent ? 'page' : undefined}
                className="inline-flex min-h-11 items-center hover:text-white"
              >
                {item.name}
              </Link>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
