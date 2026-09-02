import type { ReactNode } from 'react'
import { Dialog } from 'radix-ui'
import { Button } from './button'
import { Notice } from './notice'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  /** What this action does that cannot be undone. Say it plainly. */
  consequence: ReactNode
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  pending?: boolean
  destructive?: boolean
  /** Failure from the last attempt: shown here, where the retry button is. */
  error?: string | null
}

/**
 * Destructive actions confirm with their consequence, not with "Ви впевнені?".
 * The confirm button repeats the verb, so the choice is readable without the
 * question.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  consequence,
  confirmLabel,
  cancelLabel = 'Скасувати',
  onConfirm,
  pending = false,
  destructive = true,
  error = null,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="bg-app-overlay border-app-line-2 rounded-sheet fixed inset-x-4 top-1/2 z-50 grid max-w-md -translate-y-1/2 gap-3 border p-5 text-white shadow-2xl sm:inset-x-auto sm:left-1/2 sm:w-full sm:-translate-x-1/2">
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="text-app-muted text-sm leading-6">
            {consequence}
          </Dialog.Description>
          {error === null ? null : <Notice tone="danger">{error}</Notice>}
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Dialog.Close asChild>
              <Button disabled={pending}>{cancelLabel}</Button>
            </Dialog.Close>
            <Button
              aria-busy={pending}
              disabled={pending}
              onClick={onConfirm}
              variant={destructive ? 'danger' : 'primary'}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
