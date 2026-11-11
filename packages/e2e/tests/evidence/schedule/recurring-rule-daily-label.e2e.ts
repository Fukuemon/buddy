import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'

const DETAIL_DAILY_URL = storyUrl('画面-schedule-scheduledetailmodal--recurring-daily')
const DETAIL_BIWEEKLY_ALL_DAYS_URL = storyUrl(
  '画面-schedule-scheduledetailmodal--recurring-biweekly-all-days',
)
const FIELDS_DAILY_URL = storyUrl('画面-schedule-recurringrulefields--daily')
const CREATE_URL = storyUrl('画面-schedule-schedulecreatemodalcontainer--visit')

/** 月曜（1）から日曜（7）までの曜日。予定の作成のカスタムの毎週で、全てを選ぶ。 */
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]

/** 字幕の帯に隠れないように、story の中身を下へずらす。撮影のための操作である。 */
const shiftStory = (page: Page) =>
  page.addStyleTag({ content: '#storybook-root { padding-top: 72px; }' })

// 規則の文は、判定のスクリーンショットで読む。daily-label-create は改修前と並べて比べるので、
// 確認する関数は、改修前の曜日の並びの文も受け付ける
test.describe('繰り返しの規則の文', () => {
  test.describe('7 つの曜日の毎週の規則（ログインなし、Storybook の story）', () => {
    test('daily-label-detail 7 つの曜日で間隔 1 の繰り返しの予定の回を開いた場合、予定の詳細の繰り返しに規則の文が出ること', async ({
      page,
    }) => {
      await page.goto(DETAIL_DAILY_URL)
      await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
      await intro(
        page,
        '7 つの曜日で間隔 1 の、終了日のある繰り返しの予定の回を開くと、予定の詳細に規則の文が出る\n前提 予定の詳細（Storybook の ScheduleDetailModal の RecurringDaily）で、7 つの曜日の毎週、終了日 2027-03-31 の繰り返しの予定の回を開いている（架空のデータ）',
      )

      await check(page, '予定の詳細の「繰り返し」の行の文', () =>
        expect(page.getByTestId('schedule-detail-modal')).toBeVisible(),
      )
    })

    test('daily-label-preset 7 つの曜日で間隔 1 の規則で繰り返しの変更を開いた場合、選択肢の先頭に今の規則の文が出ること', async ({
      page,
    }) => {
      await page.goto(FIELDS_DAILY_URL)
      await shiftStory(page)
      const preset = page.getByTestId('recurring-rule-preset')
      await expect(preset).toBeVisible()
      await intro(
        page,
        '7 つの曜日で間隔 1 の規則で繰り返しの欄を開くと、今の規則の選択肢に規則の文が出る\n前提 繰り返しの欄（Storybook の RecurringRuleFields の Daily）で、7 つの曜日の毎週の規則を 2026-10-20（火曜）の回から開いている（架空のデータ）',
      )

      await check(page, '開いたときに選んでいる、今の規則の選択肢の文言', () =>
        expect(preset).toBeVisible(),
      )
    })

    test(
      'daily-label-create 予定の作成でカスタムの毎週の 7 つの曜日と終了日を選んだ場合、繰り返しの文の後ろに終了日が付くこと',
      { tag: '@compare' },
      async ({ page }) => {
        await page.goto(CREATE_URL)
        await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
        await intro(
          page,
          '予定の作成で、カスタムの毎週で 7 つの曜日を選び、終了日を入れると、繰り返しの文に終了日が付く\n前提 予定の作成（Storybook の ScheduleCreateModalContainer の Visit）を開いている（架空のデータ）',
        )

        await step(
          page,
          '繰り返しの予定にし、カスタムの毎週で 7 つの曜日を選び、終了日を 2027-03-31 にする',
          async () => {
            await page.getByTestId('schedule-field-recurrence').click()
            await page.getByTestId('schedule-form-repeats').check()
            await page.getByTestId('recurring-rule-preset').selectOption('custom')
            for (const day of ALL_DAYS) {
              await page.getByTestId(`recurring-rule-day-of-week-${day}`).check()
            }
            await page.getByTestId('recurring-rule-ends-on').check()
            await page.getByTestId('recurring-rule-end-date').fill('2027-03-31')
            await page.getByTestId('schedule-field-date-time').click()
          },
        )
        await check(
          page,
          '閉じた繰り返しの欄に、繰り返しの文「毎日（2027年3月31日（水）まで）」が出る',
          () =>
            expect(page.getByTestId('schedule-field-recurrence')).toContainText(
              /(毎日|毎週 月曜日、火曜日、水曜日、木曜日、金曜日、土曜日、日曜日)（2027年3月31日（水）まで）/,
            ),
        )
      },
    )

    test('daily-label-biweekly 7 つの曜日で間隔 2 の繰り返しの予定の回を開いた場合、予定の詳細の繰り返しに曜日の並びが出ること', async ({
      page,
    }) => {
      await page.goto(DETAIL_BIWEEKLY_ALL_DAYS_URL)
      await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
      await intro(
        page,
        '7 つの曜日で間隔 2 の繰り返しの予定の回を開くと、予定の詳細に隔週と 7 つの曜日が出る\n前提 予定の詳細（Storybook の ScheduleDetailModal の RecurringBiweeklyAllDays）で、7 つの曜日の隔週の繰り返しの予定の回を開いている（架空のデータ）',
      )

      await check(page, '予定の詳細の「繰り返し」の行の文', () =>
        expect(page.getByTestId('schedule-detail-modal')).toBeVisible(),
      )
    })
  })
})
