import { describe, expect, it } from 'vite-plus/test'

import { createFakeSchedules } from '#/api/fake/fixtures'
import { mockServiceCodes } from '#/mocks/scheduleData'

import {
  createScheduleFormValues,
  defaultServiceCode,
  toScheduleFormValues,
  toScheduleInput,
} from './scheduleFormMapper'

const serviceCode = (id: string, code: string) => ({
  id,
  code,
  service_time_range_start: 20,
  service_time_range_end: 29,
})

describe('defaultServiceCode', () => {
  it('一覧の順によらず、訪看I2 を初期値にする。全角の数字の表記も訪看I2 とみなす', () => {
    const preventive = serviceCode('code-p2', '予防看I2')
    const visit = serviceCode('code-i2', '訪看I2')
    expect(defaultServiceCode([preventive, visit])).toBe(visit)
    const fullWidth = serviceCode('code-i2', '訪看I２')
    expect(defaultServiceCode([preventive, fullWidth])).toBe(fullWidth)
  })

  it('訪看I2 が一覧に無ければ一覧の先頭を、一覧が空なら undefined を返す', () => {
    const preventive = serviceCode('code-p2', '予防看I2')
    expect(defaultServiceCode([preventive, serviceCode('code-m', '医')])).toBe(preventive)
    expect(defaultServiceCode([])).toBeUndefined()
  })
})

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
    ).filter(
      // 翌日に終わる予定のフォームは #412 で作る。作ったら、この条件を外す
      (schedule) =>
        schedule.cancel === undefined &&
        schedule.startsAt.slice(0, 10) === schedule.endsAt.slice(0, 10),
    )) {
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
