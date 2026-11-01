import { describe, expect, it } from 'vite-plus/test'

import { fakeReceiptReport } from '#/api/fake/fakeReceiptApi'
import type { ReceiptRow } from '#/api/types'

import { isMissingSideCell, reportRowCells, toReceiptCsv } from './reportCells'

// 期待値は services/receipt/tools/parity/report の TestWrite と同じ記号の付け方である
const expected = [
  '2024-04-01,加藤 春子,青木 一郎,訪看I２,10:00 ❌,10:29,29 ❌,訪看I２,10:05 ❌,10:40 ❌ (20~29),35 ❌ ❌ (20~29),緊急 ※',
  '2024-04-01,木村 夏夫,石川 二葉,訪看I２,09:00,09:29,29,データなし,データなし,データなし,データなし,データなし',
  '2024-04-02,加藤 春子,上田 三奈,データなし,データなし,データなし,データなし,訪看I２,09:00,09:29,データなし,通常',
  '2024-04-03,木村 夏夫,江藤 四郎,医,13:00,14:00 ※,60 ※ (30~90),基本療養費(I),13:00,13:50 ※,50 ※ (30~90),通常',
]

describe('reportRowCells', () => {
  it('区分ごとの記号を照合の API の元の CSV と同じに付ける', () => {
    expect(fakeReceiptReport.rows.map((row) => reportRowCells(row).join(','))).toEqual(expected)
  })
})

describe('isMissingSideCell', () => {
  const missingColumns = (row: ReceiptRow) =>
    reportRowCells(row).flatMap((_, i) => (isMissingSideCell(row, i) ? [i] : []))

  it('実績の無い行は、実績の側の列と加算の列を返す', () => {
    expect(missingColumns(fakeReceiptReport.rows[1])).toEqual([7, 8, 9, 10, 11])
  })

  it('予定の無い行は、予定の側の列だけを返し、空の提供時間の列は返さない', () => {
    expect(missingColumns(fakeReceiptReport.rows[2])).toEqual([3, 4, 5, 6])
  })

  it('両側のある行は、何も返さない', () => {
    expect(missingColumns(fakeReceiptReport.rows[0])).toEqual([])
  })
})

describe('toReceiptCsv', () => {
  it('BOM、見出し、区分の区切りの行、CRLF で書く', () => {
    const csv = toReceiptCsv(fakeReceiptReport)
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
    const [mismatch, scheduleOnly] = fakeReceiptReport.rows
    const rows = [
      { ...scheduleOnly, client: '加藤, "春子"' },
      { ...scheduleOnly, client: '改行\nあり' },
      { ...mismatch, visit: { ...mismatch.visit!, additions: '' } },
    ]
    const csv = toReceiptCsv({ ...fakeReceiptReport, rows })
    expect(csv).toContain('"加藤, ""春子"""')
    expect(csv).toContain('"改行\nあり"')
    expect(csv).toContain('," ※"\r\n')
  })
})

describe('reportRowCells のフェイクの結果に無い入力', () => {
  const mismatch = fakeReceiptReport.rows[0]
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
