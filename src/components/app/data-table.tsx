import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface DataColumn<Row> {
  key: string
  /** Column header and, on narrow screens, the per-cell label. */
  label: string
  cell: (row: Row) => ReactNode
  align?: 'start' | 'end'
  /** The identifying column: keeps its own weight and drops the mobile label. */
  variant?: 'primary' | 'default'
  /** Action columns whose header is a label only for assistive technology. */
  headerHidden?: boolean
}

export interface DataTableProps<Row> {
  /** Names the table for assistive technology; visually hidden. */
  caption: string
  columns: readonly DataColumn<Row>[]
  rows: readonly Row[]
  rowKey: (row: Row) => string
  /** Shown instead of the body when there is nothing to list. */
  empty?: ReactNode
  onRowClick?: (row: Row) => void
  footer?: ReactNode
}

/**
 * One record per row on desktop, one card per record below 768px — same DOM in
 * both, so the row is never duplicated for screen readers or tests. ARIA roles
 * are explicit because the mobile layout drops the table display.
 */
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  onRowClick,
  footer,
}: DataTableProps<Row>) {
  if (rows.length === 0 && empty !== undefined) {
    // The footer stays: page 2 of a filtered list can come back empty, and the
    // way back is in the pagination.
    return (
      <div className="border-app-line rounded-panel bg-app-raised overflow-hidden border">
        {empty}
        {footer}
      </div>
    )
  }

  return (
    <div className="border-app-line rounded-panel bg-app-raised overflow-hidden border md:overflow-x-auto">
      <table
        className="data-table w-full border-collapse text-[13.5px]"
        role="table"
      >
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr role="row">
            {columns.map((column) => (
              <th
                className={cn(
                  'text-app-dim border-app-line border-b px-3.5 py-2.5 font-mono text-[10.5px] font-normal tracking-[0.08em] whitespace-nowrap uppercase',
                  column.align === 'end' ? 'text-right' : 'text-left',
                )}
                key={column.key}
                role="columnheader"
                scope="col"
              >
                {column.headerHidden ? (
                  <span className="sr-only">{column.label}</span>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              className={cn(
                'border-app-line md:border-b',
                onRowClick !== undefined &&
                  'cursor-pointer hover:bg-white/[0.025]',
              )}
              key={rowKey(row)}
              onClick={
                onRowClick === undefined ? undefined : () => onRowClick(row)
              }
              role="row"
            >
              {columns.map((column) => (
                <td
                  className={cn(
                    'px-3.5 py-3',
                    column.align === 'end' && 'text-right tabular-nums',
                    column.variant === 'primary'
                      ? 'text-app-ink font-medium'
                      : 'text-app-muted',
                  )}
                  data-label={
                    column.variant === 'primary' ? undefined : column.label
                  }
                  key={column.key}
                  role="cell"
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {footer}
    </div>
  )
}
