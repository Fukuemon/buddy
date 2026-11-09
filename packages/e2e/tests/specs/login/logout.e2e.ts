import { expect, test } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { signInAtBroker } from '../../screens/login'
import { brokerLogin } from '../../selectors/idp'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('予定のカレンダー', () => {
  test.describe('ログイン', () => {
    test('ログアウトした場合、次に画面を開くとログインを求めること', async ({ page }) => {
      await page.goto('/schedule')
      await signInAtBroker(page, LOGIN_EMAIL)
      await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)

      await page.getByTestId('viewer-menu-open').click()
      await page.getByTestId('viewer-logout').click()
      await expect(brokerLogin(page).email).toBeVisible()
      await page.goto('/schedule')

      await expect(brokerLogin(page).email).toBeVisible()
    })

    test('ログアウトした後にブラウザの戻るで前の画面を開いた場合、ログインの画面へ移ること', async ({
      page,
    }) => {
      await page.goto('/schedule')
      await signInAtBroker(page, LOGIN_EMAIL)
      await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)
      await page.getByTestId('viewer-menu-open').click()
      await page.getByTestId('viewer-logout').click()
      await expect(brokerLogin(page).email).toBeVisible()

      await page.goBack()

      await expect(brokerLogin(page).email).toBeVisible()
      await expect(page.getByTestId('viewer-menu')).toHaveCount(0)
    })
  })
})
