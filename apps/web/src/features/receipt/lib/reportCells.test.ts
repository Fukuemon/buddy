import { describe, expect, it } from 'vite-plus/test'

import { fakeReceiptReport } from '#/api/fake/fakeReceiptApi'

import { reportRowCells, toReceiptCsv } from './reportCells'

// 期待値は apps/receipt-api/tools/parity/report の TestWrite と同じ記号の付け方である
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

describe('toReceiptCsv', () => {
  it('BOM、見出し、区分の区切りの行、CRLF で書く', () => {
    const csv = toReceiptCsv(fakeReceiptReport)
    expect(csv.startsWith('﻿訪問日,利用者名,主訪問者,')).toBe(true)
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

  it('カンマと引用符を含む値を引用符で囲む', () => {
    const row = { ...fakeReceiptReport.rows[1], client: '加藤, "春子"' }
    const csv = toReceiptCsv({ ...fakeReceiptReport, rows: [row] })
    expect(csv).toContain('"加藤, ""春子"""')
  })
})
