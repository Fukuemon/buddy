import { z } from 'zod'

import { SCHEDULE_KINDS } from '#/api/types'

/** 既定の値。URL に書かずに済むよう、route の stripSearchParams にも渡す。 */
export const scheduleCreateSearchDefaults = { kind: 'visit' } as const

/**
 * `/schedule/new` の search params。カレンダーで押した日、時刻、職員を初期値として受け取る。
 * kind はフォームのタブの選択で、URL に持つため読み直しても同じタブが開く。
 */
export const scheduleCreateSearchSchema = z.object({
  kind: z
    .enum(SCHEDULE_KINDS)
    .default(scheduleCreateSearchDefaults.kind)
    .catch(scheduleCreateSearchDefaults.kind),
  start: z.iso.date().optional().catch(undefined),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .catch(undefined),
  staffId: z.string().optional().catch(undefined),
})

export type ScheduleCreateSearch = z.infer<typeof scheduleCreateSearchSchema>
