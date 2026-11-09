import { expect, test, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'

const ACTOR = 'ログインなし（Storybook の story）'
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

test.describe('繰り返しの規則の文', () => {
  test.describe('7 つの曜日の毎週の規則', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}7 つの曜日で間隔 1 の繰り返しの予定の回を開いた場合、予定の詳細の繰り返しに規則の文が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'daily-label-detail',
            title:
              '7 つの曜日で間隔 1 の、終了日のある繰り返しの予定の回を開くと、予定の詳細に規則の文が出る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await page.goto(DETAIL_DAILY_URL)
          },
          async ({ page, step, check }) => {
            await page.goto(DETAIL_DAILY_URL)
            await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
            await step(
              '予定の詳細（Storybook の ScheduleDetailModal の RecurringDaily）で、7 つの曜日の毎週、終了日 2027-03-31 の繰り返しの予定の回を開いている（架空のデータ）',
            )
            await check('予定の詳細の「繰り返し」の行の文')
          },
        )
      })

      test(`${prefix}7 つの曜日で間隔 1 の規則で繰り返しの変更を開いた場合、選択肢の先頭に今の規則の文が出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'daily-label-preset',
            title:
              '7 つの曜日で間隔 1 の規則で繰り返しの欄を開くと、今の規則の選択肢に規則の文が出る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await page.goto(FIELDS_DAILY_URL)
          },
          async ({ page, step, check }) => {
            await page.goto(FIELDS_DAILY_URL)
            await shiftStory(page)
            const preset = page.getByTestId('recurring-rule-preset')
            await expect(preset).toBeVisible()
            await step(
              '繰り返しの欄（Storybook の RecurringRuleFields の Daily）で、7 つの曜日の毎週の規則を 2026-10-20（火曜）の回から開いている（架空のデータ）',
            )
            await check('開いたときに選んでいる、今の規則の選択肢の文言')
          },
        )
      })

      test(`${prefix}予定の作成でカスタムの毎週の 7 つの曜日と終了日を選んだ場合、繰り返しの文の後ろに終了日が付くこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'daily-label-create',
            title:
              '予定の作成で、カスタムの毎週で 7 つの曜日を選び、終了日を入れると、繰り返しの文に終了日が付く',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await page.goto(CREATE_URL)
          },
          async ({ page, step, check }) => {
            await page.goto(CREATE_URL)
            await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
            await step(
              '予定の作成（Storybook の ScheduleCreateModalContainer の Visit）で、繰り返しの予定にし、カスタムの毎週で 7 つの曜日を選び、終了日を 2027-03-31 にする（架空のデータ）',
            )
            await page.getByTestId('schedule-field-recurrence').click()
            await page.getByTestId('schedule-form-repeats').check()
            await page.getByTestId('recurring-rule-preset').selectOption('custom')
            for (const day of ALL_DAYS) {
              await page.getByTestId(`recurring-rule-day-of-week-${day}`).check()
            }
            await page.getByTestId('recurring-rule-ends-on').check()
            await page.getByTestId('recurring-rule-end-date').fill('2027-03-31')
            await page.getByTestId('schedule-field-date-time').click()
            await expect(page.getByTestId('schedule-field-recurrence')).toContainText(
              variant.name === 'before'
                ? '毎週 月曜日、火曜日、水曜日、木曜日、金曜日、土曜日、日曜日（2027年3月31日（水）まで）'
                : '毎日（2027年3月31日（水）まで）',
            )
            await check('閉じた繰り返しの欄に出る、繰り返しの文')
          },
        )
      })

      test(`${prefix}7 つの曜日で間隔 2 の繰り返しの予定の回を開いた場合、予定の詳細の繰り返しに曜日の並びが出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'daily-label-biweekly',
            title:
              '7 つの曜日で間隔 2 の繰り返しの予定の回を開くと、予定の詳細に隔週と 7 つの曜日が出る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await page.goto(DETAIL_BIWEEKLY_ALL_DAYS_URL)
          },
          async ({ page, step, check }) => {
            await page.goto(DETAIL_BIWEEKLY_ALL_DAYS_URL)
            await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
            await step(
              '予定の詳細（Storybook の ScheduleDetailModal の RecurringBiweeklyAllDays）で、7 つの曜日の隔週の繰り返しの予定の回を開いている（架空のデータ）',
            )
            await check('予定の詳細の「繰り返し」の行の文')
          },
        )
      })
    }
  })
})
