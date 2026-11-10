import { expect, test } from '@playwright/test'

import { LOGIN_STATE } from '../../fixtures/env'
import { createNormalSchedule } from '../../fixtures/schedule'
import {
  issueManagerToken,
  newStaff,
  registerStaff,
  registerStaffId,
  retireStaff,
  STAFF_FORM,
} from '../../fixtures/staff'
import { enterEmailAtBroker } from '../../screens/login'
import { REMAINING_SCHEDULE_DATE } from './dates'

/** 退職を拒む予定の日。退職の操作の日より後にする。 */
const FUTURE_DATE = '2030-01-07'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('予定のカレンダー', () => {
  test.describe('職員の退職', () => {
    test('予定と担当が残らない職員を退職にした場合、ログインできず、電話番号が消えて名前が残ること', async ({
      page,
      request,
    }) => {
      const staff = newStaff('retired')
      const manager = await issueManagerToken()
      const registered = await registerStaff(request, manager, staff)
      expect(registered.status()).toBe(201)
      const { id } = (await registered.json()) as { id: string }

      const res = await retireStaff(request, manager, id)

      expect(res.status()).toBe(200)
      expect(await res.json()).toMatchObject({
        staff: { id, username: staff.name, status: 'retired', email: null, phone_number: null },
        assignments: { schedules: [], recurring_schedules: [], patients: [] },
      })
      await page.goto('/schedule')
      await enterEmailAtBroker(page, staff.email)
      await expect(page).toHaveURL(/\/auth\/error\?reason=denied$/)
    })

    test('退職した職員と同じメールで職員を登録した場合、新しい職員として登録できること', async ({
      request,
    }) => {
      const staff = newStaff('rehired')
      const manager = await issueManagerToken()
      const first = await registerStaff(request, manager, staff)
      expect(first.status()).toBe(201)
      const { id } = (await first.json()) as { id: string }
      expect((await retireStaff(request, manager, id)).status()).toBe(200)

      const again = await registerStaff(request, manager, staff)

      expect(again.status()).toBe(201)
      expect(await again.json()).toMatchObject({ email: staff.email, status: 'active' })
      expect(((await again.json()) as { id: string }).id).not.toBe(id)
    })

    test('その日以降の予定が残る職員を退職にしようとした場合、409 が返り残る予定の一覧が返ること', async ({
      request,
    }) => {
      const staff = newStaff('assigned')
      const manager = await issueManagerToken()
      const registered = await registerStaff(request, manager, staff)
      expect(registered.status()).toBe(201)
      const { id } = (await registered.json()) as { id: string }
      const created = await createNormalSchedule(request, manager, STAFF_FORM.facilityId, {
        staffId: id,
        title: `E2E の会議 ${Date.now()}`,
        date: FUTURE_DATE,
      })
      expect(created.status()).toBe(201)
      const scheduleId = ((await created.json()) as { id: string }).id

      const res = await retireStaff(request, manager, id)

      expect(res.status()).toBe(409)
      expect(await res.json()).toMatchObject({
        code: 'staff_has_assignments',
        assignments: {
          schedules: [{ id: scheduleId, date: FUTURE_DATE }],
          recurring_schedules: [],
          patients: [],
        },
      })
    })
  })
})

test.describe('職員の詳細', () => {
  // ファイルの既定はログインしていない状態なので、職員の管理の画面はマネージャーでログインした状態で開く
  test.use({ storageState: LOGIN_STATE })

  test.describe('退職', () => {
    test('その日以降の予定が残る職員を退職にしようとした場合、残る予定が出て、退職を確定できないこと', async ({
      page,
      request,
    }) => {
      const manager = await issueManagerToken()
      const staff = newStaff('retire-screen')
      const id = await registerStaffId(request, manager, staff)
      const created = await createNormalSchedule(request, manager, STAFF_FORM.facilityId, {
        staffId: id,
        title: `E2E の退職の会議 ${Date.now()}`,
        date: REMAINING_SCHEDULE_DATE,
      })
      const scheduleId = ((await created.json()) as { id: string }).id

      await page.goto(`/staff/${id}`)
      await page.getByTestId('staff-detail-menu').click()
      await page.getByTestId('staff-detail-retire').click()
      const dialog = page.getByTestId('staff-retire-dialog')

      await expect(dialog).toContainText(`${staff.name} を退職にできません`)
      await expect(
        dialog.getByTestId(`staff-retire-assignment-schedule-${scheduleId}`),
      ).toBeVisible()
      await expect(dialog.getByTestId('staff-retire-submit')).toHaveAttribute(
        'aria-disabled',
        'true',
      )
    })
  })
})
