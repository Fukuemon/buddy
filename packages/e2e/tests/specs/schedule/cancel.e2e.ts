import { expect, test, type Page } from '@playwright/test'

import { daysFromToday, fromNextMonday } from '../../fixtures/date'
import { LOGIN_STAFF } from '../../fixtures/env'
import {
  createNormalSchedule,
  createWeeklyNormalSchedule,
  detailDateTimeText,
} from '../../fixtures/schedule'
import { issueManagerToken, STAFF_FORM } from '../../fixtures/staff'
import { openDay } from '../../screens/scheduleCalendar'
import { openDetail } from '../../screens/scheduleDetail'

/** 日の表示のログインした職員の列の、title の予定。キャンセルした予定の取り消し線の要素（-cancelled）は数えない。 */
const ownEvent = (page: Page, title: string) =>
  page
    .getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
    .getByTestId(/^schedule-event-(?!.*-cancelled$)/)
    .filter({ hasText: title })

/**
 * 青木 陽菜の、date の start〜end の通常の予定 title を作り、予定の ID を返す。
 * トークンは issueManagerToken で worker の中で使い回す。ブローカーはログインの試行の回数を制限し、増やすと後の spec のログインが拒まれる。
 */
const createOwnSchedule = async (
  page: Page,
  schedule: { title: string; date: string; start: string; end: string },
) => {
  const res = await createNormalSchedule(
    page.request,
    await issueManagerToken(),
    STAFF_FORM.facilityId,
    { staffId: LOGIN_STAFF.id, ...schedule },
  )
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: string }).id
}

/** 開いている予定の詳細から、日時 datetime の確認のダイアログを確認してから、理由 reason でキャンセルする。 */
const cancelOpened = async (page: Page, datetime: string, reason: string) => {
  await page.getByTestId('schedule-detail-cancel-schedule').click()
  const dialog = page.getByTestId('schedule-cancel-dialog')
  await expect(dialog).toContainText('この予定をキャンセルしますか')
  await expect(dialog.getByTestId('schedule-cancel-datetime')).toHaveText(datetime)
  await expect(dialog.getByTestId('schedule-cancel-submit')).toBeDisabled()
  await dialog.getByTestId('schedule-cancel-reason').fill(reason)
  await dialog.getByTestId('schedule-cancel-submit').click()
}

test.describe('予定の詳細', () => {
  test.describe('予定のキャンセル', () => {
    test('単発の予定を理由を入れてキャンセルした場合、カレンダーから消え、キャンセルした予定を出すと取り消し線で出て、詳細に理由が出て編集できないこと', async ({
      page,
    }) => {
      const stamp = Date.now()
      const title = `E2E のキャンセルする予定 ${stamp}`
      const kept = `E2E のキャンセルしない予定 ${stamp}`
      const reason = `利用者の都合 ${stamp}`
      const date = daysFromToday(1)
      const id = await createOwnSchedule(page, { title, date, start: '13:00', end: '14:00' })
      await createOwnSchedule(page, { title: kept, date, start: '15:00', end: '16:00' })

      await openDetail(page, id, date)
      await cancelOpened(page, detailDateTimeText(date, '13:00', '14:00'), reason)

      // 一覧を読み終える前の空の列で「無い」と判定しないよう、同じ日に残す予定が出るのを待つ
      await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()
      await expect(ownEvent(page, kept)).toBeVisible()
      await expect(ownEvent(page, title)).toHaveCount(0)

      await page.getByTestId('calendar-show-cancelled').check()
      await expect(ownEvent(page, title).getByTestId(/-cancelled$/)).toBeVisible()
      await expect(ownEvent(page, kept).getByTestId(/-cancelled$/)).toHaveCount(0)

      await openDetail(page, id, date)
      await expect(page.getByTestId('schedule-detail-cancel')).toHaveText(
        `キャンセルした予定です。理由: ${reason}`,
      )
      await expect(page.getByTestId('schedule-detail-modal')).toContainText(title)
      await expect(page.getByTestId('schedule-detail-edit')).toHaveCount(0)
      await expect(page.getByTestId('schedule-detail-cancel-schedule')).toHaveCount(0)
    })

    test('キャンセルの確認で「戻る」を押した場合、予定はキャンセルされずに詳細に戻ること', async ({
      page,
    }) => {
      const title = `E2E のキャンセルを戻す予定 ${Date.now()}`
      const date = daysFromToday(1)
      const id = await createOwnSchedule(page, { title, date, start: '13:00', end: '14:00' })

      await openDetail(page, id, date)
      await page.getByTestId('schedule-detail-cancel-schedule').click()
      await page.getByTestId('schedule-cancel-reason').fill('入れたが戻す理由')
      await page.getByTestId('schedule-cancel-cancel').click()

      await expect(page.getByTestId('schedule-cancel-dialog')).toBeHidden()
      await expect(page.getByTestId('schedule-detail-cancel-schedule')).toBeVisible()
      await expect(page.getByTestId('schedule-detail-cancel')).toHaveCount(0)
      await page.getByTestId('schedule-detail-close').click()
      await expect(ownEvent(page, title)).toBeVisible()
    })

    test('毎週の繰り返しの予定の 1 回をキャンセルした場合、その回だけが消えてキャンセルした予定を出すと出て、前後の週の回は残ること', async ({
      page,
    }) => {
      const stamp = Date.now()
      const title = `E2E の回をキャンセルする定例 ${stamp}`
      const kept = `E2E の回をキャンセルする日の予定 ${stamp}`
      const cancelDate = fromNextMonday(7)
      // 予定の削除の spec の毎週の予定（10:00）と重なると回を押せないので、時刻をずらす
      const weekly = await createWeeklyNormalSchedule(
        page.request,
        await issueManagerToken(),
        STAFF_FORM.facilityId,
        { staffId: LOGIN_STAFF.id, title, date: fromNextMonday(0), start: '14:00', end: '15:00' },
      )
      expect(weekly.status()).toBe(201)
      await createOwnSchedule(page, { title: kept, date: cancelDate, start: '16:00', end: '17:00' })

      await openDay(page, cancelDate, LOGIN_STAFF.id)
      await ownEvent(page, title).click()
      await expect(page.getByTestId('schedule-detail-recurrence')).toBeVisible()
      await cancelOpened(page, detailDateTimeText(cancelDate, '14:00', '15:00'), '利用者の入院')

      // 一覧を読み終える前の空の列で「無い」と判定しないよう、同じ日に残す予定が出るのを待つ
      await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()
      await expect(ownEvent(page, kept)).toBeVisible()
      await expect(ownEvent(page, title)).toHaveCount(0)
      await page.getByTestId('calendar-show-cancelled').check()
      await expect(ownEvent(page, title).getByTestId(/-cancelled$/)).toBeVisible()

      await openDay(page, fromNextMonday(0), LOGIN_STAFF.id)
      await expect(ownEvent(page, title)).toBeVisible()
      await openDay(page, fromNextMonday(14), LOGIN_STAFF.id)
      await expect(ownEvent(page, title)).toBeVisible()
    })
  })
})
