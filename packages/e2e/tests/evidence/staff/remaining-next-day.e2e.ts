import { expect, test, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import {
  createNormalSchedule,
  createOvernightSchedule,
  createWeeklyOvernightSchedule,
} from '../../fixtures/schedule'
import { issueManagerToken, newStaff, registerStaffId, STAFF_FORM } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/** 残る予定を作る日。今日より後にする。2030 年 1 月 8 日は火曜日である。 */
const OVERNIGHT_DATE = '2030-01-08'
const RECURRING_DATE = '2030-01-09'
const SAME_DAY_DATE = '2030-01-10'

/** 予定の API の作成のレスポンスが 201 であることを確認し、作った予定の ID を返す。 */
const idOf = async (res: Awaited<ReturnType<typeof createNormalSchedule>>) => {
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: string }).id
}

/** マネージャーでログインし、職員を 1 人登録して、トークンと職員の ID と名前を返す。 */
const signInAndRegister = async (page: Page, label: string) => {
  await page.goto('/staff')
  await signInAtBroker(page, LOGIN_EMAIL)
  const token = await issueManagerToken(page.request)
  const staff = newStaff(label)
  return { token, id: await registerStaffId(page.request, token, staff), name: staff.name }
}

/**
 * 撮影の前に職員を 1 人登録し、翌日に終わる単発の予定と、翌日に終わる毎週の予定を割り振る。
 * 職員の ID と名前と、予定の ID を返す。
 */
const prepareOvernightStaff = async (page: Page) => {
  const { token, id, name } = await signInAndRegister(page, 'overnight')
  const slot = (date: string, title: string) => ({ staffId: id, date, title })
  const overnight = await idOf(
    await createOvernightSchedule(
      page.request,
      token,
      STAFF_FORM.facilityId,
      slot(OVERNIGHT_DATE, '夜勤'),
    ),
  )
  const recurring = await idOf(
    await createWeeklyOvernightSchedule(
      page.request,
      token,
      STAFF_FORM.facilityId,
      slot(RECURRING_DATE, '毎週の夜勤'),
    ),
  )
  return { id, name, overnight, recurring }
}

/** 撮影の前に職員を 1 人登録し、同じ日に終わる単発の予定だけを割り振る。職員の ID と名前と、予定の ID を返す。 */
const prepareSameDayStaff = async (page: Page) => {
  const { token, id, name } = await signInAndRegister(page, 'sameday')
  const sameDay = await idOf(
    await createNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
      staffId: id,
      date: SAME_DAY_DATE,
      title: '日勤',
    }),
  )
  return { id, name, sameDay }
}

/** 職員の詳細を開き、「…」のメニューから休職のダイアログを開く。 */
const openLeaveDialog = async (page: Page, staffId: string) => {
  await page.goto(`/staff/${staffId}`)
  await page.getByTestId('staff-detail-menu').click()
  await page.getByTestId('staff-detail-leave').click()
  await expect(page.getByTestId('staff-leave-assignments')).toBeVisible()
}

test.describe('職員の詳細', () => {
  test.describe('残る予定の時刻の範囲', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      const isBefore = variant.name === 'before'

      test(`${prefix}翌日に終わる単発の予定と繰り返しの予定が残る職員の休職のダイアログを開いた場合、終了の時刻に「翌」が付くこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'staff-remaining-next-day',
            title: '翌日に終わる予定が残る職員の休職のダイアログで、終了の時刻に「翌」が付く',
            actor: MANAGER,
            variant,
          },
          prepareOvernightStaff,
          async ({ page, step, check }, staff) => {
            await step(
              `撮影の前に ${staff.name} を登録し、22:00 から翌日の 01:00 の単発の予定と毎週の予定を割り振った`,
            )
            await step('職員の詳細を開き、「…」から「休職にする」を押す')
            await openLeaveDialog(page, staff.id)
            const schedule = page.getByTestId(`staff-leave-assignment-schedule-${staff.overnight}`)
            const recurring = page.getByTestId(
              `staff-leave-assignment-recurring-${staff.recurring}`,
            )
            const next = isBefore ? '' : '翌 '
            const scheduleText = `2030年1月8日（火） 22:00〜${next}01:00`
            const recurringText = `2030年1月9日（水）から終了日なし、22:00〜${next}01:00`
            await expect(schedule).toContainText(scheduleText)
            await expect(recurring).toContainText(recurringText)
            await recurring.scrollIntoViewIfNeeded()
            await check(
              `${isBefore ? '改修前: ' : ''}単発は「${scheduleText}」、繰り返しは「${recurringText}」と出る${isBefore ? '' : '。時刻の範囲は折り返さない'}`,
            )
          },
        )
      })

      test(`${prefix}同じ日に終わる予定が残る職員の休職のダイアログを開いた場合、終了の時刻に「翌」が付かないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'staff-remaining-same-day',
            title: '同じ日に終わる予定が残る職員の休職のダイアログで、終了の時刻に「翌」が付かない',
            actor: MANAGER,
            variant,
          },
          prepareSameDayStaff,
          async ({ page, step, check }, staff) => {
            await step(
              `撮影の前に ${staff.name} を登録し、10:00 から 11:00 の単発の予定を割り振った`,
            )
            await step('職員の詳細を開き、「…」から「休職にする」を押す')
            await openLeaveDialog(page, staff.id)
            const schedule = page.getByTestId(`staff-leave-assignment-schedule-${staff.sameDay}`)
            await expect(schedule).toContainText('2030年1月10日（木） 10:00〜11:00')
            await schedule.scrollIntoViewIfNeeded()
            await check(
              `${isBefore ? '改修前: ' : ''}同じ日に終わる予定は「2030年1月10日（木） 10:00〜11:00」と出て、「翌」が付かない`,
            )
          },
        )
      })
    }
  })
})
