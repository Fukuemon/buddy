import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'
import { pageBody } from '../../selectors/page'

// #252 で「確かめる」を「確認する」に置き換えた文言。字幕は改修後の文言にし、確認する関数は改修前の文言も受け付ける
const EXPECTED = {
  review: /確認が必要な予定|確かめが要る予定/,
  count: /確認が必要|確かめが要る/,
}

test.describe('カレンダーの連携と取り込みの文言（ログインなし、Storybook の story）', () => {
  // 改修前は別の story（CalendarReviewView）を開き、行を押す操作が無い。改修前と改修後で流れが違うので、改修後の流れだけを撮る
  test('wording-review-title 食い違った予定の画面を開いた場合、見出しが「確認が必要な予定」で出ること', async ({
    page,
  }) => {
    await page.goto(storyUrl('画面-calendar-calendarreviewcontainer--default'))
    await expect(pageBody(page)).toContainText('確認が必要な予定')
    await intro(
      page,
      '食い違った予定の画面で、見出しの文言を見る\n前提 食い違った予定の画面（Storybook の CalendarReviewContainer の Default）を開いている',
    )

    // 理由に続く職員に頼む文は、行を押して開く予定の確認のダイアログに出る。export-2（予定は schedule-5）は、Google カレンダーに書く権限が無い書き出しである
    await step(page, '青木 一郎の 2026年11月2日（月） 14:00〜16:00 の行を押す', () =>
      page.getByTestId('calendar-review-row-schedule-schedule-5').click(),
    )
    await check(
      page,
      '見出しが「確認が必要な予定」で、書けない予定の理由の文が「職員に確認してください」で出る',
      () =>
        expect(page.getByTestId('calendar-review-dialog-reason')).toContainText(
          '職員に確認してください',
        ),
    )
  })

  test(
    'wording-import-preview 予定の取り込みのプレビューに食い違った予定がある場合、見出しが「確認が必要な予定」で出ること',
    { tag: '@compare' },
    async ({ page }) => {
      await page.goto(storyUrl('画面-calendar-calendarimportpreview--preview'))
      const preview = page.getByTestId('calendar-import-result-preview')
      await expect(preview).toBeVisible()
      await intro(
        page,
        '予定の取り込みのプレビューの結果で、食い違った予定の見出しと残りの件数の文を見る\n前提 予定の取り込みのプレビューの結果（Storybook の CalendarImportPreview の Preview）を開いている',
      )

      await check(
        page,
        '件数の見出しが「確認が必要」、一覧の見出しと残りの件数の文が「確認が必要な予定」で出る',
        async () => {
          await expect(page.getByTestId('calendar-import-count-needs_review')).toContainText(
            EXPECTED.count,
          )
          await expect(preview).toContainText(EXPECTED.review)
          await expect(page.getByTestId('calendar-import-remaining')).toContainText(
            new RegExp(`(${EXPECTED.review.source})のうち`),
          )
        },
      )
    },
  )

  test(
    'wording-link-check カレンダーを結び付けるダイアログを開いた場合、ボタンが「読めるか確認する」で出ること',
    { tag: '@compare' },
    async ({ page }) => {
      await page.goto(storyUrl('画面-calendar-calendarlinkdialog--default'))
      await expect(page.getByTestId('calendar-link-dialog')).toBeVisible()
      await intro(
        page,
        'カレンダーを結び付けるダイアログで、読めるかを調べるボタンの文言を見る\n前提 カレンダーを結び付けるダイアログ（Storybook の CalendarLinkDialog の Default）を開いている',
      )

      await check(page, 'ボタンが「読めるか確認する」で出る', () =>
        expect(page.getByTestId('calendar-link-check')).toHaveText(/読めるか(確認する|確かめる)/),
      )
    },
  )
})
