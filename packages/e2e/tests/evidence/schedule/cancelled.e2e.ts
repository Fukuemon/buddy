import { expect, test, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'

const ACTOR = 'ログインなし（Storybook の story）'
const DAY_URL = storyUrl('画面-schedule-schedulepagelayout--day')
const DAY_WITH_CANCELLED_URL = storyUrl('画面-schedule-schedulepagelayout--day-with-cancelled')
const DETAIL_URL = storyUrl('画面-schedule-scheduledetailmodalcontainer--cancelled')

const openDay = (url: string) => async (page: Page) => {
  await page.goto(url)
  await expect(page.getByTestId('staff-schedule-day-grid')).toBeVisible()
}

test.describe('予定のカレンダー', () => {
  test.describe('キャンセルした予定の表示', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}切り替えを入れた場合、キャンセルした予定が取り消し線と「キャンセル」の印で出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-cancelled-toggle',
            title: '日の表示で「キャンセルした予定を出す」を入れ、キャンセルした予定を見る',
            actor: ACTOR,
            variant,
          },
          openDay(DAY_URL),
          async ({ page, step, check }) => {
            await openDay(DAY_URL)(page)
            await step(
              '予定のカレンダーの日の表示（Storybook の SchedulePageLayout の Day）を開いている。江藤 四郎の 11:00 の訪問はキャンセルした予定である（架空のデータ）',
            )
            const cancelled = page.getByTestId('schedule-event-schedule-6')
            // 予定が描かれてから、キャンセルした予定が無いことを確認する
            await expect(page.getByTestId('schedule-event-schedule-1')).toBeVisible()
            await expect(page.getByTestId('calendar-show-cancelled')).not.toBeChecked()
            await expect(cancelled).toHaveCount(0)
            await check('切り替えが外れている間は、キャンセルした予定が出ない')

            await step('左のサイドバーの「キャンセルした予定を出す」を入れる')
            await page.getByTestId('calendar-show-cancelled').check()
            await expect(cancelled).toBeVisible()
            await expect(cancelled).toContainText('キャンセル')
            await expect(page.getByTestId('schedule-event-schedule-6-cancelled')).toHaveCSS(
              'text-decoration-line',
              'line-through',
            )
            await check(
              '江藤 四郎の列に、薄い灰色の面に「キャンセル」の印と取り消し線を付けた予定が出る',
            )
          },
        )
      })

      test(`${prefix}URL で切り替えを入れて開いた場合、キャンセルした予定が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-cancelled-url',
            title: 'URL の cancelled=true で日の表示を開く（再読み込みしたときと同じ）',
            actor: ACTOR,
            variant,
          },
          openDay(DAY_WITH_CANCELLED_URL),
          async ({ page, step, check }) => {
            await openDay(DAY_WITH_CANCELLED_URL)(page)
            await step(
              '`/schedule?view=day&cancelled=true` を開いている（Storybook の SchedulePageLayout の DayWithCancelled）',
            )
            await expect(page.getByTestId('calendar-show-cancelled')).toBeChecked()
            await expect(page.getByTestId('schedule-event-schedule-6')).toBeVisible()
            await check('切り替えが入った状態で開き、キャンセルした予定が出る')
          },
        )
      })
    }
  })
})

test.describe('予定の詳細', () => {
  test.describe('キャンセルした予定の詳細', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}キャンセルした予定の詳細を開いた場合、キャンセルの理由が出て、編集のボタンが出ないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-cancelled-detail',
            title: 'キャンセルした予定の詳細を開く',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await page.goto(DETAIL_URL)
          },
          async ({ page, step, check }) => {
            await page.goto(DETAIL_URL)
            await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
            await step(
              'キャンセルした訪問の予定の詳細（Storybook の ScheduleDetailModalContainer の Cancelled。予定を取ってから出す）を開いている',
            )
            await expect(page.getByTestId('schedule-detail-cancel')).toHaveText(
              'キャンセルした予定です。理由: 利用者の体調不良',
            )
            await expect(page.getByTestId('schedule-detail-edit')).toHaveCount(0)
            await check(
              '先頭に「キャンセルした予定です。理由: 利用者の体調不良」が出て、編集のボタンが無い',
            )
          },
        )
      })
    }
  })
})
