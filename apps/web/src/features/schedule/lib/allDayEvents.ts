import type { AllDayEvent, Staff } from '#/api/types'

import { staffColorMap } from './toCalendarEvents'

/** カレンダーに置く、Google カレンダーの終日の予定。 */
export type CalendarAllDayEvent = AllDayEvent & {
  /** 職員の区別の色。予定の面の左の線に使う。 */
  color: string
}

/** タイトルが空白だけの終日の予定に出す文。 */
const UNTITLED_ALL_DAY_EVENT = '（タイトルなし）'

/** 終日の予定 event の、画面に出すタイトルを返す。 */
export const formatAllDayEventTitle = (event: AllDayEvent) =>
  event.title.trim() === '' ? UNTITLED_ALL_DAY_EVENT : event.title

/**
 * 終日の予定を、カレンダーに置く形にする。staffList に無い職員（見てよくない職員、休職と退職の職員）の予定は除く。
 * 職員の色は、時刻のある予定と同じ表（staffColorMap）から引く。
 */
export const toCalendarAllDayEvents = (
  events: AllDayEvent[],
  staffList: Staff[],
): CalendarAllDayEvent[] => {
  const colorByStaff = staffColorMap(staffList)
  return events.flatMap((event) => {
    const color = colorByStaff.get(event.staffId)
    return color === undefined ? [] : [{ ...event, color }]
  })
}

/** events のうち、日 dateKey（`YYYY-MM-DD`）にかかる終日の予定を返す。 */
export const allDayEventsOn = <T extends AllDayEvent>(events: T[], dateKey: string) =>
  events.filter((event) => event.startDate <= dateKey && dateKey <= event.endDate)
