import type { Page } from '@playwright/test'

/**
 * カレンダーの連携の画面で、職員の行の入力の初期値のカレンダーを、読めると確認してから結び付ける。
 * 結び付けた行に「…」のメニューのボタンが出るまで待つ。結び付けていない行にも、読み上げだけのカレンダーの ID の欄があるためである。
 */
export const linkStaffCalendar = async (page: Page, staffId: string) => {
  await page.goto('/schedule/link')
  await page.getByTestId(`calendar-link-open-${staffId}`).click()
  await page.getByTestId('calendar-link-check').click()
  await page.getByTestId('calendar-link-check-result').filter({ hasText: '読めました。' }).waitFor()
  await page.getByTestId('calendar-link-submit').click()
  await page.getByTestId(`calendar-link-menu-${staffId}`).waitFor()
}

/** カレンダーの連携の画面で、職員の結び付けがあれば、「…」のメニューから外す。撮った後に、ほかの spec の前提へ戻すのに使う。 */
export const unlinkStaffCalendar = async (page: Page, staffId: string) => {
  await page.goto('/schedule/link')
  await page.getByTestId(`calendar-link-row-${staffId}`).waitFor()
  const menu = page.getByTestId(`calendar-link-menu-${staffId}`)
  if (!(await menu.isVisible())) return
  await menu.click()
  await page.getByTestId(`calendar-link-remove-${staffId}`).click()
  await page.getByTestId('calendar-unlink-submit').click()
  await menu.waitFor({ state: 'hidden' })
}
