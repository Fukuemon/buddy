import { describe, expect, it } from 'vite-plus/test'

import { mockReceiptReport } from '#/mocks/receiptData'
import type { ReceiptRow } from '#/api/types'

import {
  cellMarks,
  markedCellValue,
  RESULT_TABLE_COLUMNS,
  reportRowCells,
  rowFindings,
  toReceiptCsv,
} from './reportCells'

// 期待値は services/receipt/tools/parity/report の TestWrite と同じ記号の付け方である
const expected = [
  '2024-04-01,加藤 春子,青木 一郎,訪看I２,10:00 ❌,10:29,29 ❌,訪看I２,10:05 ❌,10:40 ❌ (20~29),35 ❌ ❌ (20~29),緊急 ※',
  '2024-04-01,木村 夏夫,石川 二葉,訪看I２,09:00,09:29,29,データなし,データなし,データなし,データなし,データなし',
  '2024-04-02,加藤 春子,上田 三奈,データなし,データなし,データなし,データなし,訪看I２,09:00,09:29,データなし,通常',
  '2024-04-03,木村 夏夫,江藤 四郎,医,13:00,14:00 ※,60 ※ (30~90),基本療養費(I),13:00,13:50 ※,50 ※ (30~90),通常',
]

describe('reportRowCells', () => {
  it('区分ごとの記号を照合の API の元の CSV と同じに付ける', () => {
    expect(mockReceiptReport.rows.map((row) => reportRowCells(row).join(','))).toEqual(expected)
  })
})

describe('toReceiptCsv', () => {
  it('BOM、見出し、区分の区切りの行、CRLF で書く', () => {
    const csv = toReceiptCsv(mockReceiptReport)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.slice(1).startsWith('訪問日,利用者名,主訪問者,')).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    const sep = (label: string) => label + ',---'.repeat(11)
    expect(lines.slice(1)).toEqual([
      sep('不整合データ'),
      expected[0],
      sep('予定のみ'),
      expected[1],
      sep('実績のみ'),
      expected[2],
      sep('整合データ'),
      expected[3],
      '',
    ])
  })

  it('Go の encoding/csv と同じく、区切り、引用符、改行を含む値と空白で始まる値を引用する', () => {
    const [mismatch, scheduleOnly] = mockReceiptReport.rows
    const rows = [
      { ...scheduleOnly, client: '加藤, "春子"' },
      { ...scheduleOnly, client: '改行\nあり' },
      { ...mismatch, visit: { ...mismatch.visit!, additions: '' } },
    ]
    const csv = toReceiptCsv({ ...mockReceiptReport, rows })
    expect(csv).toContain('"加藤, ""春子"""')
    expect(csv).toContain('"改行\nあり"')
    expect(csv).toContain('," ※"\r\n')
  })
})

describe('reportRowCells のフェイクの結果に無い入力', () => {
  const mismatch = mockReceiptReport.rows[0]
  const checks = mismatch.checks!

  it('範囲を持たないサービス内容は ❌ だけを付ける', () => {
    const row = {
      ...mismatch,
      checks: { ...checks, visit_duration: { ok: false, minutes: 35, range: null } },
    }
    expect(reportRowCells(row)[10]).toBe('35 ❌ ❌')
  })

  it('両側の提供時間が空なら、データなしに印を付ける', () => {
    const range = { min: 20, max: 29 }
    const row = {
      ...mismatch,
      schedule: { ...mismatch.schedule!, duration: null },
      visit: { ...mismatch.visit!, duration: null },
      checks: {
        ...checks,
        schedule_duration: { ok: false, minutes: null, range },
        visit_duration: { ok: false, minutes: null, range },
      },
    }
    const cells = reportRowCells(row)
    expect([cells[6], cells[10]]).toEqual(['データなし ❌ ❌ (20~29)', 'データなし ❌ ❌ (20~29)'])
  })

  it('加算が空の不整合の行は、印だけにする', () => {
    const row = { ...mismatch, visit: { ...mismatch.visit!, additions: '' } }
    expect(reportRowCells(row)[11]).toBe(' ※')
  })
})

describe('rowFindings', () => {
  const [mismatch, scheduleOnly, visitOnly, match] = mockReceiptReport.rows
  const checks = mismatch.checks!
  const texts = (row: ReceiptRow) =>
    rowFindings(row).map(({ text, severity }) => `${severity ?? '-'} ${text}`)

  it('不一致を項目の順に並べ、その後に注意を並べる', () => {
    expect(texts(mismatch)).toEqual([
      'mismatch 開始時間が予定と違う',
      'mismatch 実績の終了時間が範囲（20〜29 分）の外',
      'mismatch 実績の提供時間 35 分が範囲（20〜29 分）の外',
      'mismatch 加算が規則に合わない',
      'note 提供時間が予定と違う',
      'note 終了時間が予定と違う',
    ])
  })

  it('整合の行も、提供時間と終了時間の値の違いを注意にする', () => {
    expect(texts(match)).toEqual(['note 提供時間が予定と違う', 'note 終了時間が予定と違う'])
  })

  it('片側の無い行は、無い側を重さの無い文にする', () => {
    expect(texts(scheduleOnly)).toEqual(['- 実績が無い'])
    expect(texts(visitOnly)).toEqual(['- 予定が無い'])
  })

  it('サービス内容が対応しないときは、両側のサービス内容の不一致にする', () => {
    const row = { ...match, checks: { ...match.checks!, service: { ok: false } } }
    expect(rowFindings(row)[0]).toEqual({
      text: 'サービス内容が予定と違う',
      severity: 'mismatch',
      cells: ['schedule.service', 'visit.service'],
    })
  })

  it('範囲の無いサービス内容は、終了時間と提供時間で 1 つの文にし、両方のセルを持つ', () => {
    const noRange = { ok: false, minutes: 35, range: null }
    const row = {
      ...mismatch,
      checks: { ...checks, visit_elapsed: noRange, visit_duration: noRange },
    }
    const found = rowFindings(row).filter((f) => f.text === '実績のサービス内容に許容範囲が無い')
    expect(found).toEqual([
      {
        text: '実績のサービス内容に許容範囲が無い',
        severity: 'mismatch',
        cells: ['visit.end', 'visit.duration'],
      },
    ])
  })

  it('空の提供時間は、範囲の外と別の文にする', () => {
    const row = {
      ...mismatch,
      checks: {
        ...checks,
        schedule_duration: { ok: false, minutes: null, range: { min: 20, max: 29 } },
      },
    }
    expect(texts(row)).toContain('mismatch 予定の提供時間が空')
  })
})

describe('cellMarks', () => {
  const [mismatch, scheduleOnly, , match] = mockReceiptReport.rows

  it('不一致と注意の両方に当たるセルは不一致だけにし、範囲の外のセルに範囲を付ける', () => {
    const range = { min: 20, max: 29 }
    expect(cellMarks(mismatch)).toEqual({
      'schedule.start': { severity: 'mismatch' },
      'visit.start': { severity: 'mismatch' },
      'visit.end': { severity: 'mismatch', range },
      'visit.duration': { severity: 'mismatch', range },
      additions: { severity: 'mismatch' },
      'schedule.duration': { severity: 'note', range },
      'schedule.end': { severity: 'note' },
    })
  })

  it('注意の提供時間には範囲を付け、注意の終了時間には付けない', () => {
    const range = { min: 30, max: 90 }
    expect(cellMarks(match)).toEqual({
      'schedule.duration': { severity: 'note', range },
      'visit.duration': { severity: 'note', range },
      'schedule.end': { severity: 'note' },
      'visit.end': { severity: 'note' },
    })
  })

  it('片側の無い行は、印を付けない', () => {
    expect(cellMarks(scheduleOnly)).toEqual({})
  })
})

describe('markedCellValue', () => {
  const [mismatch, scheduleOnly, visitOnly] = mockReceiptReport.rows
  const missing = (row: ReceiptRow) =>
    RESULT_TABLE_COLUMNS.flatMap(({ label, cell }) =>
      cell !== undefined && markedCellValue(row, cell) === null ? [label] : [],
    )

  it('実績の無い行は、実績の側の列と加算の列を空にする', () => {
    expect(missing(scheduleOnly)).toEqual([
      'サービス内容_実績',
      '開始時間_実績',
      '終了時間_実績',
      '提供時間_実績',
      '加算',
    ])
  })

  it('予定の無い行は、予定の側の列だけを空にし、空の提供時間はデータなしにする', () => {
    expect(missing(visitOnly)).toEqual([
      'サービス内容_予定',
      '開始時間_予定',
      '終了時間_予定',
      '提供時間_予定',
    ])
    expect(markedCellValue(visitOnly, 'visit.duration')).toBe('データなし')
  })

  it('両側のある行は、値に印を混ぜない', () => {
    expect(missing(mismatch)).toEqual([])
    expect(markedCellValue(mismatch, 'visit.duration')).toBe('35')
    expect(markedCellValue(mismatch, 'additions')).toBe('緊急')
  })
})
