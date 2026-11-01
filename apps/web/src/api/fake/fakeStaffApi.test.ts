import { describe, expect, it } from 'vite-plus/test'

import { createFakeBuddyApi } from './fakeBuddyApi'
import { FAKE_FACILITY_ID, FAKE_VIEWER } from './fixtures'

const baseDate = new Date(2026, 9, 20)

describe('createFakeStaffApi', () => {
  it('登録した職員に役職のデフォルトの権限を付け、チームを対象にする権限は所属のチームを指す', async () => {
    const api = createFakeBuddyApi({ baseDate })
    const created = await api.staff.create(FAKE_FACILITY_ID, {
      username: '新井 五月',
      email: 'Satsuki.Arai@Example.com',
      department_id: 'department-2',
      team_id: 'team-b',
      position_id: 'position-1',
    })
    expect(created.email).toBe('satsuki.arai@example.com')
    expect(
      created.policies.map(({ code, target_team_ids }) => ({ code, target_team_ids })),
    ).toEqual([
      { code: 'schedule.self.edit', target_team_ids: [] },
      { code: 'schedule.team.read', target_team_ids: ['team-b'] },
    ])
    const records = await api.staff.listRecords(FAKE_FACILITY_ID)
    expect(records.map((s) => s.username)).toContain('新井 五月')
    await expect(
      api.staff.create(FAKE_FACILITY_ID, {
        username: '別の人',
        email: 'satsuki.arai@example.com',
        department_id: 'department-1',
        team_id: 'team-a',
        position_id: 'position-1',
      }),
    ).rejects.toHaveProperty('status', 409)
  })

  it('チームを変えると、古いチームを指す権限の対象を新しいチームに移す', async () => {
    const api = createFakeBuddyApi({ baseDate })
    const staff = await api.staff.get(FAKE_FACILITY_ID, 'staff-2')
    const updated = await api.staff.update(FAKE_FACILITY_ID, 'staff-2', {
      username: staff.username,
      department_id: staff.department.id,
      team_id: 'team-b',
    })
    expect(updated.team.name).toBe('B チーム')
    expect(updated.policies.find((p) => p.code === 'schedule.team.read')?.target_team_ids).toEqual([
      'team-b',
    ])
  })

  it('自分と職員の管理の権限を持つ最後の有効な職員は、止めることも権限を外すこともできない', async () => {
    const api = createFakeBuddyApi({ baseDate })
    const me = await api.staff.get(FAKE_FACILITY_ID, FAKE_VIEWER.staffId)
    await expect(
      api.staff.startLeave(FAKE_FACILITY_ID, FAKE_VIEWER.staffId, null),
    ).rejects.toHaveProperty('status', 409)
    await expect(
      api.staff.removePolicy(FAKE_FACILITY_ID, me.id, me.policies[0].user_policy_id),
    ).rejects.toHaveProperty('status', 409)
    await expect(
      api.staff.changePosition(FAKE_FACILITY_ID, me.id, 'position-1'),
    ).rejects.toHaveProperty('status', 409)
  })

  it('休職にして復職にすると有効に戻り、退職は今日以降の予定が残れば残るものを返す', async () => {
    const api = createFakeBuddyApi({ baseDate })
    const onLeave = await api.staff.startLeave(FAKE_FACILITY_ID, 'staff-4', '2027-04-01')
    expect(onLeave).toMatchObject({ status: 'on_leave', leave_return_date: '2027-04-01' })
    const back = await api.staff.reinstate(FAKE_FACILITY_ID, 'staff-4')
    expect(back).toMatchObject({ status: 'active', leave_return_date: null })

    const remaining = await api.staff.remainingAssignments(FAKE_FACILITY_ID, 'staff-2')
    const refused = await api.staff.retire(FAKE_FACILITY_ID, 'staff-2')
    expect(refused).toEqual({ assignments: remaining })
  })

  it('部署とチームの名前を変えると、職員の一覧と詳細の部署とチームの名前も変わる', async () => {
    const api = createFakeBuddyApi({ baseDate })
    const [record] = await api.staff.listRecords(FAKE_FACILITY_ID)
    if (record === undefined) throw new Error('職員がいない')
    await api.teams.update(FAKE_FACILITY_ID, record.team.id, {
      name: '新しいチーム',
      color: 'lime',
    })
    await api.departments.update(FAKE_FACILITY_ID, record.department.id, '新しい部署')
    const detail = await api.staff.get(FAKE_FACILITY_ID, record.id)
    expect([detail.team.name, detail.department.name]).toEqual(['新しいチーム', '新しい部署'])
    const records = await api.staff.listRecords(FAKE_FACILITY_ID)
    expect(records.find((s) => s.id === record.id)?.team.name).toBe('新しいチーム')
  })
})
