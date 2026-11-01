import { describe, expect, it } from 'vite-plus/test'

import {
  addMinutesToTimeKey,
  combineDateTime,
  diffMinutes,
  formatDateTimeRange,
  toDateKey,
} from './dateTime'

describe('dateTime', () => {
  it('日付と時刻を +09:00 の ISO 8601 にまとめる', () => {
    expect(combineDateTime('2026-10-20', '09:05')).toBe('2026-10-20T09:05:00+09:00')
  })

  it('時刻に分を足し、日をまたぐと 0 時に戻す', () => {
    expect(addMinutesToTimeKey('09:00', 29)).toBe('09:29')
    expect(addMinutesToTimeKey('23:50', 20)).toBe('00:10')
  })

  it('2 つの時刻の差を分で返す', () => {
    expect(diffMinutes('10:30', '11:29')).toBe(59)
  })

  it('Date を YYYY-MM-DD にする', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('開始と終了の日時を、年月日、曜日、時刻の範囲の文にする', () => {
    expect(formatDateTimeRange(new Date(2026, 9, 20, 9, 0), new Date(2026, 9, 20, 9, 29))).toBe(
      '2026年10月20日（火） 09:00〜09:29',
    )
  })

  it('終了が翌日なら、終了の時刻に「翌」を付ける', () => {
    expect(formatDateTimeRange(new Date(2026, 9, 20, 22, 0), new Date(2026, 9, 21, 1, 0))).toBe(
      '2026年10月20日（火） 22:00〜翌 01:00',
    )
    expect(formatDateTimeRange(new Date(2026, 9, 20, 22, 0), new Date(2026, 9, 21, 0, 0))).toBe(
      '2026年10月20日（火） 22:00〜翌 00:00',
    )
  })

  it('月と日は 0 で埋めず、時刻は 0 で埋め、日曜の曜日も出す', () => {
    expect(formatDateTimeRange(new Date(2026, 0, 4, 8, 5), new Date(2026, 0, 4, 8, 50))).toBe(
      '2026年1月4日（日） 08:05〜08:50',
    )
  })
})
