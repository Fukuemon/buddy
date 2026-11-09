import { describe, expect, it } from 'vite-plus/test'

import type { ScheduleCalendarEvent } from './toCalendarEvents'
import { groupWeekAgenda } from './weekAgenda'

const event = (id: string, staffId: string, start: string, end: string): ScheduleCalendarEvent => ({
  id,
  title: id,
  staffId,
  start,
  end,
  color: 'red',
  isCancelled: false,
  needsReview: false,
})

const ids = (days: ReturnType<typeof groupWeekAgenda>, dateKey: string) =>
  days.find((day) => day.dateKey === dateKey)?.items.map((item) => item.event.id)

describe('groupWeekAgenda', () => {
  it('日曜から 7 日分を返し、予定の無い日も空で返す', () => {
    const days = groupWeekAgenda('2026-10-21', [], [])
    expect(days.map((day) => day.dateKey)).toEqual([
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
    ])
    expect(days.every((day) => day.items.length === 0)).toBe(true)
  })

  it('同じ日の予定を開始の時刻の順に、同じ時刻なら職員の順に並べる', () => {
    const days = groupWeekAgenda(
      '2026-10-21',
      [
        event('late', 'a', '2026-10-21T13:00:00+09:00', '2026-10-21T14:00:00+09:00'),
        event('b-early', 'b', '2026-10-21T09:00:00+09:00', '2026-10-21T10:00:00+09:00'),
        event('a-early', 'a', '2026-10-21T09:00:00+09:00', '2026-10-21T10:00:00+09:00'),
      ],
      ['a', 'b'],
    )
    expect(ids(days, '2026-10-21')).toEqual(['a-early', 'b-early', 'late'])
  })

  it('翌日に終わる予定は開始の日の下にだけ置く', () => {
    const days = groupWeekAgenda(
      '2026-10-21',
      [event('night', 'a', '2026-10-21T22:00:00+09:00', '2026-10-22T01:00:00+09:00')],
      ['a'],
    )
    expect(ids(days, '2026-10-21')).toEqual(['night'])
    expect(ids(days, '2026-10-22')).toEqual([])
  })

  it('前の週の土曜に始まり日曜に終わる予定は、日曜の下の最初に置く', () => {
    const days = groupWeekAgenda(
      '2026-10-21',
      [
        event('sunday', 'a', '2026-10-18T00:30:00+09:00', '2026-10-18T01:00:00+09:00'),
        event('carried', 'a', '2026-10-17T22:00:00+09:00', '2026-10-18T01:00:00+09:00'),
      ],
      ['a'],
    )
    expect(days[0]?.items).toEqual([
      expect.objectContaining({
        startsBeforeWeek: true,
        event: expect.objectContaining({ id: 'carried' }),
      }),
      expect.objectContaining({
        startsBeforeWeek: false,
        event: expect.objectContaining({ id: 'sunday' }),
      }),
    ])
  })
})
