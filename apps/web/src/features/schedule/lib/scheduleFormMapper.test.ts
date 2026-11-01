import { describe, expect, it } from 'vite-plus/test'

import { createFakeSchedules } from '#/api/fake/fixtures'

import {
  createScheduleFormValues,
  toScheduleFormValues,
  toScheduleInput,
} from './scheduleFormMapper'

import { mockServiceCodes } from '#/mocks/scheduleData'

describe('scheduleFormMapper', () => {
  it('訪問の初期値は、渡したサービスコードの上限を提供時間にする', () => {
    expect(
      createScheduleFormValues({
        kind: 'visit',
        date: '2026-10-20',
        serviceCode: mockServiceCodes[0],
      }),
    ).toMatchObject({
      kind: 'visit',
      startTime: '09:00',
      serviceCode: '訪看I2',
      serviceTime: 29,
    })
  })

  it('訪問の予定の終了の日時を、開始時間と提供時間から求める', () => {
    const input = toScheduleInput({
      kind: 'visit',
      staffId: 'staff-1',
      scheduleDate: '2026-10-20',
      startTime: '10:00',
      description: '',
      patientId: 'patient-1',
      serviceCode: '訪看I3',
      serviceTime: 45,
      categories: ['night'],
    })
    expect(input).toEqual({
      kind: 'visit',
      title: '訪問',
      staffId: 'staff-1',
      startsAt: '2026-10-20T10:00:00+09:00',
      endsAt: '2026-10-20T10:45:00+09:00',
      description: '',
      visit: { patientId: 'patient-1', serviceCode: '訪看I3', categories: ['night'] },
    })
  })

  it('予定をフォームの値にし、送る値に戻すと元の予定と同じになる', () => {
    // キャンセルした予定は編集できないので、フォームに載せない
    for (const { id: _id, facilityId: _facilityId, ...schedule } of createFakeSchedules(
      new Date(2026, 9, 20),
    ).filter((schedule) => schedule.cancel === undefined)) {
      const values = toScheduleFormValues({ ...schedule, id: 'x', facilityId: 'f' })
      // 訪問の予定のタイトルは、API では空で、フォームが「訪問」に固定する
      expect(toScheduleInput(values)).toEqual(
        schedule.kind === 'normal'
          ? { ...schedule, visit: undefined }
          : { ...schedule, title: '訪問' },
      )
    }
  })
})
