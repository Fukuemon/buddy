import { describe, expect, it } from 'vite-plus/test'

import type { AllDayEvent } from '#/api/types'
import { fakeStaffList } from '#/api/fake/fixtures'

import { allDayEventsOn, formatAllDayEventTitle, toCalendarAllDayEvents } from './allDayEvents'

const event = (overrides: Partial<AllDayEvent> = {}): AllDayEvent => ({
  id: 'allday-1',
  staffId: 'staff-1',
  staffName: '青木 一郎',
  startDate: '2026-10-19',
  endDate: '2026-10-21',
  title: '研修',
  ...overrides,
})

describe('formatAllDayEventTitle', () => {
  it('タイトルを返し、空白だけのタイトルは「（タイトルなし）」にする', () => {
    expect(formatAllDayEventTitle(event())).toBe('研修')
    expect(formatAllDayEventTitle(event({ title: ' 　' }))).toBe('（タイトルなし）')
  })
})

describe('toCalendarAllDayEvents', () => {
  it('職員の一覧に無い職員の予定を除き、職員の区別の色を付ける', () => {
    const got = toCalendarAllDayEvents(
      [event(), event({ id: 'allday-2', staffId: 'staff-unknown' })],
      fakeStaffList,
    )
    expect(got).toEqual([{ ...event(), color: 'var(--buddy-color-categorical-1)' }])
  })
})

describe('allDayEventsOn', () => {
  it('開始の日から最後の日までの日にだけ、予定を返す', () => {
    const events = [event()]
    expect(allDayEventsOn(events, '2026-10-18')).toEqual([])
    expect(allDayEventsOn(events, '2026-10-19')).toEqual(events)
    expect(allDayEventsOn(events, '2026-10-21')).toEqual(events)
    expect(allDayEventsOn(events, '2026-10-22')).toEqual([])
  })
})
