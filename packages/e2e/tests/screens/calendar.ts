import type { Page } from '@playwright/test'

/**
 * カレンダーの連携の画面で、職員の行の入力の初期値のカレンダーを、読めると確かめてから結び付ける。
 * 結び付けた行にカレンダーの ID が出るまで待つ。
 */
export const linkStaffCalendar = async (page: Page, staffId: string) => {
  await page.goto('/schedule/link')
  await page.getByTestId(`calendar-link-open-${staffId}`).click()
  await page.getByTestId('calendar-link-check').click()
  await page.getByTestId('calendar-link-check-result').filter({ hasText: '読めました。' }).waitFor()
  await page.getByTestId('calendar-link-submit').click()
  await page.getByTestId(`calendar-link-calendar-id-${staffId}`).waitFor()
}

/** カレンダーの連携の画面で、職員の結び付けがあれば外す。撮った後に、ほかの spec の前提へ戻すのに使う。 */
export const unlinkStaffCalendar = async (page: Page, staffId: string) => {
  await page.goto('/schedule/link')
  await page.getByTestId(`calendar-link-row-${staffId}`).waitFor()
  const remove = page.getByTestId(`calendar-link-remove-${staffId}`)
  if (!(await remove.isVisible())) return
  await remove.click()
  await page.getByTestId('calendar-unlink-submit').click()
  await remove.waitFor({ state: 'hidden' })
}
