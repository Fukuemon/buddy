import { describe, expect, it } from 'vite-plus/test'

import {
  formatDate,
  formatDateKey,
  formatDateKeyRange,
  formatDateTime,
  formatFacilityDate,
  formatTime,
  formatTimeRange,
} from './dateFormat'

describe('formatDateKey', () => {
  it('年、月、日と曜日を出し、月と日を 0 で埋めない', () => {
    expect(formatDateKey('2026-11-09')).toBe('2026年11月9日（月）')
    expect(formatDateKey('2027-04-01')).toBe('2027年4月1日（木）')
  })

  it('withYear が false なら年を省く', () => {
    expect(formatDateKey('2026-11-09', { withYear: false })).toBe('11月9日（月）')
  })
})

describe('formatDate と formatDateTime と formatTime', () => {
  const date = new Date(2026, 9, 20, 9, 5)

  it('デバイスの時間帯の日付と、2 桁の時と分を出す', () => {
    expect(formatDate(date)).toBe('2026年10月20日（火）')
    expect(formatDate(date, { withYear: false })).toBe('10月20日（火）')
    expect(formatTime(date)).toBe('09:05')
    expect(formatDateTime(date)).toBe('2026年10月20日（火） 09:05')
  })
})

describe('formatFacilityDate', () => {
  it('UTC の日時を、Asia/Tokyo の日付で出す', () => {
    expect(formatFacilityDate('2026-09-30T15:30:00Z')).toBe('2026年10月1日（木）')
    expect(formatFacilityDate('2026-09-30T14:59:00Z')).toBe('2026年9月30日（水）')
  })
})

describe('formatTimeRange', () => {
  it('開始と終了を「〜」でつなぎ、秒を落とす', () => {
    expect(formatTimeRange('09:00', '09:29')).toBe('09:00〜09:29')
    expect(formatTimeRange('09:00:00', '09:29:00')).toBe('09:00〜09:29')
  })

  it('翌日に終わる範囲は終了に「翌」を、前の日に始まる範囲は開始に「前日」を付ける', () => {
    expect(formatTimeRange('22:00', '01:00', 'nextDay')).toBe('22:00〜翌 01:00')
    expect(formatTimeRange('22:00', '01:00', 'previousDay')).toBe('前日 22:00〜01:00')
  })
})

describe('formatDateKeyRange', () => {
  it('両側を日付の形にし、終わりの無い期間は終わりの側を空ける', () => {
    expect(formatDateKeyRange('2026-11-01', '2026-11-30')).toBe(
      '2026年11月1日（日）〜2026年11月30日（月）',
    )
    expect(formatDateKeyRange('2026-11-01', null)).toBe('2026年11月1日（日）〜')
  })
})
