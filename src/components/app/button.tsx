import type { ComponentProps } from 'react'
import type { VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@/lib/utils'
import { appButtonVariants } from './button-variants'

export type AppButtonProps = ComponentProps<'button'> &
  VariantProps<typeof appButtonVariants> & { asChild?: boolean }

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: AppButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="app-button"
      className={cn(appButtonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? 'button' })}
      {...props}
    />
  )
}
