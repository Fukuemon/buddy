import { expect, test } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'
import { pageBody } from '../../selectors/page'

const ACTOR = 'ログインなし（Storybook の story）'

// #252 で「確かめる」を「確認する」に置き換えた文言。改修前と比べて撮るので、両方の文言を持つ
const EXPECTED = {
  before: {
    review: '確かめが要る予定',
    count: '確かめが要る',
    ask: '確かめ',
    check: '読めるか確かめる',
  },
  after: {
    review: '確認が必要な予定',
    count: '確認が必要',
    ask: '確認し',
    check: '読めるか確認する',
  },
}

test.describe('カレンダーの連携と取り込みの文言', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''
    const expected = variant.name === 'before' ? EXPECTED.before : EXPECTED.after

    test(`${prefix}食い違った予定の画面を開いた場合、見出しが「${expected.review}」で出ること`, async ({
      browser,
    }) => {
      // 理由に続く職員に頼む文は、改修前は一覧の行に、今は行を押して開く予定の確認のダイアログに出る
      const isBefore = variant.name === 'before'
      const url = storyUrl(
        isBefore
          ? '画面-calendar-calendarreviewview--default'
          : '画面-calendar-calendarreviewcontainer--default',
      )
      await recordPrEvidence(
        browser,
        {
          name: 'wording-review-title',
          title: '食い違った予定の画面で、見出しの文言を見る',
          actor: ACTOR,
          variant,
        },
        async (page) => {
          await page.goto(url)
        },
        async ({ page, step, check }) => {
          await page.goto(url)
          await expect(pageBody(page)).toContainText(expected.review)
          await step(
            `食い違った予定の画面（Storybook の ${isBefore ? 'CalendarReviewView' : 'CalendarReviewContainer'} の Default）を開いている`,
          )
          // export-2（予定は schedule-5）は、Google カレンダーに書く権限が無い書き出しである
          const reason = isBefore
            ? page.getByTestId('calendar-review-reason-export-2')
            : page.getByTestId('calendar-review-dialog-reason')
          if (!isBefore) {
            await step('青木 一郎の 2026/11/02（月）14:00〜16:00 の行を押す')
            await page.getByTestId('calendar-review-row-schedule-schedule-5').click()
          }
          await expect(reason).toContainText(`職員に${expected.ask}てください`)
          await check(
            `見出しが「${expected.review}」で、書けない予定の理由の文が「職員に${expected.ask}てください」で出る`,
          )
        },
      )
    })

    test(`${prefix}予定の取り込みのプレビューに食い違った予定がある場合、見出しが「${expected.review}」で出ること`, async ({
      browser,
    }) => {
      const url = storyUrl('画面-calendar-calendarimportpreview--preview')
      await recordPrEvidence(
        browser,
        {
          name: 'wording-import-preview',
          title: '予定の取り込みのプレビューの結果で、食い違った予定の見出しと残りの件数の文を見る',
          actor: ACTOR,
          variant,
        },
        async (page) => {
          await page.goto(url)
        },
        async ({ page, step, check }) => {
          await page.goto(url)
          const preview = page.getByTestId('calendar-import-result-preview')
          await expect(preview).toBeVisible()
          await step(
            '予定の取り込みのプレビューの結果（Storybook の CalendarImportPreview の Preview）を開いている',
          )
          await expect(page.getByTestId('calendar-import-count-needs_review')).toContainText(
            expected.count,
          )
          await expect(preview).toContainText(expected.review)
          await expect(page.getByTestId('calendar-import-remaining')).toContainText(
            `${expected.review}のうち`,
          )
          await check(
            `件数の見出しが「${expected.count}」、一覧の見出しと残りの件数の文が「${expected.review}」で出る`,
          )
        },
      )
    })

    test(`${prefix}カレンダーを結び付けるダイアログを開いた場合、ボタンが「${expected.check}」で出ること`, async ({
      browser,
    }) => {
      const url = storyUrl('画面-calendar-calendarlinkdialog--default')
      await recordPrEvidence(
        browser,
        {
          name: 'wording-link-check',
          title: 'カレンダーを結び付けるダイアログで、読めるかを調べるボタンの文言を見る',
          actor: ACTOR,
          variant,
        },
        async (page) => {
          await page.goto(url)
        },
        async ({ page, step, check }) => {
          await page.goto(url)
          await expect(page.getByTestId('calendar-link-dialog')).toBeVisible()
          await step(
            'カレンダーを結び付けるダイアログ（Storybook の CalendarLinkDialog の Default）を開いている',
          )
          await expect(page.getByTestId('calendar-link-check')).toHaveText(expected.check)
          await check(`ボタンが「${expected.check}」で出る`)
        },
      )
    })
  }
})
