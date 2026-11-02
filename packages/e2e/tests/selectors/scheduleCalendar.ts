import type { Page } from '@playwright/test'

/** 予定のカレンダー（FullCalendar）の曜日の列の見出し。FullCalendar が描く要素なので testid が無い。 */
export const calendarColumnHeader = (page: Page, weekday: string) =>
  page.getByTestId('schedule-calendar').getByRole('columnheader', { name: weekday })

/**
 * 予定のカレンダーの列の見出しを、左から順に全て。FullCalendar が描く要素なので testid が無い。
 * 週の表示の見出しの読み上げの名前は日付になるので、曜日で 1 つを指せない。
 */
export const calendarColumnHeaders = (page: Page) =>
  page.getByTestId('schedule-calendar').getByRole('columnheader')

/**
 * 週の表示の左端の時刻の見出し。FullCalendar が描く要素なので testid が無い。
 *
 * @param time `HH:mm:ss`。例は `06:00:00`
 */
export const calendarTimeLabel = (page: Page, time: string) =>
  page.getByTestId('schedule-calendar').locator(`.fc-timegrid-slot-label[data-time="${time}"]`)

/** 月の表示の日のマスの日付。FullCalendar が描く要素なので testid が無い。 */
export const calendarDayNumbers = (page: Page) =>
  page.getByTestId('schedule-calendar').locator('.fc-daygrid-day-number')

/** 週の表示の左端の時刻の見出しを全て。FullCalendar が描く要素なので testid が無い。 */
export const calendarTimeLabels = (page: Page) =>
  page.getByTestId('schedule-calendar').locator('.fc-timegrid-slot-label-cushion')

/**
 * FullCalendar が描く枠の CSS のセレクタ。要素がはみ出していないかを、ブラウザの中で外側の枠と比べるときに使う。
 * `day` は月の表示の日のマス、`event` は予定のブロック、`timeLabel` は時刻の見出しのセル、`weekColumn` は週の表示の日の列である。
 */
export const CALENDAR_FRAME = {
  day: '.fc-daygrid-day',
  event: '.fc-event',
  timeLabel: '.fc-timegrid-slot-label',
  weekColumn: '.fc-timegrid-col',
} as const
