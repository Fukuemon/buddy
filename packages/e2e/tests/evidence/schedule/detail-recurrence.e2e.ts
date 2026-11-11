import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import { HAYASHI, LOGIN_EMAIL, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { prepareOutsideRecording } from '../../fixtures/recording'
import {
  createMonthlyWeekdayNormalSchedule,
  createNormalSchedule,
  createWeeklyNormalSchedule,
  replaceOccurrence,
} from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'

/** 隔週の月曜と木曜の予定の最初の回の日（月曜）。 */
const BIWEEKLY_DATE = '2026-11-16'
/** 毎月の第 2 月曜の予定の最初の回の日と、終了日。 */
const MONTHLY_DATE = '2026-12-14'
const MONTHLY_END_DATE = '2027-03-31'
/** 単発の予定の日と、毎週の火曜の予定の最初の回の日と、置き換える回の日。 */
const SINGLE_DATE = '2026-11-18'
const WEEKLY_DATE = '2026-11-17'
const REPLACED_DATE = '2026-11-24'

/** 録画の外で、予定の API のトークンを取って setup を行う。予定の作成の画面からは繰り返しの予定を作れない。 */
const prepareByApi = (browser: Browser, setup: (page: Page, token: string) => Promise<void>) =>
  prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, async (page) =>
    setup(page, await issueAccessToken(page.request, LOGIN_EMAIL)),
  )

/** date の日の表示を開き、林の列の title の予定が出るまで待って、その予定を返す。 */
const showEvent = async (page: Page, date: string, title: string) => {
  await page.goto(`/schedule?view=day&date=${date}`)
  const event = page
    .getByTestId(`day-grid-staff-${HAYASHI.id}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: title })
  await expect(event).toBeVisible()
  await event.scrollIntoViewIfNeeded()
  return event
}

/** 予定 event を押して、予定の詳細が開くまで待つ。 */
const openDetail = async (page: Page, event: Locator) => {
  await event.click()
  await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
}

// 改修前は詳細に「繰り返し」の行が無く、確認が分かれるので、@compare を付けずに改修後の流れを撮る
test.describe('予定の詳細', () => {
  test.describe(`繰り返しの規則の行（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('detail-recurrence-biweekly 隔週の月曜と木曜の繰り返しの予定の回を開いた場合、予定の詳細に「隔週 月曜日、木曜日」が出ること', async ({
      browser,
      context,
    }) => {
      const title = `隔週の定例 ${Date.now()}`
      await prepareByApi(browser, async (page, token) => {
        const res = await createWeeklyNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
          staffId: HAYASHI.id,
          title,
          date: BIWEEKLY_DATE,
          rule: { days_of_week: [1, 4], interval: 2 },
        })
        expect(res.status()).toBe(201)
      })

      const page = await context.newPage()
      const event = await showEvent(page, BIWEEKLY_DATE, title)
      await intro(
        page,
        `隔週の月曜と木曜の繰り返しの予定の回を開くと、予定の詳細に規則が出る\n前提 予定の API で、${HAYASHI.name} の ${BIWEEKLY_DATE} から隔週の月曜と木曜の「${title}」を作った`,
      )

      await step(page, `${BIWEEKLY_DATE} の回を押して詳細を開く`, () => openDetail(page, event))
      await check(page, '「繰り返し」の行に「隔週 月曜日、木曜日」が出る', () =>
        expect(page.getByTestId('schedule-detail-recurrence')).toHaveText(
          '繰り返し隔週 月曜日、木曜日',
        ),
      )
    })

    test('detail-recurrence-monthly-end 終了日のある毎月の第 2 月曜の繰り返しの予定の回を開いた場合、予定の詳細に規則と終了日が出ること', async ({
      browser,
      context,
    }) => {
      const title = `月例の訪問の打ち合わせ ${Date.now()}`
      await prepareByApi(browser, async (page, token) => {
        const res = await createMonthlyWeekdayNormalSchedule(
          page.request,
          token,
          STAFF_FORM.facilityId,
          {
            staffId: HAYASHI.id,
            title,
            date: MONTHLY_DATE,
            dayOfWeek: 1,
            weekOfMonth: 2,
            endDate: MONTHLY_END_DATE,
          },
        )
        expect(res.status()).toBe(201)
      })

      const page = await context.newPage()
      const event = await showEvent(page, MONTHLY_DATE, title)
      await intro(
        page,
        `終了日のある毎月の第 2 月曜の繰り返しの予定の回を開くと、規則と終了日が出る\n前提 予定の API で、${HAYASHI.name} の ${MONTHLY_DATE} から ${MONTHLY_END_DATE} までの、毎月の第 2 月曜の「${title}」を作った`,
      )

      await step(page, `${MONTHLY_DATE} の回を押して詳細を開く`, () => openDetail(page, event))
      await check(
        page,
        '「繰り返し」の行に「毎月 第 2 月曜日（2027年3月31日（水）まで）」が出る',
        () =>
          expect(page.getByTestId('schedule-detail-recurrence')).toHaveText(
            '繰り返し毎月 第 2 月曜日（2027年3月31日（水）まで）',
          ),
      )
    })

    test('detail-recurrence-hidden 単発の予定と、1 回を置き換えた予定を開いた場合、「繰り返し」の行が出ないこと', async ({
      browser,
      context,
    }) => {
      const stamp = Date.now()
      const single = `単発の面談 ${stamp}`
      const weekly = `毎週の定例 ${stamp}`
      const replaced = `置き換えた定例 ${stamp}`
      await prepareByApi(browser, async (page, token) => {
        const created = await createNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
          staffId: HAYASHI.id,
          title: single,
          date: SINGLE_DATE,
        })
        expect(created.status()).toBe(201)
        const recurring = await createWeeklyNormalSchedule(
          page.request,
          token,
          STAFF_FORM.facilityId,
          { staffId: HAYASHI.id, title: weekly, date: WEEKLY_DATE },
        )
        expect(recurring.status()).toBe(201)
        const { id } = (await recurring.json()) as { id: string }
        const res = await replaceOccurrence(page.request, token, id, REPLACED_DATE, {
          staffId: HAYASHI.id,
          title: replaced,
          date: REPLACED_DATE,
        })
        expect(res.ok()).toBe(true)
      })

      const page = await context.newPage()
      const row = page.getByTestId('schedule-detail-recurrence')
      const singleEvent = await showEvent(page, SINGLE_DATE, single)
      await intro(
        page,
        `単発の予定と、1 回を置き換えた予定の詳細には、「繰り返し」の行が出ない\n前提 予定の API で、${HAYASHI.name} の ${SINGLE_DATE} の単発の予定「${single}」と、毎週の火曜の「${weekly}」を作り、${REPLACED_DATE} の回を「${replaced}」に置き換えた`,
      )

      await step(page, `${SINGLE_DATE} の単発の予定「${single}」を押して詳細を開く`, () =>
        openDetail(page, singleEvent),
      )
      await check(page, '単発の予定の詳細に、「繰り返し」の行が出ない', () =>
        expect(row).toHaveCount(0),
      )

      await step(
        page,
        `毎週の火曜の「${weekly}」の ${REPLACED_DATE} の回を置き換えた「${replaced}」を押して詳細を開く`,
        async () => openDetail(page, await showEvent(page, REPLACED_DATE, replaced)),
      )
      await check(page, '1 回を置き換えた予定の詳細に、「繰り返し」の行が出ない', () =>
        expect(row).toHaveCount(0),
      )
    })
  })
})
