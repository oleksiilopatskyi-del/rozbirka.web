import type { ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { cn } from '@/lib/utils'
import { Button } from './button'

export interface MenuAction {
  key: string
  label: string
  onSelect: () => void
  icon?: ReactNode
  /** Marks an action that removes or ends something. */
  destructive?: boolean
  disabled?: boolean
}

/**
 * The actions a record has that are not the one people came for. Keeping
 * archive and delete out of the header stops a destructive click from sitting
 * next to the everyday one, without hiding them behind a different screen.
 */
export function ActionMenu({
  label,
  actions,
}: {
  /** Names the trigger: "Інші дії з автомобілем". */
  label: string
  actions: readonly MenuAction[]
}) {
  if (actions.length === 0) return null

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button aria-label={label} size="icon">
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="bg-app-overlay border-app-line-2 rounded-sheet z-50 grid min-w-52 gap-1 border p-1.5 shadow-2xl"
          sideOffset={6}
        >
          {actions.map((action) => (
            <DropdownMenu.Item
              className={cn(
                'rounded-control flex min-h-11 cursor-pointer items-center gap-2.5 px-3 text-[13.5px] outline-none select-none',
                'data-[highlighted]:bg-white/[0.06]',
                'data-[disabled]:pointer-events-none data-[disabled]:opacity-55',
                action.destructive
                  ? 'text-state-danger data-[highlighted]:bg-state-danger-soft'
                  : 'text-app-ink',
              )}
              {...(action.disabled === undefined
                ? {}
                : { disabled: action.disabled })}
              key={action.key}
              onSelect={action.onSelect}
            >
              {action.icon}
              {action.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
