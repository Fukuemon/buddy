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

/** 結果の表で、空の提供時間と、片側の無い行の無い側の読み上げに出す文字列。 */
export const NO_DATA = 'データなし'

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
 * 照合の担当が確認する行かを返す。不整合、予定のみ、実績のみの行と、注意のある整合の行が当たる。
 * 結果の画面の「確認が要る行」の表示は、この行だけを出す。
 */
export const needsCheck = (row: ReceiptRow) =>
  row.category !== 'match' || rowFindings(row).some(({ severity }) => severity !== undefined)

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
  if (field !== 'duration') return side[field]
  return side.duration === null ? NO_DATA : String(side.duration)
}

/** 結果の CSV の列。区分を先頭に、確認することを最後に置く。結果の表の列は RESULT_TABLE_COLUMNS である。 */
export const RECEIPT_COLUMNS = [
  '区分',
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
  '確認すること',
] as const

const SEVERITY_PREFIX: Record<Severity, string> = { mismatch: '不一致: ', note: '注意: ' }

const sideCsvCells = (side: Side | null) =>
  side === null
    ? ['', '', '', '']
    : [side.service, side.start, side.end, side.duration === null ? '' : String(side.duration)]

/**
 * 照合の結果の 1 行を、CSV のセルの文字列にする。並びは RECEIPT_COLUMNS である。
 *
 * 値に印を混ぜない。片側の無い行の無い側のセルと、空の提供時間は空にする。
 * 確認することは、rowFindings の文に重さを「不一致: 」「注意: 」と前に付け、「 / 」でつなぐ。
 */
export const reportRowCells = (row: ReceiptRow): string[] => {
  const label = RECEIPT_CATEGORIES.find(({ category }) => category === row.category)?.label ?? ''
  const findings = rowFindings(row)
    .map(({ text, severity }) => (severity === undefined ? text : SEVERITY_PREFIX[severity] + text))
    .join(' / ')
  return [
    label,
    row.date,
    row.client,
    row.staff,
    ...sideCsvCells(row.schedule),
    ...sideCsvCells(row.visit),
    row.visit === null ? '' : (row.visit.additions ?? ''),
    findings,
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
 * 1 行に 1 つの対を、照合の API の rows の順のまま書く。区切りの行は置かない。
 */
export const toReceiptCsv = (report: ReceiptReport) => {
  const lines = [
    RECEIPT_COLUMNS.join(','),
    ...report.rows.map((row) => reportRowCells(row).map(csvCell).join(',')),
  ]
  return `${BOM}${lines.join('\r\n')}\r\n`
}
