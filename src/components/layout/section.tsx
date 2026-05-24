import type { ComponentProps, ElementType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SectionProps extends ComponentProps<'section'> {
  as?: ElementType
  children: ReactNode
}

export function Section({
  as: Tag = 'section',
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <Tag className={cn('bg-background px-6 py-24', className)} {...props}>
      {children}
    </Tag>
  )
}
