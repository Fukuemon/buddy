import { z } from 'zod'

import { isDesktopWidth } from '@buddy/ui'

import { CALENDAR_VIEWS, type CalendarView } from '../constants/calendarView'

/**
 * デフォルト値。URL に書かずに済むよう、route の stripSearchParams にも渡す。
 * `view` のデフォルト値は開いたときの幅で変わるので、ここに置かず、選んだ値を URL に残す。
 */
export const scheduleSearchDefaults = {
  staff: [],
  cancelled: false,
} as const satisfies {
  staff: string[]
  cancelled: boolean
}

let openingView: CalendarView | undefined

/**
 * URL の表示の単位を、画面に出す表示の単位にする。省いたときは、開いたときの幅が 768px 未満なら日、768px 以上なら月にする。
 * 省いたときの表示は、ブラウザで最初に決めたものをページを読み直すまで変えない。開いた後に幅が変わっても、表示を切り替えないためである。
 * サーバーには幅が無いので、search params の検証で決めず、画面を描くときにこの関数で決める。
 */
export const resolveCalendarView = (view: CalendarView | undefined): CalendarView => {
  if (view !== undefined) return view
  if (typeof window === 'undefined') return 'month'
  return (openingView ??= isDesktopWidth() ? 'month' : 'day')
}

/**
 * `/schedule` の search params。date を省くと今日を表示する。view を省くと resolveCalendarView が幅で決める。
 * staff が空のときは、全ての職員の予定を表示する。cancelled が true のときだけ、キャンセルした予定も表示する。
 */
export const scheduleSearchSchema = z.object({
  view: z.enum(CALENDAR_VIEWS).optional().catch(undefined),
  date: z.iso.date().optional().catch(undefined),
  staff: z.array(z.string()).default([]).catch([]),
  cancelled: z.boolean().default(false).catch(false),
})

/** 検証した後の `/schedule` の search params。 */
export type ScheduleSearch = z.infer<typeof scheduleSearchSchema>

/** search params から、カレンダーの表示に使う項目だけを取り出す。モーダルを閉じるときに使う。 */
export const pickCalendarSearch = ({
  view,
  date,
  staff,
  cancelled,
}: ScheduleSearch): ScheduleSearch => ({ view, date, staff, cancelled })
