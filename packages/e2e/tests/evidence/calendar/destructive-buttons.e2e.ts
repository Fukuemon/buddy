import { expect, test, type Locator, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'

const ACTOR = 'ログインなし（Storybook の story）'
const REVIEW_URL = storyUrl('画面-calendar-calendarreviewdialog--default')
const REWRITE_URL = storyUrl('画面-calendar-calendarrewritedialog--default')
const CUTOVER_URL = storyUrl('画面-calendar-calendarcutovercontainer--open')

const open = (url: string, testId: string) => async (page: Page) => {
  await page.goto(url)
  await expect(page.getByTestId(testId)).toBeVisible()
}

/** 2 つのボタンの、左のボタンの右端から右のボタンの左端までの距離。 */
const gapBetween = async (left: Locator, right: Locator) => {
  const a = await left.boundingBox()
  const b = await right.boundingBox()
  if (a === null || b === null) return -1
  return b.x - (a.x + a.width)
}

test.describe('予定の正本と確認が必要な予定', () => {
  test.describe('データを失う操作のボタン', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      const isBefore = variant.name === 'before'

      test(`${prefix}確認が必要な予定のダイアログを開いた場合、buddy の内容で書き直すボタンが赤い文字でフッターの左端にあり、閉じるボタンから離れていること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-review-rewrite-button',
            title: '確認が必要な予定のダイアログのフッターで、書き直すボタンの見た目と位置を見る',
            actor: ACTOR,
            variant,
          },
          open(REVIEW_URL, 'calendar-review-dialog'),
          async ({ page, step, check }) => {
            await open(REVIEW_URL, 'calendar-review-dialog')(page)
            await step(
              '確認が必要な予定のダイアログ（Storybook の CalendarReviewDialog の Default）を開いている',
            )
            const rewrite = page.getByTestId('calendar-review-rewrite-export-1')
            const close = page.getByTestId('calendar-review-cancel')
            await expect(rewrite).toHaveText('buddy の内容で書き直す')
            if (isBefore) {
              await expect(close).toHaveText('キャンセル')
              await expect.poll(() => gapBetween(close, rewrite)).toBeGreaterThanOrEqual(0)
              await check(
                '改修前: 「キャンセル」と「buddy の内容で書き直す」が、同じ青い文字の副のボタンで右に隣り合って並ぶ',
              )
            } else {
              await expect(close).toHaveText('閉じる')
              await expect(rewrite).toHaveClass(/text-danger/)
              await expect.poll(() => gapBetween(rewrite, close)).toBeGreaterThan(100)
              await check(
                '「buddy の内容で書き直す」が赤い文字でフッターの左端にあり、「閉じる」が右端に離れて置かれる',
              )
            }
          },
        )
      })

      test(`${prefix}書き直しの確認のダイアログを開いた場合、閉じる側のボタンにキャンセルの語が無く、確定のボタンが赤い塗りであること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-rewrite-dialog-labels',
            title: '書き直しの確認のダイアログの、閉じる側のボタンと確定のボタンを見る',
            actor: ACTOR,
            variant,
          },
          open(REWRITE_URL, 'calendar-rewrite-dialog'),
          async ({ page, step, check }) => {
            await open(REWRITE_URL, 'calendar-rewrite-dialog')(page)
            await step(
              '書き直しの確認のダイアログ（Storybook の CalendarRewriteDialog の Default）を開いている',
            )
            await expect(page.getByTestId('calendar-rewrite-submit')).toHaveText('書き直す')
            await expect(page.getByTestId('calendar-rewrite-submit')).toHaveClass(/bg-danger/)
            if (isBefore) {
              await expect(page.getByTestId('calendar-rewrite-cancel')).toHaveText('キャンセル')
              await check('改修前: 閉じる側が「キャンセル」で、確定の「書き直す」が赤い塗りである')
            } else {
              await expect(page.getByTestId('calendar-rewrite-cancel')).toHaveText('戻る')
              await check(
                '閉じる側が「戻る」で、確定の「書き直す」が赤い塗りである。「キャンセル」の語のボタンが無い',
              )
            }
          },
        )
      })

      test(`${prefix}予定の正本の切り替え中の画面を開いた場合、切り替えをやめるボタンが赤い文字で、完了するボタンから離れていること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-cutover-cancel-button',
            title: '予定の正本の切り替え中の画面で、切り替えをやめるボタンの見た目と位置を見る',
            actor: ACTOR,
            variant,
          },
          open(CUTOVER_URL, 'calendar-cutover-open'),
          async ({ page, step, check }) => {
            await open(CUTOVER_URL, 'calendar-cutover-open')(page)
            await step(
              '切り替え中の画面（Storybook の CalendarCutoverContainer の Open）を開いている',
            )
            const complete = page.getByTestId('calendar-cutover-complete')
            const cancel = page.getByTestId('calendar-cutover-cancel')
            await cancel.scrollIntoViewIfNeeded()
            await expect(cancel).toHaveText('切り替えをやめる')
            await expect(complete).toHaveText('完了する')
            if (isBefore) {
              await expect.poll(() => gapBetween(complete, cancel)).toBeLessThan(40)
              await check(
                '改修前: 「完了する」のすぐ右に、青い文字の副のボタンの「切り替えをやめる」が並ぶ',
              )
            } else {
              await expect(cancel).toHaveClass(/text-danger/)
              await expect.poll(() => gapBetween(complete, cancel)).toBeGreaterThan(100)
              await check(
                '「切り替えをやめる」が赤い文字で、「完了する」から離れた行の右端にある',
              )
            }
          },
        )
      })

      test(`${prefix}切り替えをやめるボタンを押した場合、確認のダイアログの閉じる側のボタンにキャンセルの語が無いこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-cutover-cancel-dialog-labels',
            title: '切り替えをやめる確認のダイアログの、閉じる側のボタンと確定のボタンを見る',
            actor: ACTOR,
            variant,
          },
          open(CUTOVER_URL, 'calendar-cutover-open'),
          async ({ page, step, check }) => {
            await open(CUTOVER_URL, 'calendar-cutover-open')(page)
            await step('切り替え中の画面を開いている')
            await step('「切り替えをやめる」を押す')
            await page.getByTestId('calendar-cutover-cancel').click()
            const dialog = page.getByTestId('calendar-cutover-cancel-confirm-dialog')
            await expect(dialog.getByTestId('calendar-cutover-cancel-confirm-submit')).toHaveText(
              'やめる',
            )
            await expect(
              dialog.getByTestId('calendar-cutover-cancel-confirm-submit'),
            ).toHaveClass(/bg-danger/)
            if (isBefore) {
              await expect(dialog.getByTestId('calendar-cutover-cancel-confirm-cancel')).toHaveText(
                'キャンセル',
              )
              await check(
                '改修前: 閉じる側の「キャンセル」と、確定の「やめる」が並び、どちらも取り消しの意味に読める',
              )
            } else {
              await expect(dialog.getByTestId('calendar-cutover-cancel-confirm-cancel')).toHaveText(
                '戻る',
              )
              await check('閉じる側が「戻る」で、確定の「やめる」が赤い塗りである')
            }
          },
        )
      })
    }
  })
})
