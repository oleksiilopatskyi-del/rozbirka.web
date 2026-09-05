import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Thumbnail } from './photo'

/**
 * How a record introduces itself in a list: the thing people say out loud on
 * top, the specification under it. One line forces the eye to parse a sentence;
 * two lines let it land on the name it is looking for.
 *
 * The photo is the record's own, never a generated monogram — three cars of the
 * same make would share the same initials and tell the reader nothing.
 */
export function RecordIdentity({
  title,
  subtitle,
  photoUrl,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  /** Cover image of the record; a neutral placeholder stands in when absent. */
  photoUrl?: string | null
  className?: string
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-3', className)}>
      {photoUrl === undefined ? null : photoUrl === null ? (
        <span
          aria-hidden
          className="bg-app-input border-app-line size-10 shrink-0 rounded-lg border"
        />
      ) : (
        <Thumbnail
          alt=""
          className="size-10 shrink-0 rounded-lg"
          photo={{ url: photoUrl }}
        />
      )}
      <span className="grid min-w-0 gap-0.5">
        <span className="text-app-ink truncate font-medium">{title}</span>
        {subtitle === undefined ? null : (
          <span className="text-app-dim truncate text-[12px]">{subtitle}</span>
        )}
      </span>
    </span>
  )
}
