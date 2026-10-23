import { describe, expect, it } from 'vite-plus/test'

import type { Schedule, Staff } from '#/api/types'

import { activeStaff, activeStaffIds, excludeInactiveStaffSchedules } from './activeStaff'

const staff = (id: string, status?: Staff['status']): Staff => ({
  id,
  name: id,
  teamId: 'team-a',
  email: `${id}@example.com`,
  ...(status === undefined ? {} : { status }),
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
  it('休職と退職の職員を除き、残りの職員の並びを変えない', () => {
    const list = [
      staff('staff-4'),
      staff('staff-2', 'on_leave'),
      staff('staff-1'),
      staff('staff-3', 'retired'),
    ]
    expect(activeStaff(list).map(({ id }) => id)).toEqual(['staff-4', 'staff-1'])
  })

  it('休職と退職の職員がいなければ、全ての職員を同じ並びで返す', () => {
    const list = [staff('staff-3'), staff('staff-1'), staff('staff-2')]
    expect(activeStaff(list)).toEqual(list)
  })
})

describe('excludeInactiveStaffSchedules', () => {
  it('休職と退職の職員の予定だけを除く', () => {
    const list = [staff('staff-1'), staff('staff-2', 'on_leave'), staff('staff-3', 'retired')]
    const schedules = [
      schedule('a', 'staff-1'),
      schedule('b', 'staff-2'),
      schedule('c', 'staff-9'),
      schedule('d', 'staff-3'),
    ]
    expect(excludeInactiveStaffSchedules(schedules, list).map(({ id }) => id)).toEqual(['a', 'c'])
  })
})

describe('activeStaffIds', () => {
  const list = [staff('staff-1'), staff('staff-2', 'on_leave'), staff('staff-3', 'retired')]

  it('休職と退職の職員の ID を除く', () => {
    expect(activeStaffIds(['staff-1', 'staff-2', 'staff-3'], list)).toEqual(['staff-1'])
  })

  it('職員の一覧を取り終える前は、そのまま返す', () => {
    expect(activeStaffIds(['staff-1', 'staff-2'], undefined)).toEqual(['staff-1', 'staff-2'])
  })
})
