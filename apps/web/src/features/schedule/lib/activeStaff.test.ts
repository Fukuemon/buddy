import { describe, expect, it } from 'vite-plus/test'

import type { Schedule, Staff } from '#/api/types'

import { activeStaff, excludeSuspendedStaffSchedules } from './activeStaff'

const staff = (id: string, suspendedAt?: string): Staff => ({
  id,
  name: id,
  teamId: 'team-a',
  email: `${id}@example.com`,
  ...(suspendedAt === undefined ? {} : { suspendedAt }),
})

const schedule = (id: string, staffId: string): Schedule => ({
  id,
  facilityId: 'facility-1',
  kind: 'normal',
  title: id,
  staffId,
  startsAt: '2026-10-20T09:00:00+09:00',
  endsAt: '2026-10-20T10:00:00+09:00',
  description: '',
})

describe('activeStaff', () => {
  it('止めた職員を除き、残りの職員の並びを変えない', () => {
    const list = [staff('staff-1'), staff('staff-2', '2026-10-01T09:00:00Z'), staff('staff-3')]
    expect(activeStaff(list).map(({ id }) => id)).toEqual(['staff-1', 'staff-3'])
  })

  it('止めた職員がいなければ、全ての職員を同じ並びで返す', () => {
    const list = [staff('staff-3'), staff('staff-1'), staff('staff-2')]
    expect(activeStaff(list)).toEqual(list)
  })
})

describe('excludeSuspendedStaffSchedules', () => {
  it('止めた職員の予定だけを除く', () => {
    const list = [staff('staff-1'), staff('staff-2', '2026-10-01T09:00:00Z')]
    const schedules = [schedule('a', 'staff-1'), schedule('b', 'staff-2'), schedule('c', 'staff-9')]
    expect(excludeSuspendedStaffSchedules(schedules, list).map(({ id }) => id)).toEqual(['a', 'c'])
  })
})
