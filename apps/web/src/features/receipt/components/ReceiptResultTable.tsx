import { Table } from '@buddy/ui'
import { clsx } from 'clsx'
import { useLayoutEffect, useRef } from 'react'

import type { ReceiptRow } from '#/api/types'

import { RECEIPT_CATEGORIES, RECEIPT_COLUMNS, reportRowCells } from '../lib/reportCells'

export type ReceiptResultTableProps = {
  rows: readonly ReceiptRow[]
}

/** 先頭の列（訪問日）の幅を入れる CSS の変数。2 列目（利用者名）を、この幅だけ左端から離して固定する。 */
const FIRST_COLUMN_WIDTH = '--receipt-first-column-width'

/**
 * 2 列目を固定する位置を、先頭の列の今の幅に合わせ続ける。
 * 列の幅は中身と画面の幅で決まるので、幅を固定せずに測る。PC の幅で横に送らないときの列の幅を変えないためである。
 */
const useFirstColumnWidth = () => {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const box = ref.current
    const firstCell = box?.querySelector('thead th')
    if (box === null || firstCell === null || firstCell === undefined) return
    const update = () => {
      box.style.setProperty(FIRST_COLUMN_WIDTH, `${firstCell.getBoundingClientRect().width}px`)
    }
    update()
    // jsdom は ResizeObserver を持たない。最初に測った幅のまま使う
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(firstCell)
    return () => observer.disconnect()
  }, [])
  return ref
}

/**
 * 照合の結果の表。区分ごとに tbody を分け、先頭に区分の見出しの行を置く。印の付いたセルは背景の色を変える。
 * 横に送っても、どの行かを示す訪問日と利用者名の 2 列を左端に残す。
 */
export const ReceiptResultTable = ({ rows }: ReceiptResultTableProps) => {
  const ref = useFirstColumnWidth()
  return (
    <div
      className={clsx(
        'overflow-auto rounded-8 ring-1 ring-border',
        '[&_tr>:nth-child(2)]:sticky [&_tr>:nth-child(2)]:left-(--receipt-first-column-width) [&_tr>:nth-child(2)]:bg-surface',
        // 狭い幅では、長い利用者名で固定する 2 列が送る箱を覆わないよう、利用者名の列を 8rem にして折り返す。下限が無いと、表が縮んで 1 文字ずつ折り返す
        '[&_tr>:nth-child(2)]:max-w-32 [&_tr>:nth-child(2)]:min-w-32 [&_tr>:nth-child(2)]:whitespace-normal desktop:[&_tr>:nth-child(2)]:max-w-none desktop:[&_tr>:nth-child(2)]:min-w-0 desktop:[&_tr>:nth-child(2)]:whitespace-nowrap',
      )}
      data-testid="receipt-result-table"
      ref={ref}
    >
      <Table stickyColumn>
        <Table.Header>
          <Table.Row>
            {RECEIPT_COLUMNS.map((column) => (
              <Table.HeaderCell key={column}>{column}</Table.HeaderCell>
            ))}
          </Table.Row>
        </Table.Header>
        {RECEIPT_CATEGORIES.map(({ category, label }) => {
          const inCategory = rows
            .map((row, index) => ({ row, index }))
            .filter(({ row }) => row.category === category)
          return (
            <tbody key={category}>
              <tr className="border-b border-border" data-testid={`receipt-category-${category}`}>
                {/* Table の stickyColumn が先頭のセルに当てる bg-surface より強くするため、! を付ける */}
                <th
                  className="!bg-surface-subtle px-5 py-2 text-left text-label"
                  colSpan={RECEIPT_COLUMNS.length}
                  scope="rowgroup"
                >
                  {/* セルは全ての列にまたがり左端に留まらないので、文字だけを送る箱の左端に留める */}
                  <span
                    className="sticky left-5 inline-block"
                    data-testid={`receipt-category-label-${category}`}
                  >
                    {label}（{inCategory.length} 件）
                  </span>
                </th>
              </tr>
              {inCategory.map(({ row, index }) => (
                <Table.Row key={index}>
                  {reportRowCells(row).map((cell, i) => (
                    <Table.Cell key={RECEIPT_COLUMNS[i]}>
                      <span
                        className={clsx(
                          'rounded-4 px-1',
                          cell.includes('❌') && 'bg-danger-surface',
                          !cell.includes('❌') && cell.includes('※') && 'bg-warning-surface',
                          cell === 'データなし' && 'text-text-secondary',
                        )}
                      >
                        {cell}
                      </span>
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
            </tbody>
          )
        })}
      </Table>
    </div>
  )
}
