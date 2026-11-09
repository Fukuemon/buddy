import { expect, test, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { HAYASHI, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import {
  createMonthlyWeekdayNormalSchedule,
  createNormalSchedule,
  createWeeklyNormalSchedule,
  replaceOccurrence,
} from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'

const ACTOR = `${LOGIN_STAFF.name}（マネージャー）`

/** 隔週の月曜と木曜の予定の最初の回の日（月曜）。 */
const BIWEEKLY_DATE = '2026-11-16'
/** 毎月の第 2 月曜の予定の最初の回の日と、終了日。 */
const MONTHLY_DATE = '2026-12-14'
const MONTHLY_END_DATE = '2027-03-31'
/** 単発の予定の日と、毎週の火曜の予定の最初の回の日と、置き換える回の日。 */
const SINGLE_DATE = '2026-11-18'
const WEEKLY_DATE = '2026-11-17'
const REPLACED_DATE = '2026-11-24'

/** ログインし、予定の API のトークンを返す。予定の作成の画面からは繰り返しの予定を作れない。 */
const signIn = async (page: Page) => {
  await page.goto('/schedule')
  await signInAtBroker(page, LOGIN_EMAIL)
  return issueAccessToken(page.request, LOGIN_EMAIL)
}

/** date の日の表示を開き、林の列の title の予定を押して、予定の詳細を開く。 */
const openDetail = async (page: Page, date: string, title: string) => {
  await page.goto(`/schedule?view=day&date=${date}`)
  const event = page
    .getByTestId(`day-grid-staff-${HAYASHI.id}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: title })
  await expect(event).toBeVisible()
  await event.scrollIntoViewIfNeeded()
  await event.click()
  await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
}

test.describe('予定の詳細', () => {
  test.describe('繰り返しの規則の行', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      const isBefore = variant.name === 'before'

      test(`${prefix}隔週の月曜と木曜の繰り返しの予定の回を開いた場合、予定の詳細に「隔週 月曜日、木曜日」が出ること`, async ({
        browser,
      }) => {
        const title = `隔週の定例 ${Date.now()}`
        await recordPrEvidence(
          browser,
          {
            name: 'detail-recurrence-biweekly',
            title: '隔週の月曜と木曜の繰り返しの予定の回を開くと、予定の詳細に規則が出る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            const token = await signIn(page)
            const res = await createWeeklyNormalSchedule(
              page.request,
              token,
              STAFF_FORM.facilityId,
              {
                staffId: HAYASHI.id,
                title,
                date: BIWEEKLY_DATE,
                rule: { days_of_week: [1, 4], interval: 2 },
              },
            )
            expect(res.status()).toBe(201)
          },
          async ({ page, step, check }) => {
            await step(
              `予定の API で、${HAYASHI.name} の ${BIWEEKLY_DATE} から隔週の月曜と木曜の「${title}」を作った。${BIWEEKLY_DATE} の回を押して詳細を開く`,
            )
            await openDetail(page, BIWEEKLY_DATE, title)
            const row = page.getByTestId('schedule-detail-recurrence')
            if (isBefore) {
              await expect(row).toHaveCount(0)
              await check('予定の詳細に、繰り返しの規則が出ない')
              return
            }
            await expect(row).toHaveText('繰り返し隔週 月曜日、木曜日')
            await check('「繰り返し」の行に「隔週 月曜日、木曜日」が出る')
          },
        )
      })

      test(`${prefix}終了日のある毎月の第 2 月曜の繰り返しの予定の回を開いた場合、予定の詳細に規則と終了日が出ること`, async ({
        browser,
      }) => {
        const title = `月例の訪問の打ち合わせ ${Date.now()}`
        await recordPrEvidence(
          browser,
          {
            name: 'detail-recurrence-monthly-end',
            title: '終了日のある毎月の第 2 月曜の繰り返しの予定の回を開くと、規則と終了日が出る',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            const token = await signIn(page)
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
          },
          async ({ page, step, check }) => {
            await step(
              `予定の API で、${HAYASHI.name} の ${MONTHLY_DATE} から ${MONTHLY_END_DATE} までの、毎月の第 2 月曜の「${title}」を作った。${MONTHLY_DATE} の回を押して詳細を開く`,
            )
            await openDetail(page, MONTHLY_DATE, title)
            const row = page.getByTestId('schedule-detail-recurrence')
            if (isBefore) {
              await expect(row).toHaveCount(0)
              await check('予定の詳細に、繰り返しの規則と終了日が出ない')
              return
            }
            await expect(row).toHaveText('繰り返し毎月 第 2 月曜日（2027年3月31日（水）まで）')
            await check('「繰り返し」の行に「毎月 第 2 月曜日（2027年3月31日（水）まで）」が出る')
          },
        )
      })

      test(`${prefix}単発の予定と、1 回を置き換えた予定を開いた場合、「繰り返し」の行が出ないこと`, async ({
        browser,
      }) => {
        const stamp = Date.now()
        const single = `単発の面談 ${stamp}`
        const weekly = `毎週の定例 ${stamp}`
        const replaced = `置き換えた定例 ${stamp}`
        await recordPrEvidence(
          browser,
          {
            name: 'detail-recurrence-hidden',
            title: '単発の予定と、1 回を置き換えた予定の詳細には、「繰り返し」の行が出ない',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            const token = await signIn(page)
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
          },
          async ({ page, step, check }) => {
            const row = page.getByTestId('schedule-detail-recurrence')
            await step(
              `予定の API で、${HAYASHI.name} の ${SINGLE_DATE} の単発の予定「${single}」を作った。押して詳細を開く`,
            )
            await openDetail(page, SINGLE_DATE, single)
            await expect(row).toHaveCount(0)
            await check('単発の予定の詳細に、「繰り返し」の行が出ない')

            await step(
              `毎週の火曜の「${weekly}」の ${REPLACED_DATE} の回を「${replaced}」に置き換えた。押して詳細を開く`,
            )
            await openDetail(page, REPLACED_DATE, replaced)
            await expect(row).toHaveCount(0)
            await check('1 回を置き換えた予定の詳細に、「繰り返し」の行が出ない')
          },
        )
      })
    }
  })
})
