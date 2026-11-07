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

/** 結果の CSV の列。結果の表の列は RESULT_TABLE_COLUMNS である。 */
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

export const NO_DATA = 'データなし'
const MISMATCH_MARK = ' ❌'
const NOTE_MARK = ' ※'

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

const rangeMark = (check: RangeCheck) => (check.ok ? '' : MISMATCH_MARK + rangeText(check))

/**
 * 照合の結果の 1 行を、CSV のセルの文字列にする。並びは RECEIPT_COLUMNS である。
 *
 * 不整合の行は、食い違う項目に ` ❌` を、許容範囲を外れた終了時間と提供時間に ` ❌ (最小~最大)` を、
 * 加算が通常の 1 つでない行に ` ※` を付ける。整合の行は、両側の提供時間か終了時間が違うときに ` ※` を付ける。
 * 片側しか無い行の、無い側のセルは「データなし」にする。
 */
export const reportRowCells = (row: ReceiptRow): string[] => {
  const schedule = row.schedule === null ? empty() : cellsOf(row.schedule)
  const visit = row.visit === null ? empty() : cellsOf(row.visit)
  let addition = row.visit === null ? NO_DATA : (row.visit.additions ?? '')
  const checks = row.checks
  if (checks !== null) {
    const markBoth = (ok: boolean, key: keyof SideCells, mark: string) => {
      if (ok) return
      schedule[key] += mark
      visit[key] += mark
    }
    if (row.category === 'mismatch') {
      markBoth(checks.start.ok, 'start', MISMATCH_MARK)
      markBoth(checks.duration_equal, 'duration', MISMATCH_MARK)
      markBoth(checks.service.ok, 'service', MISMATCH_MARK)
      schedule.end += rangeMark(checks.schedule_elapsed)
      visit.end += rangeMark(checks.visit_elapsed)
      schedule.duration += rangeMark(checks.schedule_duration)
      visit.duration += rangeMark(checks.visit_duration)
      if (!checks.additions.ok) addition += NOTE_MARK
    } else if (row.category === 'match') {
      if (!checks.duration_equal) {
        schedule.duration += NOTE_MARK + rangeText(checks.schedule_duration)
        visit.duration += NOTE_MARK + rangeText(checks.visit_duration)
      }
      markBoth(checks.end_equal, 'end', NOTE_MARK)
    }
  }
  return [
    row.date,
    row.client,
    row.staff,
    schedule.service,
    schedule.start,
    schedule.end,
    schedule.duration,
    visit.service,
    visit.start,
    visit.end,
    visit.duration,
    addition,
  ]
}

/**
 * 判定の重さ。mismatch（不一致）は区分を不整合にした項目、note（注意）は区分を決めないが予定と実績の値が違う項目である。
 */
export type Severity = 'mismatch' | 'note'

type SideName = 'schedule' | 'visit'
type SideField = 'service' | 'start' | 'end' | 'duration'

/** 印を付けるセル。予定と実績の側の 4 つの値と、加算である。 */
export type MarkedCell = `${SideName}.${SideField}` | 'additions'

/** 行の 1 つの判定。severity の無い判定は、片側の無い行の「実績が無い」「予定が無い」である。 */
export type Finding = { text: string; severity?: Severity; cells: MarkedCell[] }

/** 1 つのセルの印。不一致と注意の両方に当たるセルも、重さは 1 つにする。 */
export type CellMark = {
  severity: Severity
  /** 値の下に出す許容範囲。範囲の外の終了時間と提供時間と、注意の提供時間に付ける。 */
  range?: { min: number; max: number }
}

const SIDE_LABEL: Record<SideName, string> = { schedule: '予定', visit: '実績' }

const rangeLabel = (range: { min: number; max: number }) => `範囲（${range.min}〜${range.max} 分）`

/** 片側の許容範囲の判定から、不一致の判定を作る。範囲の無いサービス内容と、空の提供時間は、範囲の外と別の文にする。 */
const rangeFindings = (side: SideName, field: 'end' | 'duration', check: RangeCheck): Finding[] => {
  if (check.ok) return []
  const cells: MarkedCell[] = [`${side}.${field}`]
  const label = SIDE_LABEL[side]
  if (check.range === null) {
    return [{ text: `${label}のサービス内容に許容範囲が無い`, severity: 'mismatch', cells }]
  }
  if (check.minutes === null) {
    return [{ text: `${label}の提供時間が空`, severity: 'mismatch', cells }]
  }
  const text =
    field === 'end'
      ? `${label}の終了時間が${rangeLabel(check.range)}の外`
      : `${label}の提供時間 ${check.minutes} 分が${rangeLabel(check.range)}の外`
  return [{ text, severity: 'mismatch', cells }]
}

/**
 * 照合の結果の 1 行の判定を、表の「確認すること」の列に並べる順に返す。
 *
 * 不一致は、開始時間、サービス内容、終了時間と提供時間の許容範囲、加算の順に並べ、その後に注意を並べる。
 * 注意（提供時間と終了時間の値の違い）は、行の区分によらず付ける。
 * 同じ文は 1 つにする。範囲の無いサービス内容は、終了時間と提供時間の両方で同じ文になるためである。
 */
export const rowFindings = (row: ReceiptRow): Finding[] => {
  if (row.visit === null) return [{ text: '実績が無い', cells: [] }]
  if (row.schedule === null) return [{ text: '予定が無い', cells: [] }]
  const checks = row.checks
  if (checks === null) return []
  const both = (field: SideField): MarkedCell[] => [`schedule.${field}`, `visit.${field}`]
  const findings: Finding[] = [
    ...(checks.start.ok
      ? []
      : [{ text: '開始時間が予定と違う', severity: 'mismatch' as const, cells: both('start') }]),
    ...(checks.service.ok
      ? []
      : [
          {
            text: 'サービス内容が予定と違う',
            severity: 'mismatch' as const,
            cells: both('service'),
          },
        ]),
    ...rangeFindings('schedule', 'end', checks.schedule_elapsed),
    ...rangeFindings('visit', 'end', checks.visit_elapsed),
    ...rangeFindings('schedule', 'duration', checks.schedule_duration),
    ...rangeFindings('visit', 'duration', checks.visit_duration),
    ...(checks.additions.ok
      ? []
      : [
          {
            text: '加算が規則に合わない',
            severity: 'mismatch' as const,
            cells: ['additions' as const],
          },
        ]),
    ...(checks.duration_equal
      ? []
      : [{ text: '提供時間が予定と違う', severity: 'note' as const, cells: both('duration') }]),
    ...(checks.end_equal
      ? []
      : [{ text: '終了時間が予定と違う', severity: 'note' as const, cells: both('end') }]),
  ]
  const seen = new Map<string, Finding>()
  for (const finding of findings) {
    const known = seen.get(finding.text)
    if (known === undefined) seen.set(finding.text, finding)
    else known.cells = [...known.cells, ...finding.cells]
  }
  return [...seen.values()]
}

/**
 * セルごとの印を返す。不一致と注意の両方に当たるセルは、重い不一致だけにする。
 * 許容範囲は、範囲の外の終了時間と提供時間と、注意の提供時間のセルに付ける。
 */
export const cellMarks = (row: ReceiptRow): Partial<Record<MarkedCell, CellMark>> => {
  const marks: Partial<Record<MarkedCell, CellMark>> = {}
  for (const { severity, cells } of rowFindings(row)) {
    if (severity === undefined) continue
    for (const cell of cells) {
      if (marks[cell]?.severity === 'mismatch') continue
      marks[cell] = { severity }
    }
  }
  const checks = row.checks
  if (checks === null) return marks
  const ranges: [MarkedCell, RangeCheck][] = [
    ['schedule.end', checks.schedule_elapsed],
    ['visit.end', checks.visit_elapsed],
    ['schedule.duration', checks.schedule_duration],
    ['visit.duration', checks.visit_duration],
  ]
  for (const [cell, check] of ranges) {
    const mark = marks[cell]
    if (mark === undefined || check.range === null) continue
    const isDuration = cell.endsWith('.duration')
    if (!check.ok || (isDuration && mark.severity === 'note')) mark.range = check.range
  }
  return marks
}

/** 結果の表の列。訪問日、利用者名、主訪問者の後ろに「確認すること」を置き、その後に予定と実績の値を並べる。 */
export const RESULT_TABLE_COLUMNS: {
  label: string
  cell?: MarkedCell
}[] = [
  { label: '訪問日' },
  { label: '利用者名' },
  { label: '主訪問者' },
  { label: '確認すること' },
  { label: 'サービス内容_予定', cell: 'schedule.service' },
  { label: '開始時間_予定', cell: 'schedule.start' },
  { label: '終了時間_予定', cell: 'schedule.end' },
  { label: '提供時間_予定', cell: 'schedule.duration' },
  { label: 'サービス内容_実績', cell: 'visit.service' },
  { label: '開始時間_実績', cell: 'visit.start' },
  { label: '終了時間_実績', cell: 'visit.end' },
  { label: '提供時間_実績', cell: 'visit.duration' },
  { label: '加算', cell: 'additions' },
]

/**
 * 結果の表の、印を付けるセルの値。片側の無い行の、無い側のセルは null を返す。
 * 表はそのセルを空にし、読み上げにだけ「データなし」を残す。行の区分の見出しが片側の無いことを示すので、セルで繰り返さないためである。
 */
export const markedCellValue = (row: ReceiptRow, cell: MarkedCell): string | null => {
  if (cell === 'additions') return row.visit === null ? null : (row.visit.additions ?? '')
  const [sideName, field] = cell.split('.') as [SideName, SideField]
  const side = row[sideName]
  if (side === null) return null
  return cellsOf(side)[field]
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
