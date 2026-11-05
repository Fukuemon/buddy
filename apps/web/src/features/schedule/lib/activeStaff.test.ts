import { describe, expect, it } from 'vite-plus/test'

import type { Schedule, Staff } from '#/api/types'

import {
  activeStaff,
  activeStaffId,
  activeStaffIds,
  excludeInactiveStaffSchedules,
} from './activeStaff'

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

describe('activeStaffId', () => {
  const list = [staff('staff-1'), staff('staff-2', 'on_leave'), staff('staff-3', 'retired')]

  it('休職と退職の職員の ID は undefined にする', () => {
    expect(activeStaffId('staff-2', list)).toBeUndefined()
    expect(activeStaffId('staff-3', list)).toBeUndefined()
  })

  it('有効な職員の ID と、一覧に無い ID はそのまま返す', () => {
    expect(activeStaffId('staff-1', list)).toBe('staff-1')
    expect(activeStaffId('staff-9', list)).toBe('staff-9')
  })

  it('職員の一覧を取り終える前は、そのまま返す', () => {
    expect(activeStaffId('staff-2', undefined)).toBe('staff-2')
  })
})

describe('訪問しない職員（ADR-0018）', () => {
  const nonVisiting: Staff = { ...staff('staff-5'), nonVisiting: true }
  const list = [staff('staff-1'), nonVisiting]

  it('予定のカレンダーの列と絞り込み、予定の職員の候補に出さない', () => {
    expect(activeStaff(list).map(({ id }) => id)).toEqual(['staff-1'])
  })

  it('予定のカレンダーに予定を出さない', () => {
    const schedules = [schedule('a', 'staff-1'), schedule('b', 'staff-5')]
    expect(excludeInactiveStaffSchedules(schedules, list).map(({ id }) => id)).toEqual(['a'])
  })

  it('URL の絞り込みと予定の作成の職員から外す', () => {
    expect(activeStaffIds(['staff-1', 'staff-5'], list)).toEqual(['staff-1'])
    expect(activeStaffId('staff-5', list)).toBeUndefined()
  })
})
