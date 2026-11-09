import { expect, test } from '@playwright/test'

import { daysFromToday, fromNextMonday } from '../../fixtures/date'
import { LOGIN_STAFF, SEED_PATIENT } from '../../fixtures/env'
import {
  createNormalSchedule,
  createVisitSchedule,
  createWeeklyNormalSchedule,
  detailDateTimeText,
} from '../../fixtures/schedule'
import { issueManagerToken, STAFF_FORM } from '../../fixtures/staff'
import { openDay } from '../../screens/scheduleCalendar'
import { openDetail } from '../../screens/scheduleDetail'
import { scheduleDetailValues } from '../../selectors/scheduleDetail'

test.describe('予定の詳細', () => {
  test.describe('予定の詳細の表示', () => {
    test('メモのある通常の予定の詳細を開いた場合、日時の見出し、種類、タイトル、予定者、メモが出て、訪問の情報と繰り返しが出ないこと', async ({
      page,
      request,
    }) => {
      const stamp = Date.now()
      const title = `E2E の詳細を見る予定 ${stamp}`
      const memo = `E2E のメモ ${stamp}`
      const date = daysFromToday(2)
      // トークンは worker の中で使い回す。ブローカーはログインの試行の回数を制限する
      const token = await issueManagerToken()
      const res = await createNormalSchedule(request, token, STAFF_FORM.facilityId, {
        staffId: LOGIN_STAFF.id,
        title,
        date,
        start: '09:30',
        end: '10:15',
        description: memo,
      })
      expect(res.status()).toBe(201)
      const { id } = (await res.json()) as { id: string }

      await openDetail(page, id, date)

      await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(
        detailDateTimeText(date, '09:30', '10:15'),
      )
      await expect(scheduleDetailValues(page)).toHaveText(['通常', title, LOGIN_STAFF.name])
      await expect(page.getByTestId('schedule-detail-memo')).toContainText(memo)
      await expect(page.getByTestId('schedule-detail-visit')).toHaveCount(0)
      await expect(page.getByTestId('schedule-detail-recurrence')).toHaveCount(0)
      await expect(page.getByTestId('schedule-detail-edit')).toBeVisible()
    })

    test('訪問の予定の詳細を開いた場合、主訪問者と訪問の情報の利用者、サービスコード、訪問の区分が出て、メモが出ないこと', async ({
      page,
      request,
    }) => {
      const date = daysFromToday(2)
      const token = await issueManagerToken()
      const res = await createVisitSchedule(request, token, STAFF_FORM.facilityId, {
        staffId: LOGIN_STAFF.id,
        patientId: SEED_PATIENT.id,
        serviceCode: '訪看I3',
        date,
        start: '11:00',
        end: '11:30',
      })
      expect(res.status()).toBe(201)
      const { id } = (await res.json()) as { id: string }

      await openDetail(page, id, date)

      await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(
        detailDateTimeText(date, '11:00', '11:30'),
      )
      await expect(scheduleDetailValues(page)).toHaveText([
        '訪問',
        LOGIN_STAFF.name,
        SEED_PATIENT.name,
        '訪看I3',
        '通常',
      ])
      await expect(page.getByTestId('schedule-detail-visit')).toContainText('訪問の情報')
      await expect(page.getByTestId('schedule-detail-modal')).toContainText('主訪問者')
      await expect(page.getByTestId('schedule-detail-memo')).toHaveCount(0)
    })

    test('毎週の繰り返しの予定の回の詳細を開いた場合、繰り返しの規則が出て、編集が回と繰り返しを選ぶメニューになること', async ({
      page,
      request,
    }) => {
      const title = `E2E の詳細を見る定例 ${Date.now()}`
      const token = await issueManagerToken()
      // 予定の削除とキャンセルの spec の毎週の予定（10:00、14:00）と重なると回を押せないので、時刻をずらす
      const res = await createWeeklyNormalSchedule(request, token, STAFF_FORM.facilityId, {
        staffId: LOGIN_STAFF.id,
        title,
        date: fromNextMonday(0),
        start: '18:00',
        end: '19:00',
      })
      expect(res.status()).toBe(201)

      await openDay(page, fromNextMonday(7), LOGIN_STAFF.id)
      await page
        .getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
        .getByTestId(/^schedule-event-/)
        .filter({ hasText: title })
        .click()

      await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(
        detailDateTimeText(fromNextMonday(7), '18:00', '19:00'),
      )
      await expect(page.getByTestId('schedule-detail-recurrence')).toContainText('毎週 月曜日')
      await expect(scheduleDetailValues(page)).toHaveText([
        '通常',
        title,
        LOGIN_STAFF.name,
        '毎週 月曜日',
      ])
      await page.getByTestId('schedule-detail-edit').click()
      await expect(page.getByTestId('schedule-detail-edit-occurrence')).toBeVisible()
      await expect(page.getByTestId('schedule-detail-edit-recurrence')).toBeVisible()
    })
  })
})
