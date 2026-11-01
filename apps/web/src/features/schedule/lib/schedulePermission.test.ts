import { describe, expect, it } from 'vite-plus/test'

import type { SchedulePolicy, SchedulePolicyCode } from '#/api/types'

import {
  canEditAnySchedule,
  canEditScheduleOf,
  canReadScheduleOf,
  editableStaff,
  readableStaff,
} from './schedulePermission'

const policy = (
  code: SchedulePolicyCode,
  target: Partial<Pick<SchedulePolicy, 'targetStaffIds' | 'targetTeamIds'>> = {},
): SchedulePolicy => ({ code, targetStaffIds: [], targetTeamIds: [], ...target })

const viewerWith = (...schedulePolicies: SchedulePolicy[]) => ({
  staffId: 'staff-1',
  schedulePolicies,
})

const self = { id: 'staff-1', teamId: 'team-a' }
const teammate = { id: 'staff-2', teamId: 'team-a' }
const other = { id: 'staff-3', teamId: 'team-b' }

describe('canEditScheduleOf', () => {
  it('自分の予定の編集には、自分の予定の編集の権限が要る', () => {
    expect(canEditScheduleOf(viewerWith(), self)).toBe(false)
    expect(canEditScheduleOf(viewerWith(policy('schedule.self.edit')), self)).toBe(true)
    expect(canEditScheduleOf(viewerWith(policy('schedule.self.edit')), teammate)).toBe(false)
  })

  it('職員とチームを対象にする編集の権限は、対象の職員の予定に及ぶ', () => {
    const viewer = viewerWith(
      policy('schedule.user.edit', { targetStaffIds: ['staff-3'] }),
      policy('schedule.team.edit', { targetTeamIds: ['team-a'] }),
    )
    expect(canEditScheduleOf(viewer, other)).toBe(true)
    expect(canEditScheduleOf(viewer, teammate)).toBe(true)
    expect(canEditScheduleOf(viewer, { id: 'staff-4', teamId: 'team-b' })).toBe(false)
  })

  it('閲覧の権限では編集できず、事業所の全ての予定の編集の権限では全員を編集できる', () => {
    expect(canEditScheduleOf(viewerWith(policy('schedule.all.read')), other)).toBe(false)
    expect(canEditScheduleOf(viewerWith(policy('schedule.all.edit')), other)).toBe(true)
  })
})

describe('canReadScheduleOf', () => {
  it('自分の予定は権限によらず見られ、編集の権限は同じ範囲の閲覧を含む', () => {
    expect(canReadScheduleOf(viewerWith(), self)).toBe(true)
    expect(canReadScheduleOf(viewerWith(), teammate)).toBe(false)
    expect(
      canReadScheduleOf(
        viewerWith(policy('schedule.team.edit', { targetTeamIds: ['team-a'] })),
        teammate,
      ),
    ).toBe(true)
    expect(
      canReadScheduleOf(
        viewerWith(policy('schedule.user.read', { targetStaffIds: ['staff-3'] })),
        other,
      ),
    ).toBe(true)
  })
})

describe('editableStaff と readableStaff', () => {
  it('並びを変えずに、権限の及ぶ職員だけを返す', () => {
    const viewer = viewerWith(
      policy('schedule.self.edit'),
      policy('schedule.team.read', { targetTeamIds: ['team-a'] }),
    )
    expect(editableStaff(viewer, [other, teammate, self])).toEqual([self])
    expect(readableStaff(viewer, [other, teammate, self])).toEqual([teammate, self])
  })
})

describe('canEditAnySchedule', () => {
  it('編集の権限を 1 つでも持てば true、閲覧の権限だけなら false を返す', () => {
    expect(canEditAnySchedule(viewerWith(policy('schedule.all.read')))).toBe(false)
    expect(canEditAnySchedule(viewerWith(policy('schedule.self.edit')))).toBe(true)
  })
})
