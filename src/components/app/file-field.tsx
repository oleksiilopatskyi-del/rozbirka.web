import type { ComponentProps, ReactNode } from 'react'
import { FileWarning, RotateCcw, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { useFieldControl } from './field-context'
import { formatFileSize } from './format'
import { Thumbnail } from './photo'

/**
 * File picker sized like every other control: the browser's own button is the
 * click target, so it gets the same 44px floor rather than the 20px default.
 */
export function FileField({ className, ...props }: ComponentProps<'input'>) {
  const field = useFieldControl()

  return (
    <input
      {...field}
      type="file"
      {...props}
      className={cn(
        'bg-app-input border-app-line-2 rounded-control text-app-muted min-h-11 w-full cursor-pointer border px-3 py-2 text-sm',
        'file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border-0 file:bg-white/[0.08] file:px-3 file:text-[12.5px] file:text-white hover:file:bg-white/[0.12]',
        className,
      )}
    />
  )
}

export interface UploadItem {
  id: string
  name: string
  /** Bytes, when the file came from the picker rather than the server. */
  size?: number
  status: 'pending' | 'uploaded' | 'failed'
  /** Why it failed, in words the user can act on. */
  error?: string
  previewUrl?: string
  url?: string
}

/**
 * The files attached to a record, each with its own state and its own way out:
 * a failed upload can be retried or dropped without touching the others.
 */
export function UploadList({
  items,
  label,
  onRetry,
  onRemove,
  emptyLabel = 'Файли не вибрано.',
}: {
  items: readonly UploadItem[]
  label: string
  onRetry?: (item: UploadItem) => void
  onRemove?: (item: UploadItem) => void
  emptyLabel?: ReactNode
}) {
  if (items.length === 0) {
    return <p className="text-app-dim text-[12.5px]">{emptyLabel}</p>
  }

  return (
    <ul aria-label={label} className="grid gap-2">
      {items.map((item) => (
        <li
          className="border-app-line rounded-panel bg-app-raised flex flex-wrap items-center gap-3 border p-2"
          key={item.id}
        >
          {item.previewUrl || item.url ? (
            <Thumbnail
              alt=""
              className="size-11 shrink-0"
              photo={{ url: item.previewUrl ?? item.url! }}
            />
          ) : (
            <span className="bg-app-input text-app-dim grid size-11 shrink-0 place-items-center rounded-lg">
              <Upload aria-hidden className="size-4" />
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] text-white">
              {item.name}
            </span>
            <span
              className={cn(
                'block font-mono text-[11px]',
                item.status === 'failed' ? 'text-state-danger' : 'text-app-dim',
              )}
            >
              {item.status === 'failed'
                ? (item.error ?? 'Не вдалося завантажити')
                : item.status === 'pending'
                  ? 'Завантажується…'
                  : item.size === undefined
                    ? 'Збережено'
                    : formatFileSize(item.size)}
            </span>
          </span>

          <span className="flex shrink-0 flex-wrap gap-2">
            {item.status === 'failed' && onRetry !== undefined ? (
              <Button
                aria-label={`Повторити ${item.name}`}
                onClick={() => onRetry(item)}
                size="icon"
              >
                <RotateCcw aria-hidden />
              </Button>
            ) : null}
            {onRemove === undefined ? null : (
              <Button
                aria-label={`Прибрати ${item.name}`}
                onClick={() => onRemove(item)}
                size="icon"
                variant="quiet"
              >
                <X aria-hidden />
              </Button>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Sits under an upload list when some files did not make it. */
export function UploadSummary({ failed }: { failed: number }) {
  if (failed === 0) return null

  return (
    <p
      className="text-state-danger flex items-center gap-2 text-[12.5px]"
      role="status"
    >
      <FileWarning aria-hidden className="size-4" />
      {failed === 1
        ? 'Один файл не завантажився. Повторіть або приберіть його, щоб зберегти.'
        : `${String(failed)} файлів не завантажилися. Повторіть або приберіть їх, щоб зберегти.`}
    </p>
  )
}
