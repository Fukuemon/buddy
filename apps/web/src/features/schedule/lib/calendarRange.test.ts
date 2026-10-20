import { describe, expect, it } from 'vite-plus/test'

import { getCalendarRange, shiftCalendarDate } from './calendarRange'

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
