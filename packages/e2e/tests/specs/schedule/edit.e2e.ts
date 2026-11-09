import { expect, test, type Page } from '@playwright/test'

import { daysFromToday } from '../../fixtures/date'
import { LOGIN_STAFF } from '../../fixtures/env'
import { createNormalSchedule, detailDateTimeText } from '../../fixtures/schedule'
import { issueManagerToken, STAFF_FORM } from '../../fixtures/staff'
import { openDetail } from '../../screens/scheduleDetail'

/** 日の表示のログインした職員の列の、title の予定。 */
const ownEvent = (page: Page, title: string) =>
  page
    .getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: title })

test.describe('予定の編集', () => {
  test.describe('単発の予定の変更', () => {
    test('単発の予定のタイトルと時刻を変えて保存した場合、詳細と日の表示に変えた後の値が出て、変える前のタイトルが出ないこと', async ({
      page,
      request,
    }) => {
      const stamp = Date.now()
      const before = `E2E の変える前の予定 ${stamp}`
      const after = `E2E の変えた後の予定 ${stamp}`
      const date = daysFromToday(1)
      // トークンは worker の中で使い回す。ブローカーはログインの試行の回数を制限する
      const token = await issueManagerToken()
      const res = await createNormalSchedule(request, token, STAFF_FORM.facilityId, {
        staffId: LOGIN_STAFF.id,
        title: before,
        date,
        start: '13:00',
        end: '14:00',
      })
      expect(res.status()).toBe(201)
      const { id } = (await res.json()) as { id: string }

      await openDetail(page, id, date)
      await expect(page.getByTestId('schedule-detail-modal')).toContainText(before)
      await page.getByTestId('schedule-detail-edit').click()
      await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
      await page.getByTestId('schedule-field-title').click()
      await page.getByTestId('schedule-form-title').fill(after)
      await page.getByTestId('schedule-field-date-time').click()
      await page.getByTestId('schedule-form-start-time').fill('15:00')
      await page.getByTestId('schedule-form-end-time').fill('16:30')
      await page.getByTestId('schedule-edit-submit').click()

      await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
      await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(
        detailDateTimeText(date, '15:00', '16:30'),
      )
      await expect(page.getByTestId('schedule-detail-modal')).toContainText(after)
      await page.getByTestId('schedule-detail-close').click()
      // 変えた後の予定が出てから、変える前のタイトルが無いことを確認する
      await expect(ownEvent(page, after)).toBeVisible()
      await expect(ownEvent(page, after)).toContainText('15:00')
      await expect(ownEvent(page, before)).toHaveCount(0)
    })
  })
})
