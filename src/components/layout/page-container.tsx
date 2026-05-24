import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Width = 'md' | 'lg' | 'xl'

interface PageContainerProps extends ComponentProps<'div'> {
  width?: Width
  children: ReactNode
}

const widthMap: Record<Width, string> = {
  md: 'max-w-(--page-width-md)',
  lg: 'max-w-(--page-width-lg)',
  xl: 'max-w-(--page-width-xl)',
}

export function PageContainer({
  width = 'xl',
  className,
  children,
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn('mx-auto w-full', widthMap[width], className)}
      {...props}
    >
      {children}
    </div>
  )
}
