import { describe, expect, it } from 'vite-plus/test'

import { createScheduleFormValues } from '../lib/scheduleFormMapper'
import { mockServiceCodes } from '#/mocks/scheduleData'

import { createScheduleFormSchema } from './scheduleForm'

const schema = createScheduleFormSchema(mockServiceCodes)
const FIRST_SERVICE_CODE = mockServiceCodes[0]

const messagesOf = (input: unknown) => {
  const result = schema.safeParse(input)
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

describe('createScheduleFormSchema', () => {
  it('訪問の予定は利用者と主訪問者を必須にする', () => {
    expect(
      messagesOf(
        createScheduleFormValues({
          kind: 'visit',
          date: '2026-10-20',
          serviceCode: FIRST_SERVICE_CODE,
        }),
      ),
    ).toEqual({
      patientId: '利用者を選んでください',
      staffId: '主訪問者を選んでください',
    })
  })

  it('提供時間がサービスコードの範囲の外なら弾く', () => {
    const values = {
      ...createScheduleFormValues({
        kind: 'visit',
        date: '2026-10-20',
        serviceCode: FIRST_SERVICE_CODE,
        staffId: 'staff-1',
      }),
      patientId: 'patient-1',
      serviceTime: 60,
    }
    expect(messagesOf(values)).toEqual({
      serviceTime: '訪看I2 の提供時間は 20 分から 29 分です',
    })
  })

  it.each(['訪看I5・2超', '予防看I5・2超'] as const)(
    '%s は照合の規則と同じ 41 分から 60 分にする',
    (serviceCode) => {
      const values = {
        ...createScheduleFormValues({
          kind: 'visit',
          date: '2026-10-20',
          serviceCode: FIRST_SERVICE_CODE,
          staffId: 'staff-1',
        }),
        patientId: 'patient-1',
        serviceCode,
      }
      const message = `${serviceCode} の提供時間は 41 分から 60 分です`
      expect(messagesOf({ ...values, serviceTime: 40 })).toEqual({ serviceTime: message })
      expect(messagesOf({ ...values, serviceTime: 41 })).toEqual({})
      expect(messagesOf({ ...values, serviceTime: 60 })).toEqual({})
      expect(messagesOf({ ...values, serviceTime: 61 })).toEqual({ serviceTime: message })
    },
  )

  it('予定の API の一覧に無いサービスコードは弾く', () => {
    const values = {
      ...createScheduleFormValues({
        kind: 'visit',
        date: '2026-10-20',
        serviceCode: FIRST_SERVICE_CODE,
        staffId: 'staff-1',
      }),
      patientId: 'patient-1',
      serviceCode: '訪看I9',
    }
    expect(messagesOf(values)).toEqual({ serviceCode: 'サービスコードを選んでください' })
  })

  it('開始に提供時間を足して日をまたぐ訪問の予定は弾く', () => {
    const values = {
      ...createScheduleFormValues({
        kind: 'visit',
        date: '2026-10-20',
        serviceCode: FIRST_SERVICE_CODE,
        staffId: 'staff-1',
      }),
      patientId: 'patient-1',
      startTime: '23:50',
      serviceTime: 29,
    }
    expect(messagesOf(values)).toEqual({
      serviceTime: '終了が日をまたがないよう、開始時間か提供時間を変えてください',
    })
    expect(messagesOf({ ...values, startTime: '23:31' })).toEqual({
      serviceTime: '終了が日をまたがないよう、開始時間か提供時間を変えてください',
    })
    expect(messagesOf({ ...values, startTime: '23:30' })).toEqual({})
  })

  it('通常の予定はタイトルを必須にし、終了時間を開始時間より後にさせる', () => {
    const values = {
      ...createScheduleFormValues({ kind: 'normal', date: '2026-10-20', staffId: 'staff-1' }),
      title: '  ',
      endTime: '08:00',
    }
    expect(messagesOf(values)).toEqual({
      title: 'タイトルを入力してください',
      endTime: '終了時間は開始時間より後にしてください',
    })
  })

  it('必須の項目を満たした通常の予定を通す', () => {
    const values = {
      ...createScheduleFormValues({ kind: 'normal', date: '2026-10-20', staffId: 'staff-1' }),
      title: 'カンファレンス',
    }
    expect(schema.safeParse(values).success).toBe(true)
  })

  it('時と分の範囲の外の時刻を弾く', () => {
    const values = {
      ...createScheduleFormValues({ kind: 'normal', date: '2026-10-20', staffId: 'staff-1' }),
      title: '研修',
      startTime: '24:00',
      endTime: '99:99',
    }
    expect(messagesOf(values)).toMatchObject({
      startTime: '開始時間を入力してください',
      endTime: '終了時間を入力してください',
    })
  })
})
