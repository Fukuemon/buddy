import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export type TableProps = {
  children: ReactNode
  /** true のとき、横に送っても先頭の列を固定する。 */
  stickyColumn?: boolean
}

/** 行を格子で並べる表。Table.Header、Table.Body、Table.Row、Table.Cell で組む。 */
export const Table = ({ children, stickyColumn = false }: TableProps) => (
  <table
    className={clsx(
      'grid w-full border-collapse',
      stickyColumn && '[&_td:first-child]:sticky [&_td:first-child]:left-0',
    )}
  >
    {children}
  </table>
)

const TableHeader = ({ children }: { children: ReactNode }) => (
  <thead className="grid text-text-secondary">{children}</thead>
)

const TableBody = ({ children }: { children: ReactNode }) => (
  <tbody className="grid">{children}</tbody>
)

const TableRow = ({ children, className }: { children: ReactNode; className?: string }) => (
  <tr
    className={clsx('grid items-center gap-5 border-b border-gray-100 bg-gray-0 px-5', className)}
  >
    {children}
  </tr>
)

export type TableCellProps = {
  children: ReactNode
  /** true のとき、行の残りの幅を全て使う。 */
  expanded?: boolean
  width?: number
}

const TableCell = ({ children, expanded = false, width }: TableCellProps) => (
  <td
    className={clsx(
      'grid py-2 text-left align-middle text-[15px] whitespace-nowrap',
      expanded && 'w-full',
    )}
    style={{ minWidth: width }}
  >
    {children}
  </td>
)

Table.Header = TableHeader
Table.Body = TableBody
Table.Row = TableRow
Table.Cell = TableCell
