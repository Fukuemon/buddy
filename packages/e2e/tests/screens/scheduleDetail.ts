import type { Page } from '@playwright/test'

/**
 * 予定 scheduleId の詳細を、date の日の表示の上に URL で開き、詳細が出るまで待つ。
 * 同じ時刻のほかの spec の予定と重なると、カレンダーの予定を押せないことがあるので、押さずに URL で開く。
 */
export const openDetail = async (page: Page, scheduleId: string, date: string) => {
  await page.goto(`/schedule/${scheduleId}?view=day&date=${date}`)
  await page.getByTestId('schedule-detail-modal').waitFor()
}
