import { describe, expect, it } from 'vite-plus/test'

import { formatCalendarTitle, getCalendarRange, shiftCalendarDate } from './calendarRange'

describe('shiftCalendarDate', () => {
  it.each([
    ['day', 1, '2026-10-21'],
    ['week', -1, '2026-10-13'],
    ['month', 1, '2026-11-01'],
  ] as const)('%s の表示で %i 動かす', (view, direction, expected) => {
    expect(shiftCalendarDate(view, '2026-10-20', direction)).toBe(expected)
  })
})

describe('getCalendarRange', () => {
  it('週は日曜から 7 日間を返す', () => {
    expect(getCalendarRange('week', '2026-10-20')).toEqual({
      from: '2026-10-18T00:00:00+09:00',
      to: '2026-10-25T00:00:00+09:00',
    })
  })

  it('月は初日を含む週の日曜から 6 週間を返す', () => {
    expect(getCalendarRange('month', '2026-10-20')).toEqual({
      from: '2026-09-27T00:00:00+09:00',
      to: '2026-11-08T00:00:00+09:00',
    })
  })
})

describe('formatCalendarTitle', () => {
  it.each([
    ['month', '2026-10-20', '2026年10月'],
    ['day', '2026-10-20', '2026年10月20日（火）'],
    ['week', '2026-10-20', '2026年10月18日〜24日'],
    ['week', '2026-10-18', '2026年10月18日〜24日'],
    ['week', '2026-10-24', '2026年10月18日〜24日'],
    ['week', '2026-11-02', '2026年11月1日〜7日'],
    ['week', '2026-09-30', '2026年9月27日〜10月3日'],
    ['week', '2026-12-31', '2026年12月27日〜2027年1月2日'],
  ] as const)('%s の表示で %s を含む期間を %s にする', (view, dateKey, expected) => {
    expect(formatCalendarTitle(view, dateKey)).toBe(expected)
  })
})
