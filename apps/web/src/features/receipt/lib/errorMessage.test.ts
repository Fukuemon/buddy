import { describe, expect, it } from 'vite-plus/test'

import { ApiError } from '#/api/client'
import type { ReceiptCsvError, ReceiptWarning } from '#/api/types'

import { checkErrorMessage, csvErrorLines, warningReasonText } from './errorMessage'

describe('checkErrorMessage', () => {
  it('status ごとに職員が次にすることの分かる文にする', () => {
    expect(checkErrorMessage(new ApiError(400, 'ファイルのフィールド visits がない'))).toContain(
      '選び直して',
    )
    expect(checkErrorMessage(new ApiError(403, 'x'))).toBe(
      '照合の権限がありません。権限が要るときは、職員の管理の権限を持つ職員に頼んでください。',
    )
    expect(checkErrorMessage(new ApiError(413, 'x'))).toContain('10 MB')
    expect(checkErrorMessage(new ApiError(422, 'visits の CSV に列がない'))).toBe(
      '入力の CSV に誤りがあります。次のところを直して、もう一度照合してください。',
    )
    expect(checkErrorMessage(new ApiError(502, 'x'))).toContain(
      'Google カレンダーから予定を取れません',
    )
    expect(checkErrorMessage(new ApiError(502, 'x', [], 'permission_check_failed'))).toContain(
      '照合の権限を確認できませんでした',
    )
    expect(checkErrorMessage(new ApiError(503, 'x'))).toContain('予定の CSV で照合')
    expect(checkErrorMessage(new ApiError(500, 'x'))).toContain('時間をおいて')
    expect(checkErrorMessage(new TypeError('Failed to fetch'))).toContain('時間をおいて')
  })
})

describe('csvErrorLines', () => {
  const error = (e: Omit<ReceiptCsvError, 'message'>): ReceiptCsvError => ({
    ...e,
    message: 'API の文',
  })

  it('足りない列を、CSV ごとに 1 つの文にまとめて先に出す', () => {
    expect(
      csvErrorLines([
        error({ source: 'visits', reason: 'empty_value', line: 3, column: '利用者名' }),
        error({ source: 'visits', reason: 'missing_column', column: '提供時間' }),
        error({ source: 'visits', reason: 'missing_column', column: '加算①' }),
      ]),
    ).toEqual([
      '実績の CSV に「提供時間」「加算①」の列がありません。電子カルテから書き出し直してください。',
      '実績の CSV の 3 行目の「利用者名」が空です。',
    ])
  })

  it('文字コードを読めないときは、文字コードの名前を出さずに書き出し直しを案内する', () => {
    const [line] = csvErrorLines([error({ source: 'visits', reason: 'encoding' })])
    expect(line).toBe('実績の CSV の文字を読めません。電子カルテから書き出し直してください。')
    expect(line).not.toMatch(/UTF-8|CP932|Shift_JIS|バイト/)
  })

  it('CSV として読めない行は、ライブラリの英語の文を出さない', () => {
    const [line] = csvErrorLines([
      {
        source: 'schedules',
        reason: 'malformed_row',
        line: 2,
        message: 'extraneous or missing " in quoted-field',
      },
    ])
    expect(line).toBe('予定の CSV の 2 行目を読めません。値の中の「"」を確認してください。')
  })

  it.each([
    ['invalid_date', '訪問日', '実績の CSV の 4 行目の「訪問日」を日付として読めません。'],
    ['invalid_time', '開始時間', '実績の CSV の 4 行目の「開始時間」を時刻として読めません。'],
    [
      'invalid_duration',
      '提供時間',
      '実績の CSV の 4 行目の「提供時間」が分の数になっていません。',
    ],
  ] as const)('%s を、行と列の分かる文にする', (reason, column, want) => {
    expect(csvErrorLines([error({ source: 'visits', reason, line: 4, column })])).toEqual([want])
  })

  it('空の予定の CSV は、保存し直しを案内する', () => {
    expect(csvErrorLines([error({ source: 'schedules', reason: 'empty_file' })])).toEqual([
      '予定の CSV が空です。CSV として保存し直してください。',
    ])
  })
})

describe('warningReasonText', () => {
  const warning = (w: Pick<ReceiptWarning, 'reason' | 'column'>): ReceiptWarning => ({
    calendar_id: 'c',
    event_id: 'e',
    start: '2024-04-05T10:00:00+09:00',
    message: 'API の文',
    ...w,
  })

  it('理由のコードから文を作り、API の文を使わない', () => {
    expect(warningReasonText(warning({ reason: 'spans_days' }))).toBe(
      '2 日以上にわたるか、24 時間以上の予定です。',
    )
    expect(warningReasonText(warning({ reason: 'unreadable_time' }))).toBe(
      '開始か終了の日時を読めません。',
    )
    expect(warningReasonText(warning({ reason: 'empty_value', column: '主訪問者' }))).toBe(
      '「主訪問者」が空です。',
    )
  })
})
