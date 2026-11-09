import { expect, test } from '@playwright/test'

import { BASE_URL, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { createNormalSchedule } from '../../fixtures/schedule'
import {
  issueManagerToken,
  leaveStaff,
  newStaff,
  registerStaff,
  registerStaffId,
  reinstateStaff,
  STAFF_FORM,
} from '../../fixtures/staff'
import { SUSPENSION_TEST, SUSPENSION_WAIT } from '../../fixtures/timeouts'
import { enterEmailAtBroker, signInAtBroker } from '../../screens/login'
import { brokerLogin } from '../../selectors/idp'
import { REMAINING_SCHEDULE_DATE } from './dates'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('予定のカレンダー', () => {
  test.describe('職員の休職', () => {
    test.describe.configure(SUSPENSION_TEST)

    test('ログインしている職員を休職にした場合、5 分以内に画面を開くとログインの画面へ戻ること', async ({
      page,
      request,
    }) => {
      const staff = newStaff('suspended')
      const manager = await issueManagerToken()
      const registered = await registerStaff(request, manager, staff)
      expect(registered.status()).toBe(201)
      const { id } = (await registered.json()) as { id: string }
      await page.goto('/schedule?view=day')
      await signInAtBroker(page, staff.email)
      await expect(page.getByTestId('viewer-menu')).toContainText(staff.name)

      expect((await leaveStaff(request, manager, id)).status()).toBe(200)

      // web は access token の期限の前に取り直し、ブローカーに拒まれるとセッションを消す。それまで開き直す
      await expect(async () => {
        await page.goto('/schedule?view=day')
        await expect(brokerLogin(page).email).toBeVisible()
      }).toPass(SUSPENSION_WAIT)
    })
  })

  test.describe('休職の職員', () => {
    test('休職の職員がログインしようとした場合、ログインの失敗の画面が出ること', async ({
      page,
      request,
    }) => {
      const staff = newStaff('stopped')
      const manager = await issueManagerToken()
      const registered = await registerStaff(request, manager, staff)
      expect(registered.status()).toBe(201)
      const { id } = (await registered.json()) as { id: string }
      expect((await leaveStaff(request, manager, id)).status()).toBe(200)

      await page.goto('/schedule')
      await enterEmailAtBroker(page, staff.email)

      await expect(page).toHaveURL(/\/auth\/error\?reason=failed$/)
      await expect(page.getByTestId('auth-error')).toContainText('ログインできませんでした')
    })

    test('休職の職員を復職にした場合、休職の前と同じ上流のアカウントでログインできること', async ({
      browser,
      page,
      request,
    }) => {
      const staff = newStaff('reinstated')
      const manager = await issueManagerToken()
      const registered = await registerStaff(request, manager, staff)
      expect(registered.status()).toBe(201)
      const { id } = (await registered.json()) as { id: string }
      // 初回のログインで、ブローカーが上流のアカウントを職員に結び付ける
      await page.goto('/schedule?view=day')
      await signInAtBroker(page, staff.email)
      await expect(page.getByTestId('viewer-menu')).toContainText(staff.name)
      expect((await leaveStaff(request, manager, id)).status()).toBe(200)

      const reinstated = await reinstateStaff(request, manager, id)
      expect(reinstated.status()).toBe(200)
      expect(await reinstated.json()).toMatchObject({
        id,
        status: 'active',
        leave_started_at: null,
      })

      // 休職でブローカーがログインのセッションを取り消したので、新しいブラウザでも上流の IdP のログインを通る
      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: { cookies: [], origins: [] },
      })
      const again = await context.newPage()
      await again.goto('/schedule?view=day')
      await signInAtBroker(again, staff.email)
      await expect(again).toHaveURL(/\/schedule\?view=day$/)
      await expect(again.getByTestId('viewer-menu')).toContainText(staff.name)
      await context.close()
    })

    test('自分を休職にしようとした場合、409 が返ること', async ({ request }) => {
      const manager = await issueManagerToken()

      const res = await leaveStaff(request, manager, LOGIN_STAFF.id)

      expect(res.status()).toBe(409)
      expect(await res.json()).toEqual({
        code: 'conflict',
        message: '自分を休職か退職にすることはできません',
      })
    })
  })
})

test.describe('職員の詳細', () => {
  // ファイルの既定はログインしていない状態なので、職員の管理の画面はマネージャーでログインした状態で開く
  test.use({ storageState: LOGIN_STATE })

  test.describe('休職と復職', () => {
    test('職員を休職にした場合、その日以降の予定が一覧で出て、確定すると職員の状態が休職になること', async ({
      page,
      request,
    }) => {
      const manager = await issueManagerToken()
      const id = await registerStaffId(request, manager, newStaff('leave-screen'))
      const created = await createNormalSchedule(request, manager, STAFF_FORM.facilityId, {
        staffId: id,
        title: `E2E の休職の会議 ${Date.now()}`,
        date: REMAINING_SCHEDULE_DATE,
      })
      const scheduleId = ((await created.json()) as { id: string }).id

      await page.goto(`/staff/${id}`)
      await page.getByTestId('staff-detail-menu').click()
      await page.getByTestId('staff-detail-leave').click()
      const dialog = page.getByTestId('staff-leave-dialog')
      await expect(
        dialog.getByTestId(`staff-leave-assignment-schedule-${scheduleId}`),
      ).toContainText('2030年1月8日（火）')
      await dialog.getByTestId('staff-leave-submit').click()

      await expect(dialog).toHaveCount(0)
      await expect(page.getByTestId('staff-detail-status')).toHaveText('休職')
    })

    test('休職の職員を復職にした場合、休職の印が消えて有効に戻ること', async ({
      page,
      request,
    }) => {
      const manager = await issueManagerToken()
      const id = await registerStaffId(request, manager, newStaff('reinstate-screen'))
      expect((await leaveStaff(request, manager, id)).status()).toBe(200)

      await page.goto(`/staff/${id}`)
      await expect(page.getByTestId('staff-detail-status')).toHaveText('休職')
      await page.getByTestId('staff-detail-menu').click()
      await page.getByTestId('staff-detail-reinstate').click()

      await expect(page.getByTestId('staff-detail-status')).toHaveCount(0)
    })
  })
})
