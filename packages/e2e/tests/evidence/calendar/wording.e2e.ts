import { expect, test } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'
import { pageBody } from '../../selectors/page'

const ACTOR = 'ログインなし（Storybook の story）'

// 改修前は「確かめが要る予定」と「読めるか確かめる」、改修後は「確認が必要な予定」と「読めるか確認する」
const EXPECTED = {
  before: { review: '確かめが要る予定', check: '読めるか確かめる' },
  after: { review: '確認が必要な予定', check: '読めるか確認する' },
}

test.describe('カレンダーの連携と取り込みの文言', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''
    const expected = variant.name === 'before' ? EXPECTED.before : EXPECTED.after

    test(`${prefix}職員の管理の権限を持つ職員のナビゲーションを開いた場合、「${expected.review}」のリンクが出ること`, async ({
      browser,
    }) => {
      const url = storyUrl('画面-common-sitenav--import')
      await recordPrEvidence(
        browser,
        {
          name: 'wording-site-nav',
          title:
            '職員の管理の権限を持つ職員のナビゲーションで、食い違った予定の画面へのリンクの文言を見る',
          actor: ACTOR,
          variant,
        },
        async (page) => {
          await page.goto(url)
        },
        async ({ page, step, check }) => {
          await page.goto(url)
          const nav = page.getByTestId('site-nav')
          await expect(nav).toBeVisible()
          await step(
            '職員の管理の権限を持つ職員のナビゲーション（Storybook の SiteNav の Import）を開いている',
          )
          await expect(nav).toContainText(expected.review)
          await check(`ナビゲーションに「${expected.review}」のリンクが出る`)
        },
      )
    })

    test(`${prefix}食い違った予定の画面を開いた場合、見出しが「${expected.review}」で出ること`, async ({
      browser,
    }) => {
      const url = storyUrl('画面-calendar-calendarreviewview--default')
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
            '食い違った予定の画面（Storybook の CalendarReviewView の Default）を開いている',
          )
          await check(`見出しが「${expected.review}」で出る`)
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
          await expect(preview).toContainText(expected.review)
          await expect(page.getByTestId('calendar-import-remaining')).toContainText(
            `${expected.review}のうち`,
          )
          await check(`見出しと残りの件数の文が「${expected.review}」で出る`)
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
