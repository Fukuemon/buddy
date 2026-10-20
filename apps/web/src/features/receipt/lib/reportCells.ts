import type { ReceiptCategory, ReceiptReport, ReceiptRow } from '#/api/types'

type RangeCheck = NonNullable<ReceiptRow['checks']>['visit_duration']
type Side = NonNullable<ReceiptRow['schedule']>

/** 照合の結果の区分の並びと見出し。照合の API の rows も、この順に並ぶ。 */
export const RECEIPT_CATEGORIES: { category: ReceiptCategory; label: string }[] = [
  { category: 'mismatch', label: '不整合データ' },
  { category: 'schedule_only', label: '予定のみ' },
  { category: 'visit_only', label: '実績のみ' },
  { category: 'match', label: '整合データ' },
]

/** 結果の表と CSV の列。 */
export const RECEIPT_COLUMNS = [
  '訪問日',
  '利用者名',
  '主訪問者',
  'サービス内容_予定',
  '開始時間_予定',
  '終了時間_予定',
  '提供時間_予定',
  'サービス内容_実績',
  '開始時間_実績',
  '終了時間_実績',
  '提供時間_実績',
  '加算',
] as const

const NO_DATA = 'データなし'
const NG = ' ❌'
const NOTE = ' ※'

type SideCells = { service: string; start: string; end: string; duration: string }

const empty = (): SideCells => ({
  service: NO_DATA,
  start: NO_DATA,
  end: NO_DATA,
  duration: NO_DATA,
})

const cellsOf = (side: Side): SideCells => ({
  service: side.service,
  start: side.start,
  end: side.end,
  duration: side.duration === null ? NO_DATA : String(side.duration),
})

const rangeText = (check: RangeCheck) =>
  check.range === null ? '' : ` (${check.range.min}~${check.range.max})`

const rangeMark = (check: RangeCheck) => (check.ok ? '' : NG + rangeText(check))

/**
 * 照合の結果の 1 行を、表と CSV のセルの文字列にする。並びは RECEIPT_COLUMNS である。
 *
 * 不整合の行は、食い違う項目に ` ❌` を、許容範囲を外れた終了時間と提供時間に ` ❌ (最小~最大)` を、
 * 加算が通常の 1 つでない行に ` ※` を付ける。整合の行は、両側の提供時間か終了時間が違うときに ` ※` を付ける。
 * 片側しか無い行の、無い側のセルは「データなし」にする。
 */
export const reportRowCells = (row: ReceiptRow): string[] => {
  const s = row.schedule === null ? empty() : cellsOf(row.schedule)
  const v = row.visit === null ? empty() : cellsOf(row.visit)
  let addition = row.visit === null ? NO_DATA : (row.visit.additions ?? '')
  const c = row.checks
  if (c !== null) {
    const both = (ok: boolean, key: keyof SideCells, mark: string) => {
      if (ok) return
      s[key] += mark
      v[key] += mark
    }
    if (row.category === 'mismatch') {
      both(c.start.ok, 'start', NG)
      both(c.duration_equal, 'duration', NG)
      both(c.service.ok, 'service', NG)
      s.end += rangeMark(c.schedule_elapsed)
      v.end += rangeMark(c.visit_elapsed)
      s.duration += rangeMark(c.schedule_duration)
      v.duration += rangeMark(c.visit_duration)
      if (!c.additions.ok) addition += NOTE
    } else if (row.category === 'match') {
      if (!c.duration_equal) {
        s.duration += NOTE + rangeText(c.schedule_duration)
        v.duration += NOTE + rangeText(c.visit_duration)
      }
      both(c.end_equal, 'end', NOTE)
    }
  }
  return [
    row.date,
    row.client,
    row.staff,
    s.service,
    s.start,
    s.end,
    s.duration,
    v.service,
    v.start,
    v.end,
    v.duration,
    addition,
  ]
}

/** Excel が UTF-8 と読むための BOM。整形の道具が見えない文字に置き換えないよう、符号で書く。 */
const BOM = String.fromCharCode(0xfeff)

/** Go の encoding/csv と同じ条件で引用する。区切り、引用符、改行を含む値と、空白で始まる値である。 */
const csvCell = (value: string) =>
  /[",\r\n]/.test(value) || /^[ \t]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value

/**
 * 照合の結果を CSV の文字列にする。先頭に BOM を付け、行は CRLF で区切る。
 *
 * 区分ごとに、区分の名前と `---` の区切りの行を置き、その後に区分の行を並べる。行の無い区分も区切りの行を置く。
 */
export const toReceiptCsv = (report: ReceiptReport) => {
  const lines = [RECEIPT_COLUMNS.join(',')]
  for (const { category, label } of RECEIPT_CATEGORIES) {
    lines.push([label, ...Array(RECEIPT_COLUMNS.length - 1).fill('---')].join(','))
    for (const row of report.rows.filter((r) => r.category === category)) {
      lines.push(reportRowCells(row).map(csvCell).join(','))
    }
  }
  return `${BOM}${lines.join('\r\n')}\r\n`
}
