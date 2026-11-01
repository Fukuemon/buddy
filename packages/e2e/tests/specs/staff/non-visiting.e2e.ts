import { expect, test } from '@playwright/test'

import { SCHEDULE_URL } from '../../fixtures/env'
import { createNormalSchedule } from '../../fixtures/schedule'
import {
  issueManagerToken,
  newStaff,
  registerStaffId,
  setNonVisiting,
  STAFF_FORM,
} from '../../fixtures/staff'

/** 訪問しない職員への変更を拒む予定の日。変更の操作の日より後にする。 */
const FUTURE_DATE = '2030-01-07'

test.describe('予定のカレンダー', () => {
  test.describe('訪問しない職員', () => {
    test('訪問しない職員にした場合、予定のカレンダーの日の表示にその職員の列が出ないこと', async ({
      page,
      request,
    }) => {
      const manager = await issueManagerToken(request)
      const staff = newStaff('non-visiting')
      const id = await registerStaffId(request, manager, staff)
      await page.goto('/schedule?view=day')
      await expect(page.getByTestId(`day-grid-staff-${id}`)).toBeVisible()

      const res = await setNonVisiting(request, manager, id)

      expect(res.status()).toBe(200)
      expect(await res.json()).toMatchObject({ id, visits: false })
      await page.reload()
      await expect(page.getByTestId(/^day-grid-staff-/).first()).toBeVisible()
      await expect(page.getByTestId(`day-grid-staff-${id}`)).toHaveCount(0)
    })

    test('今日以降の予定が残る職員を訪問しない職員にしようとした場合、409 で残る予定が返り、訪問する職員のままであること', async ({
      request,
    }) => {
      const manager = await issueManagerToken(request)
      const id = await registerStaffId(request, manager, newStaff('non-visiting-refused'))
      const created = await createNormalSchedule(request, manager, STAFF_FORM.facilityId, {
        staffId: id,
        title: `E2E の訪問 ${Date.now()}`,
        date: FUTURE_DATE,
      })
      expect(created.status()).toBe(201)
      const scheduleId = ((await created.json()) as { id: string }).id

      const res = await setNonVisiting(request, manager, id)

      expect(res.status()).toBe(409)
      expect(await res.json()).toMatchObject({
        code: 'staff_has_assignments',
        assignments: { schedules: [{ id: scheduleId, date: FUTURE_DATE }] },
      })
      const after = await request.get(`${SCHEDULE_URL}/v1/users/${id}`, {
        headers: { Authorization: `Bearer ${manager}` },
      })
      expect(await after.json()).toMatchObject({ id, visits: true })
    })
  })
})
