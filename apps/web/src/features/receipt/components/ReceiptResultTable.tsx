import { Table } from '@buddy/ui'
import { clsx } from 'clsx'
import { Fragment } from 'react'

import type { ReceiptRow } from '#/api/types'

import { RECEIPT_CATEGORIES, RECEIPT_COLUMNS, reportRowCells } from '../lib/reportCells'

export type ReceiptResultTableProps = {
  rows: readonly ReceiptRow[]
}

/** 照合の結果の表。区分ごとに見出しの行を置き、その下に区分の行を並べる。印の付いたセルは背景の色を変える。 */
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
      <Table.Body>
        {RECEIPT_CATEGORIES.map(({ category, label }) => {
          const inCategory = rows.filter((row) => row.category === category)
          return (
            <Fragment key={category}>
              <tr
                className="border-b border-border bg-surface-subtle"
                data-testid={`receipt-category-${category}`}
              >
                <th
                  className="sticky left-0 bg-surface-subtle px-5 py-2 text-left text-label"
                  colSpan={RECEIPT_COLUMNS.length}
                  scope="colgroup"
                >
                  {label}（{inCategory.length} 件）
                </th>
              </tr>
              {inCategory.map((row) => (
                <Table.Row
                  key={`${row.date}-${row.client}-${row.staff}-${row.schedule?.line ?? 0}-${row.visit?.line ?? 0}`}
                >
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
            </Fragment>
          )
        })}
      </Table.Body>
    </Table>
  </div>
)
