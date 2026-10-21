import { describe, expect, it } from 'vite-plus/test'

import { isImportRangeReady, nextMonthRange, validateImportRange } from './importRange'

describe('nextMonthRange', () => {
  it('次の月の 1 日から月末にする', () => {
    expect(nextMonthRange(new Date(2026, 9, 22))).toEqual({
      range_start: '2026-11-01',
      range_end: '2026-11-30',
    })
    expect(nextMonthRange(new Date(2026, 11, 31))).toEqual({
      range_start: '2027-01-01',
      range_end: '2027-01-31',
    })
  })
})

describe('validateImportRange', () => {
  it('開始日が終了日より後なら、開始日に誤りを返す', () => {
    expect(validateImportRange('2026-12-01', '2026-11-30')).toEqual({
      start: '開始日は、終了日より前の日にしてください。',
    })
  })

  it('終了日が開始日の 1 年後の日より前なら、1 年までとする', () => {
    expect(validateImportRange('2026-11-01', '2027-10-31')).toEqual({})
    expect(validateImportRange('2026-11-01', '2027-11-01')).toEqual({
      end: '期間は 1 年までにしてください。',
    })
  })

  it('日付がそろわなければ下見できない', () => {
    expect(isImportRangeReady('', '2026-11-30')).toBe(false)
    expect(isImportRangeReady('2026-11-01', '2026-11-01')).toBe(true)
  })
})
