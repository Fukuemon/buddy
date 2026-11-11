import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import {
  createNormalSchedule,
  createOvernightSchedule,
  createWeeklyOvernightSchedule,
} from '../../fixtures/schedule'
import { issueManagerToken, newStaff, registerStaffId, STAFF_FORM } from '../../fixtures/staff'

/** 残る予定を作る日。今日より後にする。2030 年 1 月 8 日は火曜日である。 */
const OVERNIGHT_DATE = '2030-01-08'
const RECURRING_DATE = '2030-01-09'
const SAME_DAY_DATE = '2030-01-10'

/** 予定の API の作成のレスポンスが 201 であることを確認し、作った予定の ID を返す。 */
const idOf = async (res: Awaited<ReturnType<typeof createNormalSchedule>>) => {
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: string }).id
}

/** マネージャーのトークンで職員を 1 人登録し、トークンと職員の ID と名前を返す。 */
const register = async (request: APIRequestContext, label: string) => {
  const token = await issueManagerToken()
  const staff = newStaff(label)
  return { token, id: await registerStaffId(request, token, staff), name: staff.name }
}

/**
 * 撮影の前に職員を 1 人登録し、翌日に終わる単発の予定と、翌日に終わる毎週の予定を割り振る。
 * 職員の ID と名前と、予定の ID を返す。
 */
const prepareOvernightStaff = async (request: APIRequestContext) => {
  const { token, id, name } = await register(request, 'overnight')
  const slot = (date: string, title: string) => ({ staffId: id, date, title })
  const overnight = await idOf(
    await createOvernightSchedule(
      request,
      token,
      STAFF_FORM.facilityId,
      slot(OVERNIGHT_DATE, '夜勤'),
    ),
  )
  const recurring = await idOf(
    await createWeeklyOvernightSchedule(
      request,
      token,
      STAFF_FORM.facilityId,
      slot(RECURRING_DATE, '毎週の夜勤'),
    ),
  )
  return { id, name, overnight, recurring }
}

/** 撮影の前に職員を 1 人登録し、同じ日に終わる単発の予定だけを割り振る。職員の ID と名前と、予定の ID を返す。 */
const prepareSameDayStaff = async (request: APIRequestContext) => {
  const { token, id, name } = await register(request, 'sameday')
  const sameDay = await idOf(
    await createNormalSchedule(request, token, STAFF_FORM.facilityId, {
      staffId: id,
      date: SAME_DAY_DATE,
      title: '日勤',
    }),
  )
  return { id, name, sameDay }
}

/** 職員の一覧を開き、表が出るまで待つ。 */
const openStaffList = async (page: Page) => {
  await page.goto('/staff')
  await expect(page.getByTestId('staff-list-table')).toBeVisible()
}

/** 職員の詳細を開き、「…」のメニューから休職のダイアログを開く。 */
const openLeaveDialog = async (page: Page, staffId: string) => {
  await page.goto(`/staff/${staffId}`)
  await page.getByTestId('staff-detail-menu').click()
  await page.getByTestId('staff-detail-leave').click()
  await expect(page.getByTestId('staff-leave-assignments')).toBeVisible()
}

// 改修前は終了の時刻に「翌」が付かない。確認する関数は「翌」の有無を問わずに時刻の範囲を見て、違いは判定のスクリーンショットを並べて比べる
test.describe('職員の詳細', () => {
  test.describe('残る予定の時刻の範囲', () => {
    test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`, () => {
      test.use({ storageState: LOGIN_STATE })

      test(
        'staff-remaining-next-day 翌日に終わる単発の予定と繰り返しの予定が残る職員の休職のダイアログを開いた場合、終了の時刻に「翌」が付くこと',
        { tag: '@compare' },
        async ({ context, request }) => {
          const staff = await prepareOvernightStaff(request)

          const page = await context.newPage()
          await openStaffList(page)
          await intro(
            page,
            `翌日に終わる予定が残る職員の休職のダイアログで、終了の時刻に「翌」が付く\n前提 撮影の前に ${staff.name} を登録し、22:00 から翌日の 01:00 の単発の予定と毎週の予定を割り振った`,
          )

          await step(page, '職員の詳細を開き、「…」から「休職にする」を押す', () =>
            openLeaveDialog(page, staff.id),
          )
          const schedule = page.getByTestId(`staff-leave-assignment-schedule-${staff.overnight}`)
          const recurring = page.getByTestId(`staff-leave-assignment-recurring-${staff.recurring}`)
          await check(
            page,
            '単発は「2030年1月8日（火） 22:00〜翌 01:00」、繰り返しは「2030年1月9日（水）から終了日なし、22:00〜翌 01:00」と出る。時刻の範囲は折り返さない',
            async () => {
              await expect(schedule).toContainText(/2030年1月8日（火） 22:00〜(翌 )?01:00/)
              await expect(recurring).toContainText(
                /2030年1月9日（水）から終了日なし、22:00〜(翌 )?01:00/,
              )
              await recurring.scrollIntoViewIfNeeded()
            },
          )
        },
      )

      test(
        'staff-remaining-same-day 同じ日に終わる予定が残る職員の休職のダイアログを開いた場合、終了の時刻に「翌」が付かないこと',
        { tag: '@compare' },
        async ({ context, request }) => {
          const staff = await prepareSameDayStaff(request)

          const page = await context.newPage()
          await openStaffList(page)
          await intro(
            page,
            `同じ日に終わる予定が残る職員の休職のダイアログで、終了の時刻に「翌」が付かない\n前提 撮影の前に ${staff.name} を登録し、10:00 から 11:00 の単発の予定を割り振った`,
          )

          await step(page, '職員の詳細を開き、「…」から「休職にする」を押す', () =>
            openLeaveDialog(page, staff.id),
          )
          const schedule = page.getByTestId(`staff-leave-assignment-schedule-${staff.sameDay}`)
          await check(
            page,
            '同じ日に終わる予定は「2030年1月10日（木） 10:00〜11:00」と出て、「翌」が付かない',
            async () => {
              await expect(schedule).toContainText('2030年1月10日（木） 10:00〜11:00')
              await schedule.scrollIntoViewIfNeeded()
            },
          )
        },
      )
    })
  })
})
