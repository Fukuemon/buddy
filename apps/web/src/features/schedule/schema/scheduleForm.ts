import { z } from 'zod'

import { SCHEDULE_CATEGORIES, SERVICE_CODES } from '#/api/types'

import { SERVICE_CODE_DURATION } from '../constants/scheduleLabels'
import { diffMinutes } from '../lib/dateTime'

const MINUTES_PER_DAY = 24 * 60

const baseFields = {
  staffId: z.string().min(1, '担当者を選んでください'),
  scheduleDate: z.iso.date({ error: '日付を入力してください' }),
  startTime: z.iso.time({ precision: -1, error: '開始時間を入力してください' }),
  description: z.string(),
}

export const normalScheduleFormSchema = z
  .object({
    ...baseFields,
    kind: z.literal('normal'),
    title: z.string().trim().min(1, 'タイトルを入力してください'),
    endTime: z.iso.time({ precision: -1, error: '終了時間を入力してください' }),
  })
  .refine((values) => diffMinutes(values.startTime, values.endTime) > 0, {
    path: ['endTime'],
    error: '終了時間は開始時間より後にしてください',
  })

export const visitScheduleFormSchema = z
  .object({
    ...baseFields,
    kind: z.literal('visit'),
    patientId: z.string().min(1, '利用者を選んでください'),
    serviceCode: z.enum(SERVICE_CODES),
    serviceTime: z.number({ error: '提供時間を入力してください' }).int(),
    categories: z.array(z.enum(SCHEDULE_CATEGORIES)),
  })
  .superRefine((values, ctx) => {
    const { min, max } = SERVICE_CODE_DURATION[values.serviceCode]
    if (values.serviceTime < min || values.serviceTime > max) {
      ctx.addIssue({
        code: 'custom',
        path: ['serviceTime'],
        message: `${values.serviceCode} の提供時間は ${min} 分から ${max} 分です`,
      })
    }
    const end = diffMinutes('00:00', values.startTime) + values.serviceTime
    if (Number.isFinite(end) && end >= MINUTES_PER_DAY) {
      ctx.addIssue({
        code: 'custom',
        path: ['serviceTime'],
        message: '終了が日をまたがないよう、開始時間か提供時間を変えてください',
      })
    }
  })

/** 予定の作成と編集のフォームの検証。kind で通常と訪問の項目を切り替える。 */
export const scheduleFormSchema = z.discriminatedUnion('kind', [
  normalScheduleFormSchema,
  visitScheduleFormSchema,
])

/** 通常の予定のフォームの値。 */
export type NormalScheduleFormValues = z.infer<typeof normalScheduleFormSchema>
/** 訪問の予定のフォームの値。 */
export type VisitScheduleFormValues = z.infer<typeof visitScheduleFormSchema>
/** 予定のフォームの値。kind で通常と訪問を分ける。 */
export type ScheduleFormValues = z.infer<typeof scheduleFormSchema>
