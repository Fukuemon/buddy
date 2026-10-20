import { describe, expect, it } from 'vite-plus/test'

import { createScheduleFormValues } from '../lib/scheduleFormMapper'
import { scheduleFormSchema } from './scheduleForm'

const messagesOf = (input: unknown) => {
  const result = scheduleFormSchema.safeParse(input)
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

describe('scheduleFormSchema', () => {
  it('訪問の予定は利用者と担当者を必須にする', () => {
    expect(messagesOf(createScheduleFormValues({ kind: 'visit', date: '2026-10-20' }))).toEqual({
      patientId: '利用者を選んでください',
      staffId: '担当者を選んでください',
    })
  })

  it('提供時間がサービスコードの範囲の外なら弾く', () => {
    const values = {
      ...createScheduleFormValues({ kind: 'visit', date: '2026-10-20', staffId: 'staff-1' }),
      patientId: 'patient-1',
      serviceTime: 60,
    }
    expect(messagesOf(values)).toEqual({
      serviceTime: '訪看I2 の提供時間は 20 分から 29 分です',
    })
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
    expect(scheduleFormSchema.safeParse(values).success).toBe(true)
  })
})
