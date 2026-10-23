import { expect, test } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { LOGIN_EMAIL } from '../../fixtures/env'
import { newStaff, registerStaff, suspendStaff } from '../../fixtures/staff'
import { SUSPENSION_TEST, SUSPENSION_WAIT } from '../../fixtures/timeouts'
import { signInAtBroker } from '../../screens/login'
import { brokerLogin } from '../../selectors/idp'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('予定のカレンダー', () => {
  test.describe('職員の停止', () => {
    test.describe.configure(SUSPENSION_TEST)

    test('ログインしている職員を止めた場合、5 分以内に画面を開くとログインの画面へ戻ること', async ({
      page,
      request,
    }) => {
      const staff = newStaff('suspended')
      const manager = await issueAccessToken(request, LOGIN_EMAIL)
      const registered = await registerStaff(request, manager, staff)
      expect(registered.status()).toBe(201)
      const { id } = (await registered.json()) as { id: string }
      await page.goto('/schedule?view=day')
      await signInAtBroker(page, staff.email)
      await expect(page.getByTestId('viewer-menu')).toContainText(staff.name)

      expect((await suspendStaff(request, manager, id)).status()).toBe(200)

      // web は access token の期限の前に取り直し、ブローカーに拒まれるとセッションを消す。それまで開き直す
      await expect(async () => {
        await page.goto('/schedule?view=day')
        await expect(brokerLogin(page).email).toBeVisible()
      }).toPass(SUSPENSION_WAIT)
    })

    test('止めた職員がログインしようとした場合、ログインの失敗の画面が出ること', async ({
      page,
      request,
    }) => {
      const staff = newStaff('stopped')
      const manager = await issueAccessToken(request, LOGIN_EMAIL)
      const registered = await registerStaff(request, manager, staff)
      expect(registered.status()).toBe(201)
      const { id } = (await registered.json()) as { id: string }
      expect((await suspendStaff(request, manager, id)).status()).toBe(200)

      await page.goto('/schedule')
      await brokerLogin(page).email.fill(staff.email)
      await brokerLogin(page).next.click()

      await expect(page).toHaveURL(/\/auth\/error\?reason=failed$/)
      await expect(page.getByTestId('auth-error')).toContainText('ログインできませんでした')
    })
  })
})
