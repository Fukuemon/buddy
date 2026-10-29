import type { Page } from '@playwright/test'

/** 予定のカレンダー（FullCalendar）の曜日の列の見出し。FullCalendar が描く要素なので testid が無い。 */
export const calendarColumnHeader = (page: Page, weekday: string) =>
  page.getByTestId('schedule-calendar').getByRole('columnheader', { name: weekday })
