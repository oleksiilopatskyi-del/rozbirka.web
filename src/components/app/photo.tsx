import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ImageOff, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { cn } from '@/lib/utils'
import { Button } from './button'

export interface Photo {
  id: string
  url: string
  thumbnailUrl?: string
  /** What the photo shows. Falls back to a numbered description. */
  alt?: string
}

/**
 * A photo that keeps its box whatever the file does: fixed aspect ratio so the
 * grid never reflows while loading, and a stated placeholder when the file is
 * gone rather than a broken-image glyph.
 */
export function Thumbnail({
  photo,
  alt,
  className,
  ratio = 'square',
}: {
  photo: Pick<Photo, 'url' | 'thumbnailUrl'>
  alt: string
  className?: string
  ratio?: 'square' | 'wide'
}) {
  const [failed, setFailed] = useState(false)

  return (
    <span
      className={cn(
        'bg-app-input border-app-line rounded-panel block overflow-hidden border',
        ratio === 'square' ? 'aspect-square' : 'aspect-4/3',
        className,
      )}
    >
      {failed ? (
        <span className="text-app-dim grid h-full place-items-center gap-1 p-2 text-center text-[11px]">
          <ImageOff aria-hidden className="size-4" />
          Фото недоступне
        </span>
      ) : (
        <img
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
          src={photo.thumbnailUrl ?? photo.url}
        />
      )}
    </span>
  )
}

/**
 * The photo strip of a record. Clicking opens the full image, so the grid can
 * stay small without hiding detail; without photos it says so instead of
 * collapsing to nothing.
 */
export function PhotoGrid({
  photos,
  label,
  emptyLabel = 'Фото ще не додано',
  className,
}: {
  photos: readonly Photo[]
  /** Names the group, and seeds the alt text of each photo. */
  label: string
  emptyLabel?: string
  className?: string
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const close = useCallback(() => setOpenIndex(null), [])

  useEffect(() => {
    if (openIndex === null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        setOpenIndex((current) =>
          current === null ? current : (current + 1) % photos.length,
        )
      }
      if (event.key === 'ArrowLeft') {
        setOpenIndex((current) =>
          current === null
            ? current
            : (current - 1 + photos.length) % photos.length,
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openIndex, photos.length])

  if (photos.length === 0) {
    return (
      <p className={cn('text-app-dim text-[12.5px]', className)}>
        {emptyLabel}
      </p>
    )
  }

  const open = openIndex === null ? null : (photos[openIndex] ?? null)

  return (
    <>
      <ul
        aria-label={label}
        className={cn(
          'grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6',
          className,
        )}
      >
        {photos.map((photo, index) => (
          <li key={photo.id}>
            <button
              aria-label={photo.alt ?? `${label} ${String(index + 1)}`}
              className="focus-visible:outline-brand block w-full cursor-zoom-in"
              onClick={() => setOpenIndex(index)}
              type="button"
            >
              <Thumbnail
                alt={photo.alt ?? `${label} ${String(index + 1)}`}
                photo={photo}
              />
            </button>
          </li>
        ))}
      </ul>
      <Dialog.Root
        onOpenChange={(next) => !next && close()}
        open={open !== null}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/85" />
          <Dialog.Content className="fixed inset-0 z-50 grid place-items-center p-4">
            <Dialog.Title className="sr-only">{label}</Dialog.Title>
            <Dialog.Description className="sr-only">
              {open?.alt ?? label}
            </Dialog.Description>
            {open === null ? null : (
              <img
                alt={open.alt ?? label}
                className="max-h-[85dvh] max-w-full rounded-lg object-contain"
                src={open.url}
              />
            )}
            <div className="mt-3 flex items-center gap-3">
              <p className="text-app-muted font-mono text-[11.5px] tabular-nums">
                {openIndex === null ? '' : openIndex + 1} з {photos.length}
              </p>
              <Dialog.Close asChild>
                <Button aria-label="Закрити фото">
                  <X aria-hidden />
                  Закрити
                </Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

/**
 * A record as a card: the photo carries recognition, the title carries
 * identity, and status stays visible without opening the record.
 */
export function RecordCard({
  title,
  photo,
  meta,
  status,
  footer,
  href,
  onOpen,
  className,
}: {
  title: ReactNode
  photo?: Pick<Photo, 'url' | 'thumbnailUrl'> | null
  /** Mono line under the title: codes, OEM, supplier. */
  meta?: ReactNode
  status?: ReactNode
  footer?: ReactNode
  href?: string
  onOpen?: () => void
  className?: string
}) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-semibold break-words text-white">
            {title}
          </span>
          {meta === undefined ? null : (
            <span className="text-app-dim mt-1 block font-mono text-[11px]">
              {meta}
            </span>
          )}
        </span>
        {status}
      </span>
      {footer === undefined ? null : (
        <span className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          {footer}
        </span>
      )}
    </>
  )

  const shell = cn(
    'border-app-line rounded-panel bg-app-raised flex min-h-11 flex-col gap-2 border p-3 text-left transition-colors',
    (href !== undefined || onOpen !== undefined) &&
      'hover:border-app-line-2 hover:bg-white/[0.02]',
    className,
  )

  const media =
    photo === undefined ? null : photo === null ? (
      <span className="bg-app-input rounded-panel text-app-dim mb-1 grid aspect-4/3 place-items-center text-[11px]">
        <ImageOff aria-hidden className="size-4" />
      </span>
    ) : (
      <Thumbnail alt="" className="mb-1" photo={photo} ratio="wide" />
    )

  if (href !== undefined) {
    return (
      <a className={shell} href={href}>
        {media}
        {body}
      </a>
    )
  }

  if (onOpen !== undefined) {
    return (
      <button className={shell} onClick={onOpen} type="button">
        {media}
        {body}
      </button>
    )
  }

  return (
    <div className={shell}>
      {media}
      {body}
    </div>
  )
}
