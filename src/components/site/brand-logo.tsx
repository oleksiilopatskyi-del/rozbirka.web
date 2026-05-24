import { cn } from '@/lib/utils'

interface BrandLogoProps {
  className?: string
  href?: string
}

export function BrandLogo({ className, href = '/' }: BrandLogoProps) {
  return (
    <a
      href={href}
      aria-label="rozbirka — на головну"
      className={cn(
        'text-brand inline-block text-2xl font-semibold tracking-tight',
        className,
      )}
    >
      rozbirka
    </a>
  )
}
