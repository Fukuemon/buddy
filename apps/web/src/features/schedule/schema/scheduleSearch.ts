import { z } from 'zod'

import { CALENDAR_VIEWS } from '../constants/calendarView'

/**
 * `/schedule` の search params。date を省くと今日を表示する。
 * staff が空のときは、全ての職員の予定を表示する。
 */
/** 既定の値。URL に書かずに済むよう、route の stripSearchParams にも渡す。 */
export const scheduleSearchDefaults = {
  view: 'month',
  staff: [],
} as const satisfies { view: (typeof CALENDAR_VIEWS)[number]; staff: string[] }

export const scheduleSearchSchema = z.object({
  view: z
    .enum(CALENDAR_VIEWS)
    .default(scheduleSearchDefaults.view)
    .catch(scheduleSearchDefaults.view),
  date: z.iso.date().optional().catch(undefined),
  staff: z.array(z.string()).default([]).catch([]),
})

export type ScheduleSearch = z.infer<typeof scheduleSearchSchema>
