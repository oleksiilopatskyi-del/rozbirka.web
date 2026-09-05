import type { FormEvent, ReactNode } from 'react'
import { X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { Notice } from './notice'

export interface FormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  /** What this dialog is for, one line under the title. */
  description?: ReactNode
  children: ReactNode
  submitLabel: string
  cancelLabel?: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  pending?: boolean
  /** Blocks submitting and says why. */
  submitDisabled?: boolean
  error?: string | null
  /** Wider dialog for forms with two columns. */
  size?: 'md' | 'lg'
  /** Runs when the dialog closes, for callers that restore focus themselves. */
  onCloseAutoFocus?: (event: Event) => void
}

/**
 * A form inside a dialog, for operations that must not cost the user their
 * place on the page. It closes on cancel and on success (the caller flips
 * `open`), never while a request is still running.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  submitLabel,
  cancelLabel = 'Скасувати',
  onSubmit,
  pending = false,
  submitDisabled = false,
  error = null,
  size = 'md',
  onCloseAutoFocus,
}: FormDialogProps) {
  return (
    <Dialog.Root
      onOpenChange={(next) => {
        if (pending && !next) return
        onOpenChange(next)
      }}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          onCloseAutoFocus={onCloseAutoFocus}
          className={cn(
            'bg-app-overlay border-app-line-2 rounded-sheet fixed inset-x-3 top-1/2 z-50 grid max-h-[90dvh] -translate-y-1/2 grid-rows-[auto_1fr_auto] overflow-hidden border text-white shadow-2xl sm:inset-x-auto sm:left-1/2 sm:w-full sm:-translate-x-1/2',
            size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md',
          )}
        >
          <header className="border-app-line flex items-start justify-between gap-3 border-b px-5 py-4">
            <div className="grid gap-1">
              <Dialog.Title className="text-lg font-semibold">
                {title}
              </Dialog.Title>
              {description === undefined ? (
                <Dialog.Description className="sr-only">
                  {typeof title === 'string' ? title : 'Форма'}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="text-app-muted text-sm">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <Button
                aria-label="Закрити"
                disabled={pending}
                size="icon"
                variant="quiet"
              >
                <X aria-hidden />
              </Button>
            </Dialog.Close>
          </header>

          <form
            aria-busy={pending}
            className="grid min-h-0 grid-rows-[1fr_auto]"
            onSubmit={onSubmit}
          >
            <div className="grid content-start gap-3 overflow-y-auto px-5 py-4">
              {error === null ? null : <Notice tone="danger">{error}</Notice>}
              {children}
            </div>
            <div className="border-app-line flex flex-wrap justify-end gap-2 border-t px-5 py-3">
              <Dialog.Close asChild>
                <Button disabled={pending}>{cancelLabel}</Button>
              </Dialog.Close>
              <Button
                aria-busy={pending}
                disabled={pending || submitDisabled}
                type="submit"
                variant="primary"
              >
                {submitLabel}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * A panel that slides in from the edge: filters and long secondary forms on a
 * phone, where a centred dialog would cover the thing being edited.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="bg-app-overlay border-app-line-2 fixed inset-x-0 bottom-0 z-50 grid max-h-[85dvh] grid-rows-[auto_1fr_auto] overflow-hidden rounded-t-2xl border-t text-white shadow-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:w-full sm:max-w-md sm:rounded-none sm:rounded-l-2xl sm:border-t-0 sm:border-l">
          <header className="border-app-line flex items-center justify-between gap-3 border-b px-5 py-4">
            <Dialog.Title className="text-base font-semibold">
              {title}
            </Dialog.Title>
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
            <Dialog.Close asChild>
              <Button aria-label="Закрити" size="icon" variant="quiet">
                <X aria-hidden />
              </Button>
            </Dialog.Close>
          </header>
          <div className="grid content-start gap-3 overflow-y-auto px-5 py-4">
            {children}
          </div>
          {footer === undefined ? null : (
            <div className="border-app-line flex flex-wrap justify-end gap-2 border-t px-5 py-3">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
