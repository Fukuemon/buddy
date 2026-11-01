import type { Page } from '@playwright/test'

/** 予定のカレンダー（FullCalendar）の曜日の列の見出し。FullCalendar が描く要素なので testid が無い。 */
export const calendarColumnHeader = (page: Page, weekday: string) =>
  page.getByTestId('schedule-calendar').getByRole('columnheader', { name: weekday })

/**
 * 週の表示の左端の時刻の見出し。FullCalendar が描く要素なので testid が無い。
 *
 * @param time `HH:mm:ss`。例は `06:00:00`
 */
export const calendarTimeLabel = (page: Page, time: string) =>
  page.getByTestId('schedule-calendar').locator(`.fc-timegrid-slot-label[data-time="${time}"]`)
