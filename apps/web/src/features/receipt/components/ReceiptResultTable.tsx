import { Table } from '@buddy/ui'
import { clsx } from 'clsx'

import type { ReceiptRow } from '#/api/types'

import { RECEIPT_CATEGORIES, RECEIPT_COLUMNS, reportRowCells } from '../lib/reportCells'

export type ReceiptResultTableProps = {
  rows: readonly ReceiptRow[]
}

/** 照合の結果の表。区分ごとに tbody を分け、先頭に区分の見出しの行を置く。印の付いたセルは背景の色を変える。 */
export const ReceiptResultTable = ({ rows }: ReceiptResultTableProps) => (
  <div className="overflow-auto rounded-8 ring-1 ring-border" data-testid="receipt-result-table">
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
