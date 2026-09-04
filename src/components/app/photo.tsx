import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react'
import { Dialog, Slot } from 'radix-ui'
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
 * The full-size view, opened from a grid or a gallery. Arrows on screen as well
 * as on the keyboard, a swipe on a phone, and a position counter — a viewer
 * that only answers to arrow keys is a viewer half the people cannot page
 * through.
 */
function Lightbox({
  photos,
  index,
  label,
  onIndex,
  onClose,
}: {
  photos: readonly Photo[]
  index: number
  label: string
  onIndex: (next: number) => void
  onClose: () => void
}) {
  const total = photos.length
  const step = useCallback(
    (delta: number) => onIndex((index + delta + total) % total),
    [index, onIndex, total],
  )
  const touchStart = useRef<number | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') step(1)
      if (event.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  const photo = photos[index]
  if (!photo) return null
  const alt = photo.alt ?? `${label} ${String(index + 1)}`

  return (
    <Dialog.Root onOpenChange={(next) => !next && onClose()} open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/90" />
        <Dialog.Content className="fixed inset-0 z-50 grid grid-rows-[auto_minmax(0,1fr)_auto] gap-2 p-3 sm:p-4">
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          <Dialog.Description className="sr-only">{alt}</Dialog.Description>
          <header className="flex items-center justify-between gap-3">
            <p className="text-app-muted font-mono text-[11.5px] tabular-nums">
              {index + 1} з {total}
            </p>
            <Dialog.Close asChild>
              <Button aria-label="Закрити фото" size="icon" variant="quiet">
                <X aria-hidden />
              </Button>
            </Dialog.Close>
          </header>

          <div
            className="grid min-h-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"
            onTouchEnd={(event) => {
              const from = touchStart.current
              const to = event.changedTouches[0]?.clientX
              touchStart.current = null
              if (from === null || to === undefined) return
              if (Math.abs(to - from) > 48) step(to < from ? 1 : -1)
            }}
            onTouchStart={(event) => {
              touchStart.current = event.touches[0]?.clientX ?? null
            }}
          >
            {total > 1 ? (
              <Button
                aria-label="Попереднє фото"
                onClick={() => step(-1)}
                size="icon"
                variant="quiet"
              >
                <ChevronLeft aria-hidden />
              </Button>
            ) : (
              <span />
            )}
            <img
              alt={alt}
              className="mx-auto max-h-full max-w-full rounded-lg object-contain"
              src={photo.url}
            />
            {total > 1 ? (
              <Button
                aria-label="Наступне фото"
                onClick={() => step(1)}
                size="icon"
                variant="quiet"
              >
                <ChevronRight aria-hidden />
              </Button>
            ) : (
              <span />
            )}
          </div>

          {total > 1 ? (
            <ul className="flex justify-center gap-1.5 overflow-x-auto pb-1">
              {photos.map((item, position) => (
                <li key={item.id}>
                  <button
                    aria-current={position === index ? 'true' : undefined}
                    aria-label={`Фото ${String(position + 1)}`}
                    className={cn(
                      'focus-visible:outline-brand block size-12 shrink-0 overflow-hidden rounded-md border',
                      position === index
                        ? 'border-brand'
                        : 'border-app-line opacity-60',
                    )}
                    onClick={() => onIndex(position)}
                    type="button"
                  >
                    <img
                      alt=""
                      className="h-full w-full object-cover"
                      src={item.thumbnailUrl ?? item.url}
                    />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <span />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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

  if (photos.length === 0) {
    return (
      <p className={cn('text-app-dim text-[12.5px]', className)}>
        {emptyLabel}
      </p>
    )
  }

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
      {openIndex === null ? null : (
        <Lightbox
          index={openIndex}
          label={label}
          onClose={() => setOpenIndex(null)}
          onIndex={setOpenIndex}
          photos={photos}
        />
      )}
    </>
  )
}

/**
 * A record's photos when they are the point of the section: one large frame
 * carries what the record actually looks like, the rest sit under it as a
 * strip. Every frame opens the same viewer, so the small ones are a way in
 * rather than all a person gets.
 */
export function Gallery({
  photos,
  label,
  emptyLabel = 'Фото ще не додано',
  ratio = 'wide',
  className,
}: {
  photos: readonly Photo[]
  /** Names the gallery, and seeds the alt text of each photo. */
  label: string
  emptyLabel?: ReactNode
  /** Shape of the large frame. */
  ratio?: 'wide' | 'square'
  className?: string
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const cover = photos[0]

  if (!cover) {
    return (
      <p className={cn('text-app-dim text-[12.5px]', className)}>
        {emptyLabel}
      </p>
    )
  }

  const nameOf = (photo: Photo, index: number) =>
    photo.alt ?? `${label} ${String(index + 1)}`

  return (
    <div className={cn('grid gap-2', className)}>
      <button
        aria-label={`${nameOf(cover, 0)} — відкрити`}
        className="focus-visible:outline-brand block cursor-zoom-in"
        onClick={() => setOpenIndex(0)}
        type="button"
      >
        <Thumbnail
          alt={nameOf(cover, 0)}
          photo={cover}
          ratio={ratio === 'wide' ? 'wide' : 'square'}
        />
      </button>
      {photos.length > 1 ? (
        <ul
          aria-label={label}
          className="grid grid-cols-4 gap-2 sm:grid-cols-5"
        >
          {photos.slice(1).map((photo, position) => (
            <li key={photo.id}>
              <button
                aria-label={`${nameOf(photo, position + 1)} — відкрити`}
                className="focus-visible:outline-brand block w-full cursor-zoom-in"
                onClick={() => setOpenIndex(position + 1)}
                type="button"
              >
                <Thumbnail alt={nameOf(photo, position + 1)} photo={photo} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {openIndex === null ? null : (
        <Lightbox
          index={openIndex}
          label={label}
          onClose={() => setOpenIndex(null)}
          onIndex={setOpenIndex}
          photos={photos}
        />
      )}
    </div>
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
  asChild = false,
  children,
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
  /** Render the card as the given element — a router link, for instance. */
  asChild?: boolean
  children?: ReactNode
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

  if (asChild) {
    return (
      <Slot.Root className={shell}>
        {children}
        {media}
        {body}
      </Slot.Root>
    )
  }

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
