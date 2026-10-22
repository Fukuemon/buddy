import { expect, test, type Page } from '@playwright/test'

import {
  EVIDENCE_VARIANTS,
  PHONE_VIEWPORT,
  recordPrEvidence,
  storyUrl,
} from '../../fixtures/evidence'

const ACTOR = 'ログインなし（Storybook の story）'
const VISIT_URL = storyUrl('画面-schedule-scheduledetailmodal--visit')
const NORMAL_URL = storyUrl('画面-schedule-scheduledetailmodal--normal')

const openDetail = (url: string) => async (page: Page) => {
  await page.goto(url)
  await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
}

test.describe('予定のカレンダー', () => {
  test.describe('予定の詳細の節', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      const isBefore = variant.name === 'before'

      test(`${prefix}訪問の予定の詳細を開いた場合、日時の見出しと、訪問の情報の節とメモの節が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-detail-visit-sections',
            title: '訪問の予定の詳細を開き、日時の見出しと節の分け方を見る',
            actor: ACTOR,
            variant,
          },
          openDetail(VISIT_URL),
          async ({ page, step, check }) => {
            await openDetail(VISIT_URL)(page)
            await step('訪問の予定の詳細（Storybook の ScheduleDetailModal の Visit）を開いている')
            const datetime = page.getByTestId('schedule-detail-datetime')
            if (isBefore) {
              await expect(datetime).toHaveText('2026-10-20 09:00 - 09:29')
              await check('日時は項目の 1 つとして並び、利用者、サービスコード、メモが 1 列に続く')
              return
            }
            await expect(datetime).toHaveText('2026年10月20日（火） 09:00〜09:29')
            await expect(page.getByTestId('schedule-detail-visit')).toContainText('加藤 春子')
            await check(
              '日時と曜日が見出しになり、利用者、サービスコード、訪問の種類が「訪問の情報」の節に 2 列でまとまり、メモが最後の節に出る',
            )
          },
        )
      })

      test(`${prefix}通常の予定の詳細を開いた場合、訪問の情報の節が出ないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-detail-normal-sections',
            title: '通常の予定の詳細を開き、節の分け方を見る',
            actor: ACTOR,
            variant,
          },
          openDetail(NORMAL_URL),
          async ({ page, step, check }) => {
            await openDetail(NORMAL_URL)(page)
            await step('通常の予定の詳細（Storybook の ScheduleDetailModal の Normal）を開いている')
            await expect(page.getByTestId('schedule-detail-visit')).toHaveCount(0)
            await check(
              isBefore
                ? '種類、タイトル、日時、予定者、メモが 1 列に並ぶ'
                : '日時の見出しの下に種類、タイトル、予定者が並び、訪問の情報の節は出ず、メモの節が出る',
            )
          },
        )
      })

      test(`${prefix}スマートフォンの幅で訪問の予定の詳細を開いた場合、訪問の情報が 1 列で出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-detail-visit-phone',
            title: 'スマートフォンの幅で、訪問の予定の詳細を開く',
            actor: ACTOR,
            variant,
            viewport: PHONE_VIEWPORT,
          },
          openDetail(VISIT_URL),
          async ({ page, step, check }) => {
            await openDetail(VISIT_URL)(page)
            await step('幅 390px で、訪問の予定の詳細を開いている')
            if (isBefore) {
              await check('項目が 1 列に並ぶ')
              return
            }
            await expect(page.getByTestId('schedule-detail-visit')).toBeVisible()
            await check('訪問の情報の 3 つの項目が、1 列で縦に並ぶ')
          },
        )
      })
    }
  })
})
