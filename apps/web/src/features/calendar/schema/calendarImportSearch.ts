import { z } from 'zod'

/**
 * `/schedule/import` の search params。staff は選んだ職員の ID で、省くと名前の順で最初の職員を選ぶ。
 * カレンダーが結び付いていない職員の ID は、画面が無視する。
 */
export const calendarImportSearchSchema = z.object({
  staff: z.string().min(1).optional().catch(undefined),
})
