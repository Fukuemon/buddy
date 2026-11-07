import { Table } from '@buddy/ui'
import { clsx } from 'clsx'
import { useLayoutEffect, useRef } from 'react'

import type { ReceiptRow } from '#/api/types'

import {
  cellMarks,
  type MarkedCell,
  markedCellValue,
  NO_DATA,
  RECEIPT_CATEGORIES,
  RESULT_TABLE_COLUMNS,
  rowFindings,
} from '../lib/reportCells'
import { MARKS, MarkIcon } from './ReceiptMark'

export type ReceiptResultTableProps = {
  rows: readonly ReceiptRow[]
  /** true のとき、行の無い区分の見出しの行を出さない。「確認が要る行」の表示で使う。 */
  hidesEmptyCategories?: boolean
}

/** 「確認すること」の列。行の判定の文を、重さのアイコンと並べて 1 つずつ出す。 */
const FindingsCell = ({ row }: { row: ReceiptRow }) => (
  <Table.Cell width={256}>
    <ul className="flex flex-col gap-1 whitespace-normal" data-testid="receipt-findings">
      {rowFindings(row).map(({ text, severity }) => (
        <li className="flex items-start gap-1" key={text}>
          {severity !== undefined && <MarkIcon severity={severity} />}
          {text}
        </li>
      ))}
    </ul>
  </Table.Cell>
)

/**
 * 予定と実績の値と加算のセル。印のあるセルは、値の前に重さのアイコンを置いて面の色を変え、読み上げにだけ重さの名前を足す。
 * 許容範囲のあるセルは、値の下に範囲を出す。
 */
const MarkedValueCell = ({ row, cell }: { row: ReceiptRow; cell: MarkedCell }) => {
  const value = markedCellValue(row, cell)
  const mark = cellMarks(row)[cell]
  if (value === null) {
    return (
      <Table.Cell>
        <span className="sr-only">{NO_DATA}</span>
      </Table.Cell>
    )
  }
  if (mark === undefined) {
    return (
      <Table.Cell>
        <span className={clsx(value === NO_DATA && 'text-text-secondary')}>{value}</span>
      </Table.Cell>
    )
  }
  const { label, surface } = MARKS[mark.severity]
  return (
    <Table.Cell>
      <span
        className={clsx('inline-flex flex-col rounded-4 px-1', surface)}
        data-severity={mark.severity}
        data-testid="receipt-marked-cell"
      >
        <span className="inline-flex items-center gap-1">
          <MarkIcon severity={mark.severity} />
          {value}
          <span className="sr-only">（{label}）</span>
        </span>
        {mark.range !== undefined && (
          <span className="text-caption">
            範囲 {mark.range.min}〜{mark.range.max} 分
          </span>
        )}
      </span>
    </Table.Cell>
  )
}

/** 結果の 1 行。訪問日、利用者名、主訪問者、確認すること、予定と実績の値の順に並べる。 */
const ResultRow = ({ row }: { row: ReceiptRow }) => (
  <Table.Row>
    <Table.Cell>{row.date}</Table.Cell>
    <Table.Cell>{row.client}</Table.Cell>
    <Table.Cell>{row.staff}</Table.Cell>
    <FindingsCell row={row} />
    {RESULT_TABLE_COLUMNS.flatMap(({ label, cell }) =>
      cell === undefined ? [] : [<MarkedValueCell cell={cell} key={label} row={row} />],
    )}
  </Table.Row>
)

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
 * 照合の結果の表。区分ごとに tbody を分け、先頭に区分の見出しの行を置く。印の付いたセルは、重さのアイコンを置き、面の色を変える。
 * 横に送っても、どの行かを示す訪問日と利用者名の 2 列を左端に残す。
 */
export const ReceiptResultTable = ({
  rows,
  hidesEmptyCategories = false,
}: ReceiptResultTableProps) => {
  const ref = useFirstColumnWidth()
  return (
    <div
      className={clsx(
        // relative は、空のセルの sr-only（absolute）の位置の基準を箱にし、overflow-auto で切り取るためである。無いと sr-only がページを横に広げる
        'relative overflow-auto rounded-8 ring-1 ring-border',
        '[&_tr>:nth-child(2)]:sticky [&_tr>:nth-child(2)]:left-(--receipt-first-column-width) [&_tr>:nth-child(2)]:bg-surface',
        // 狭い幅では、長い利用者名で固定する 2 列が送る箱を覆わないよう、利用者名の列を 8rem にして折り返す。下限が無いと、表が縮んで 1 文字ずつ折り返す
        '[&_tr>:nth-child(2)]:max-w-32 [&_tr>:nth-child(2)]:min-w-32 [&_tr>:nth-child(2)]:whitespace-normal desktop:[&_tr>:nth-child(2)]:max-w-none desktop:[&_tr>:nth-child(2)]:min-w-0 desktop:[&_tr>:nth-child(2)]:whitespace-nowrap',
      )}
      data-testid="receipt-result-table"
      ref={ref}
    >
      <Table hasStickyColumn>
        <Table.Header>
          <Table.Row>
            {RESULT_TABLE_COLUMNS.map(({ label }) => (
              <Table.HeaderCell key={label}>{label}</Table.HeaderCell>
            ))}
          </Table.Row>
        </Table.Header>
        {RECEIPT_CATEGORIES.map(({ category, label }) => {
          const inCategory = rows
            .map((row, index) => ({ row, index }))
            .filter(({ row }) => row.category === category)
          if (hidesEmptyCategories && inCategory.length === 0) return null
          return (
            <tbody key={category}>
              <tr className="border-b border-border" data-testid={`receipt-category-${category}`}>
                {/* Table の hasStickyColumn が先頭のセルに当てる bg-surface より強くするため、! を付ける */}
                <th
                  className="!bg-surface-subtle px-5 py-2 text-left text-label"
                  colSpan={RESULT_TABLE_COLUMNS.length}
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
                <ResultRow key={index} row={row} />
              ))}
            </tbody>
          )
        })}
      </Table>
    </div>
  )
}
