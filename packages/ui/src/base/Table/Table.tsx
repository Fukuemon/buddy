import { clsx } from 'clsx'
import type { ReactNode } from 'react'

export type TableProps = {
  children: ReactNode
  /** true のとき、横に送っても先頭の列を固定する。 */
  hasStickyColumn?: boolean
}

/**
 * 同じ項目を持つ行を並べる表。Table.Header、Table.Body、Table.Row、Table.HeaderCell、Table.Cell で組む。
 * 表の役割を保つため、table の要素の display は変えない。
 */
export const Table = ({ children, hasStickyColumn = false }: TableProps) => (
  <table
    className={clsx(
      'w-full border-collapse',
      hasStickyColumn &&
        '[&_tr>:first-child]:sticky [&_tr>:first-child]:left-0 [&_tr>:first-child]:bg-surface',
    )}
  >
    {children}
  </table>
)

/** 見出しの行を入れる thead。 */
const TableHeader = ({ children }: { children: ReactNode }) => <thead>{children}</thead>

/** データの行を入れる tbody。 */
const TableBody = ({ children }: { children: ReactNode }) => <tbody>{children}</tbody>

/** 表の 1 行。 */
const TableRow = ({ children, className }: { children: ReactNode; className?: string }) => (
  <tr className={clsx('border-b border-border bg-surface', className)}>{children}</tr>
)

export type TableCellProps = {
  children: ReactNode
  /** true のとき、行の残りの幅を全て使う。 */
  expanded?: boolean
  /** 列の最小の幅（px）。 */
  width?: number
}

const cellClassName = (expanded: boolean) =>
  clsx('px-5 py-2 text-left align-middle text-body-dense whitespace-nowrap', expanded && 'w-full')

/** 列の見出しのセル。Table.Header の行に置く。 */
const TableHeaderCell = ({ children, expanded = false, width }: TableCellProps) => (
  <th
    className={clsx(cellClassName(expanded), 'font-normal text-text-secondary')}
    scope="col"
    style={{ minWidth: width }}
  >
    {children}
  </th>
)

/** データのセル。Table.Body の行に置く。 */
const TableCell = ({ children, expanded = false, width }: TableCellProps) => (
  <td className={cellClassName(expanded)} style={{ minWidth: width }}>
    {children}
  </td>
)

Table.Header = TableHeader
Table.Body = TableBody
Table.Row = TableRow
Table.HeaderCell = TableHeaderCell
Table.Cell = TableCell
