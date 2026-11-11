import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'

const REVIEW_URL = storyUrl('画面-calendar-calendarreviewdialog--default')
const REWRITE_URL = storyUrl('画面-calendar-calendarrewritedialog--default')
const CUTOVER_URL = storyUrl('画面-calendar-calendarcutovercontainer--open')

const openReview = async (page: Page) => {
  await page.goto(REVIEW_URL)
  await expect(page.getByTestId('calendar-review-dialog')).toBeVisible()
}

const openRewrite = async (page: Page) => {
  await page.goto(REWRITE_URL)
  await expect(page.getByTestId('calendar-rewrite-dialog')).toBeVisible()
}

const openCutover = async (page: Page) => {
  await page.goto(CUTOVER_URL)
  await expect(page.getByTestId('calendar-cutover-open')).toBeVisible()
}

// ボタンの色、位置、閉じる側の文言は、改修前と改修後の判定のスクリーンショットを並べて比べる。
// 確認する関数は、両方の版で通る文言と色だけを見る。閉じる側の文言は、改修前の「キャンセル」も受け付ける
test.describe('予定の管理先と確認が必要な予定', () => {
  test.describe('データを失う操作のボタン（ログインなし、Storybook の story）', () => {
    test(
      'calendar-review-rewrite-button 確認が必要な予定のダイアログを開いた場合、buddy の内容で書き直すボタンが赤い文字でフッターの左端にあり、閉じるボタンから離れていること',
      { tag: '@compare' },
      async ({ page }) => {
        await openReview(page)
        await intro(
          page,
          '確認が必要な予定のダイアログのフッターで、書き直すボタンの見た目と位置を見る\n前提 確認が必要な予定のダイアログ（Storybook の CalendarReviewDialog の Default）を開いている',
        )

        await check(
          page,
          '「buddy の内容で書き直す」が赤い文字でフッターの左端にあり、「閉じる」が右端に離れて置かれる',
          async () => {
            await expect(page.getByTestId('calendar-review-rewrite-export-1')).toHaveText(
              'buddy の内容で書き直す',
            )
            await expect(page.getByTestId('calendar-review-cancel')).toHaveText(/閉じる|キャンセル/)
          },
        )
      },
    )

    test(
      'calendar-rewrite-dialog-labels 書き直しの確認のダイアログを開いた場合、閉じる側のボタンにキャンセルの語が無く、確定のボタンが赤い塗りであること',
      { tag: '@compare' },
      async ({ page }) => {
        await openRewrite(page)
        await intro(
          page,
          '書き直しの確認のダイアログの、閉じる側のボタンと確定のボタンを見る\n前提 書き直しの確認のダイアログ（Storybook の CalendarRewriteDialog の Default）を開いている',
        )

        await check(
          page,
          '閉じる側が「戻る」で、確定の「書き直す」が赤い塗りである。「キャンセル」の語のボタンが無い',
          async () => {
            await expect(page.getByTestId('calendar-rewrite-submit')).toHaveText('書き直す')
            await expect(page.getByTestId('calendar-rewrite-submit')).toHaveClass(/bg-danger/)
            await expect(page.getByTestId('calendar-rewrite-cancel')).toHaveText(/戻る|キャンセル/)
          },
        )
      },
    )

    test(
      'calendar-cutover-cancel-button 移行中の画面を開いた場合、移行をやめるボタンが赤い文字で、完了するボタンから離れていること',
      { tag: '@compare' },
      async ({ page }) => {
        await openCutover(page)
        await intro(
          page,
          '移行中の画面で、移行をやめるボタンの見た目と位置を見る\n前提 移行中の画面（Storybook の CalendarCutoverContainer の Open）を開いている',
        )

        const cancel = page.getByTestId('calendar-cutover-cancel')
        await check(
          page,
          '「移行をやめる」が赤い文字で、「完了する」から離れた行の右端にある',
          async () => {
            await cancel.scrollIntoViewIfNeeded()
            await expect(cancel).toHaveText('移行をやめる')
            await expect(page.getByTestId('calendar-cutover-complete')).toHaveText('完了する')
          },
        )
      },
    )

    test(
      'calendar-cutover-cancel-dialog-labels 移行をやめるボタンを押した場合、確認のダイアログの閉じる側のボタンにキャンセルの語が無いこと',
      { tag: '@compare' },
      async ({ page }) => {
        await openCutover(page)
        await intro(
          page,
          '移行をやめる確認のダイアログの、閉じる側のボタンと確定のボタンを見る\n前提 移行中の画面を開いている',
        )

        await step(page, '「移行をやめる」を押す', () =>
          page.getByTestId('calendar-cutover-cancel').click(),
        )
        const dialog = page.getByTestId('calendar-cutover-cancel-confirm-dialog')
        await check(page, '閉じる側が「戻る」で、確定の「やめる」が赤い塗りである', async () => {
          await expect(dialog.getByTestId('calendar-cutover-cancel-confirm-submit')).toHaveText(
            'やめる',
          )
          await expect(dialog.getByTestId('calendar-cutover-cancel-confirm-submit')).toHaveClass(
            /bg-danger/,
          )
          await expect(dialog.getByTestId('calendar-cutover-cancel-confirm-cancel')).toHaveText(
            /戻る|キャンセル/,
          )
        })
      },
    )
  })
})
