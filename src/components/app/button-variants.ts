import { cva } from 'class-variance-authority'

/**
 * The cabinet button. Separate from the marketing `components/ui/button`
 * because the app needs 44px targets and the brand fill as its primary action.
 */
export const appButtonVariants = cva(
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-control border border-transparent px-4 text-[13.5px] font-medium whitespace-nowrap transition-colors outline-none select-none disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-brand text-brand-foreground font-semibold hover:bg-brand-hover',
        ghost:
          'border-app-line-2 text-app-muted hover:bg-white/[0.04] hover:text-app-ink',
        quiet: 'text-app-muted hover:bg-white/[0.04] hover:text-app-ink',
        danger:
          'border-state-danger/35 text-state-danger hover:bg-state-danger-soft',
      },
      size: {
        md: '',
        icon: 'min-w-11 px-0',
        wide: 'w-full',
      },
    },
    defaultVariants: { variant: 'ghost', size: 'md' },
  },
)
