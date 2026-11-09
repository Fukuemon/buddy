import type { Page } from '@playwright/test'

/** 予定のカレンダーの日の表示を date で開き、staffId の職員の列が出るまで待つ。 */
export const openDay = async (page: Page, date: string, staffId: string) => {
  await page.goto(`/schedule?view=day&date=${date}`)
  await page.getByTestId(`day-grid-staff-${staffId}`).waitFor()
}
