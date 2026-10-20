import { expect, test } from '@playwright/test'

import { LOGIN_NAME, LOGIN_STAFF } from '../../fixtures/env'
import { signInAtIdp } from '../../screens/login'
import { idpLogin } from '../../selectors/idp'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('予定のカレンダー', () => {
  test.describe('ログイン', () => {
    test('ログインしていない場合、IdP でログインすると予定のカレンダーに戻り職員の名前が出ること', async ({
      page,
    }) => {
      await page.goto('/schedule?view=day')
      await expect(idpLogin(page).username).toBeVisible()

      await signInAtIdp(page, LOGIN_NAME)

      await expect(page).toHaveURL(/\/schedule\?view=day$/)
      await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)
    })

    test('ログアウトした場合、次に画面を開くとログインを求めること', async ({ page }) => {
      await page.goto('/schedule')
      await signInAtIdp(page, LOGIN_NAME)
      await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)

      await page.getByTestId('viewer-logout').click()
      await expect(idpLogin(page).username).toBeVisible()
      await page.goto('/schedule')

      await expect(idpLogin(page).username).toBeVisible()
    })
  })
})
