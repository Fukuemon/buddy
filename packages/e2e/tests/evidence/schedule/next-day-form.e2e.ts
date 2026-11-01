import { type Page, expect, test } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { LOGIN_EMAIL, LOGIN_STAFF, SEED_PATIENT } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { createOvernightSchedule } from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'
import { calendarTimeLabel } from '../../selectors/scheduleCalendar'

/**
 * test ごとの予定の日（火曜）。ほかの test で作った予定と重ならないよう、週を分ける。
 */
const VISIT_DATE = '2026-12-01'
const NORMAL_DATE = '2026-12-08'
const EDIT_DATE = '2026-12-15'
const ACTOR = `${LOGIN_STAFF.name}（マネージャー）`

const signIn = async (page: Page) => {
  await page.goto('/schedule')
  await signInAtBroker(page, LOGIN_EMAIL)
}

/** 日の表示を開き、予定の一覧が届いて列が出るまで待つ。 */
const openDayView = async (page: Page) => {
  await page.goto('/schedule?view=day')
  await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
}

/** 週の表示で date の週を開き、時刻の列が出るまで待つ。 */
const openWeekView = async (page: Page, date: string) => {
  await page.goto(`/schedule?view=week&date=${date}`)
  await expect(calendarTimeLabel(page, '06:00:00')).toBeInViewport()
}

/** 「作成」を押し、フォームが閉じるまで待つ。 */
const submitCreate = async (page: Page) => {
  await page.getByTestId('schedule-create-submit').click()
  await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
}

/**
 * カレンダーに描かれた、text を含む予定を指す。日をまたぐ予定は、開始の日と翌日の 2 つを指す。
 * web は予定の API をサーバーの関数から呼び、作った予定の ID をブラウザに出さないので、文字で探す。
 */
const eventsWithText = (page: Page, text: string) =>
  page.getByTestId(/^schedule-event-/).filter({ hasText: text })

test.describe('予定のカレンダー', () => {
  test.describe('翌日に終わる予定の作成と編集', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}23 時から 90 分の訪問の予定を作った場合、カレンダーの開始の日と翌日に予定が描かれること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-form-overnight-visit-saved',
            title:
              '23 時から 90 分の訪問の予定を作ると、カレンダーの開始の日の 23 時から 24 時と、翌日の 0 時から 0 時 30 分に予定が描かれる',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check }) => {
            await openDayView(page)
            await step('予定のカレンダーを日の表示で開いている')

            await step('「予定を作成」を押し、訪問の予定でサービスコードの「医」を選ぶ')
            await page.getByTestId('schedule-create-open').click()
            await page.getByTestId('schedule-kind-tab-visit').check()
            await page.getByTestId('service-code-医').check()

            await step(`利用者に ${SEED_PATIENT.name}、予定者に ${LOGIN_STAFF.name} を選ぶ`)
            await page.getByTestId('schedule-field-patient').click()
            await page.getByTestId(`patient-select-option-${SEED_PATIENT.id}`).check()
            await page.getByTestId('schedule-field-staff').click()
            await page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`).check()

            await step('訪問日を 2026-12-01、開始時間を 23:00、提供時間を 90 分にして、作成する')
            await page.getByTestId('schedule-field-date-time').click()
            await page.getByTestId('schedule-form-date').fill(VISIT_DATE)
            await page.getByTestId('schedule-form-start-time').fill('23:00')
            await page.getByTestId('schedule-form-service-time').fill('90')
            await expect(page.getByTestId('schedule-form-end-time')).toHaveText('終了時間 翌 00:30')
            await submitCreate(page)

            await step('2026年12月1日（火）の週を、週の表示で開く')
            await openWeekView(page, VISIT_DATE)
            const segments = eventsWithText(page, `${SEED_PATIENT.name} 訪問`)
            await expect(segments).toHaveCount(2)

            await step('カレンダーを下へ送り、12月1日（火）の 23 時を出す')
            await segments.first().scrollIntoViewIfNeeded()
            await expect(segments.first()).toBeInViewport()
            await expect(segments.first()).toContainText(`${SEED_PATIENT.name} 訪問`)
            await check('12月1日（火）の 23 時から 24 時に、作った訪問の予定が描かれる')

            await step('カレンダーを上へ送り、12月2日（水）の 0 時を出す')
            await segments.last().scrollIntoViewIfNeeded()
            await expect(segments.last()).toBeInViewport()
            await expect(segments.last()).toContainText(`${SEED_PATIENT.name} 訪問`)
            await check('12月2日（水）の 0 時から 0 時 30 分に、同じ訪問の予定が描かれる')
          },
        )
      })

      test(`${prefix}通常の予定の作成で、22 時から 1 時にし、翌日を選んで保存した場合、詳細に翌日の 1 時に終わる予定として出ること`, async ({
        browser,
      }) => {
        const title = '夜勤（翌日を選ぶ）'
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-form-overnight-normal-next-day',
            title:
              '通常の予定の作成で、22 時から 1 時にし、翌日を選んで保存すると、予定が作られ、詳細に翌日の 1 時に終わる予定として出る',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check }) => {
            await openDayView(page)
            await step('予定のカレンダーを日の表示で開いている')

            await step(
              `「予定を作成」を押し、通常の予定のタイトルに「${title}」と入れ、予定者を選ぶ`,
            )
            await page.getByTestId('schedule-create-open').click()
            await page.getByTestId('schedule-kind-tab-normal').check()
            await page.getByTestId('schedule-field-title').click()
            await page.getByTestId('schedule-form-title').fill(title)
            await page.getByTestId('schedule-field-staff').click()
            await page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`).check()

            await step(
              '予定日時で、日付を 2026-12-08、開始時間を 22:00、終了時間を 01:00 にし、「終了は翌日」を選ぶ',
            )
            await page.getByTestId('schedule-field-date-time').click()
            await page.getByTestId('schedule-form-date').fill(NORMAL_DATE)
            await page.getByTestId('schedule-form-start-time').fill('22:00')
            await page.getByTestId('schedule-form-end-time').fill('01:00')
            await page.getByTestId('schedule-form-ends-next-day').check()
            await expect(page.getByTestId('schedule-field-date-time')).toContainText(
              '22:00 - 翌 01:00',
            )

            await step('「作成」を押す')
            await submitCreate(page)

            await step('2026年12月8日（火）の週を週の表示で開き、作った予定を押す')
            await openWeekView(page, NORMAL_DATE)
            const segment = eventsWithText(page, title).first()
            await segment.scrollIntoViewIfNeeded()
            await segment.click()
            await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(
              '2026年12月8日（火） 22:00〜翌 01:00',
            )
            await check('予定の詳細が開き、日時が「2026年12月8日（火） 22:00〜翌 01:00」と出る')
          },
        )
      })

      test(`${prefix}22 時から翌日の 1 時までの予定の編集を開いた場合、「終了は翌日」が選ばれ、終了時間が 01:00 と出ること`, async ({
        browser,
        request,
      }) => {
        const title = '夜勤（編集）'
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-edit-overnight-normal',
            title:
              '22 時から翌日の 1 時までの予定の編集を開くと、「終了は翌日」が選ばれ、開始時間が 22:00、終了時間が 01:00 と出る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await signIn(page)
            const token = await issueAccessToken(request, LOGIN_EMAIL)
            const res = await createOvernightSchedule(request, token, STAFF_FORM.facilityId, {
              staffId: LOGIN_STAFF.id,
              title,
              date: EDIT_DATE,
            })
            expect(res.status()).toBe(201)
            return ((await res.json()) as { id: string }).id
          },
          async ({ page, step, check }, id) => {
            await openWeekView(page, EDIT_DATE)
            const segment = page.getByTestId(`schedule-event-${id}`).first()
            await segment.scrollIntoViewIfNeeded()
            await expect(segment).toBeInViewport()
            await step(
              `週の表示で、12月15日（火）の 22:00 から翌日の 01:00 までの「${title}」を出している`,
            )

            await step(`「${title}」を押し、予定の詳細の「編集」を押す`)
            await segment.click()
            await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(
              '2026年12月15日（火） 22:00〜翌 01:00',
            )
            await page.getByTestId('schedule-detail-edit').click()

            await step('予定日時を開く')
            await page.getByTestId('schedule-field-date-time').click()
            await expect(page.getByTestId('schedule-form-start-time')).toHaveValue('22:00')
            await expect(page.getByTestId('schedule-form-end-time')).toHaveValue('01:00')
            await expect(page.getByTestId('schedule-form-ends-next-day')).toBeChecked()
            await check('開始時間が 22:00、終了時間が 01:00 で、「終了は翌日」が選ばれている')
          },
        )
      })
    }
  })
})
