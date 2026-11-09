import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { createNormalSchedule, createWeeklyNormalSchedule } from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'

/** 今日の Asia/Tokyo の日付から days 日後の日付（YYYY-MM-DD）。 */
const daysFromToday = (days: number) =>
  new Date(Date.now() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

/** 明日以降で最初の月曜の日付から、days 日後の日付（YYYY-MM-DD）。 */
const fromNextMonday = (days: number) => {
  const today = new Date(`${daysFromToday(0)}T00:00:00Z`).getUTCDay()
  return daysFromToday(((8 - today) % 7 || 7) + days)
}

/** 日の表示のログインした職員の列の、title の予定。 */
const ownEvent = (page: Page, title: string) =>
  page
    .getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: title })

const openDay = async (page: Page, date: string, { cancelled = false } = {}) => {
  await page.goto(`/schedule?view=day&date=${date}${cancelled ? '&cancelled=true' : ''}`)
  await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
}

/** 青木 陽菜の、date の通常の予定 title を作り、予定の ID を返す。 */
const createOwnSchedule = async (request: APIRequestContext, title: string, date: string) => {
  const token = await issueAccessToken(request, LOGIN_EMAIL)
  const res = await createNormalSchedule(request, token, STAFF_FORM.facilityId, {
    staffId: LOGIN_STAFF.id,
    title,
    date,
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: string }).id
}

// 同じ時刻のほかの spec の予定と重なり、カレンダーの予定を押せないことがあるので、詳細の URL を開く
const openDetail = async (page: Page, scheduleId: string, date: string) => {
  await page.goto(`/schedule/${scheduleId}?view=day&date=${date}`)
  await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
}

test.describe('予定の削除', () => {
  test('明日の予定の詳細で「予定を削除」から削除した場合、カレンダーから消え、キャンセルした予定を出しても出ないこと', async ({
    page,
    request,
  }) => {
    const title = `E2E の削除する予定 ${Date.now()}`
    const date = daysFromToday(1)
    const id = await createOwnSchedule(request, title, date)

    await openDetail(page, id, date)
    await page.getByTestId('schedule-detail-delete-schedule').click()
    await expect(page.getByTestId('schedule-delete-dialog')).toContainText('この予定を削除しますか')
    await page.getByTestId('schedule-delete-submit').click()

    await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()
    await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
    await expect(ownEvent(page, title)).toHaveCount(0)
    await openDay(page, date, { cancelled: true })
    await expect(ownEvent(page, title)).toHaveCount(0)
  })

  test('削除の確認で「戻る」を押した場合、予定は消えずに詳細に戻ること', async ({
    page,
    request,
  }) => {
    const title = `E2E の残す予定 ${Date.now()}`
    const date = daysFromToday(1)
    const id = await createOwnSchedule(request, title, date)

    await openDetail(page, id, date)
    await page.getByTestId('schedule-detail-delete-schedule').click()
    await page.getByTestId('schedule-delete-cancel').click()

    await expect(page.getByTestId('schedule-delete-dialog')).toBeHidden()
    await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
    await page.getByTestId('schedule-detail-close').click()
    await expect(ownEvent(page, title)).toBeVisible()
  })

  test('今日より前の予定の詳細を開いた場合、「予定をキャンセル」は出て「予定を削除」は出ないこと', async ({
    page,
    request,
  }) => {
    const date = daysFromToday(-1)
    const id = await createOwnSchedule(request, `E2E の昨日の予定 ${Date.now()}`, date)

    await openDetail(page, id, date)

    await expect(page.getByTestId('schedule-detail-cancel-schedule')).toBeVisible()
    await expect(page.getByTestId('schedule-detail-delete-schedule')).toHaveCount(0)
  })

  test('毎週の繰り返しの予定の回を削除した場合、その回だけが消え、前後の週の回は残ること', async ({
    page,
    request,
  }) => {
    const title = `E2E の回を削除する定例 ${Date.now()}`
    const token = await issueAccessToken(request, LOGIN_EMAIL)
    const created = await createWeeklyNormalSchedule(request, token, STAFF_FORM.facilityId, {
      staffId: LOGIN_STAFF.id,
      title,
      date: fromNextMonday(0),
    })
    expect(created.status()).toBe(201)

    await openDay(page, fromNextMonday(7))
    await ownEvent(page, title).click()
    await page.getByTestId('schedule-detail-delete-schedule').click()
    await expect(page.getByTestId('schedule-delete-description')).toContainText(
      '繰り返しの予定のうち、この日の回だけを消します。ほかの回は残ります。',
    )
    await page.getByTestId('schedule-delete-submit').click()

    await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()
    await expect(ownEvent(page, title)).toHaveCount(0)
    await openDay(page, fromNextMonday(0))
    await expect(ownEvent(page, title)).toBeVisible()
    await openDay(page, fromNextMonday(14))
    await expect(ownEvent(page, title)).toBeVisible()
  })
})
