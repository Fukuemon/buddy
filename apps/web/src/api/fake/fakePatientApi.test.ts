import { describe, expect, it } from 'vite-plus/test'

import { createFakeBuddyApi } from './fakeBuddyApi'
import { FAKE_FACILITY_ID } from './fixtures'

const baseDate = new Date(2026, 9, 20)

const input = {
  name: '佐野 春香',
  preferred_time: '午後',
  preferred_gender: '男性',
  service_code_id: 'code-i3',
  assigned_staff_id: 'staff-2',
} as const

describe('createFakePatientApi', () => {
  it('登録した利用者を、利用者の一覧と予定の利用者の候補の両方に出す', async () => {
    const api = createFakeBuddyApi({ baseDate })
    const created = await api.patients.create(FAKE_FACILITY_ID, input)
    expect(created).toMatchObject({
      name: '佐野 春香',
      service_code: '訪看I3',
      assigned_staff_name: '石川 二葉',
      ended_at: null,
    })
    const records = await api.patients.listRecords(FAKE_FACILITY_ID)
    expect(records.map((p) => p.name)).toContain('佐野 春香')
    expect(records.map((p) => p.name)).toEqual(
      [...records.map((p) => p.name)].sort((a, b) => a.localeCompare(b, 'ja')),
    )
    expect((await api.patients.list(FAKE_FACILITY_ID)).map((p) => p.id)).toContain(created.id)
  })

  it('休職の職員を担当に新しく指すと 400 で拒み、今の担当のままなら休職でも変えられる', async () => {
    const api = createFakeBuddyApi({ baseDate })
    const created = await api.patients.create(FAKE_FACILITY_ID, input)
    await api.staff.startLeave(FAKE_FACILITY_ID, 'staff-3', null)
    await expect(
      api.patients.update(FAKE_FACILITY_ID, created.id, { ...input, assigned_staff_id: 'staff-3' }),
    ).rejects.toMatchObject({ status: 400, code: 'invalid_input' })

    await api.staff.startLeave(FAKE_FACILITY_ID, 'staff-2', null)
    await expect(
      api.patients.update(FAKE_FACILITY_ID, created.id, { ...input, name: '佐野 春香 改' }),
    ).resolves.toMatchObject({ name: '佐野 春香 改', assigned_staff_id: 'staff-2' })
  })

  it('今日以降の予定が残る利用者の利用の終了は残る予定を返し、残らなければ利用の終了にして予定の候補から外す', async () => {
    const api = createFakeBuddyApi({ baseDate })
    const refused = await api.patients.endService(FAKE_FACILITY_ID, 'patient-1')
    expect(refused).toMatchObject({ schedules: { schedules: [{ id: 'schedule-1' }] } })

    const created = await api.patients.create(FAKE_FACILITY_ID, input)
    const ended = await api.patients.endService(FAKE_FACILITY_ID, created.id)
    expect(ended).toMatchObject({ ended: { id: created.id } })
    expect('ended' in ended && ended.ended.ended_at).not.toBeNull()
    const candidates = await api.patients.list(FAKE_FACILITY_ID)
    expect(candidates.find((p) => p.id === created.id)?.ended).toBe(true)

    const resumed = await api.patients.resumeService(FAKE_FACILITY_ID, created.id, 'staff-4')
    expect(resumed).toMatchObject({ ended_at: null, assigned_staff_id: 'staff-4' })
  })

  it('担当の利用者を、職員の退職の確認に数え、利用の終了の利用者は数えない', async () => {
    const api = createFakeBuddyApi({ baseDate })
    const created = await api.patients.create(FAKE_FACILITY_ID, input)
    const before = await api.staff.remainingAssignments(FAKE_FACILITY_ID, 'staff-2')
    expect(before.patients.map((p) => p.id)).toContain(created.id)
    await api.patients.endService(FAKE_FACILITY_ID, created.id)
    const after = await api.staff.remainingAssignments(FAKE_FACILITY_ID, 'staff-2')
    expect(after.patients.map((p) => p.id)).not.toContain(created.id)
  })
})
