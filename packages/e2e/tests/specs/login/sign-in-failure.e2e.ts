import { expect, test } from '@playwright/test'

import {
  LOGIN_EMAIL,
  LOGIN_STAFF,
  SUSPENDED_STAFF,
  TEAM_MEMBER,
  UNREGISTERED_EMAIL,
} from '../../fixtures/env'
import { enterEmailAtBroker, signInAtBroker } from '../../screens/login'
import { brokerLogin } from '../../selectors/idp'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('予定のカレンダー', () => {
  test.describe('ログイン', () => {
    test('登録していないメールを入れた場合、事業所を示さずにログインの失敗の画面が出て予定の画面を開けないこと', async ({
      page,
    }) => {
      await page.goto('/schedule')
      await enterEmailAtBroker(page, UNREGISTERED_EMAIL)

      await expect(page).toHaveURL(/\/auth\/error\?reason=failed$/)
      await expect(page.getByTestId('auth-error')).toContainText('ログインできませんでした')
      await page.goto('/schedule')
      await expect(brokerLogin(page).email).toBeVisible()
    })

    test('止めた職員のメールを入れた場合、ログインの失敗の画面が出て予定の画面を開けないこと', async ({
      page,
    }) => {
      await page.goto('/schedule')
      await enterEmailAtBroker(page, SUSPENDED_STAFF.email)

      await expect(page).toHaveURL(/\/auth\/error\?reason=failed$/)
      await expect(page.getByTestId('auth-error')).toContainText('ログインできませんでした')
      await page.goto('/schedule')
      await expect(brokerLogin(page).email).toBeVisible()
    })

    test('上流の IdP のメールが入れたメールと違う場合、ログインの失敗の画面が出てログインしていないこと', async ({
      page,
    }) => {
      await page.goto('/schedule')
      await signInAtBroker(page, TEAM_MEMBER.email, { upstreamEmail: 'someone.else@example.com' })

      await expect(page).toHaveURL(/\/auth\/error\?reason=failed$/)
      await expect(page.getByTestId('auth-error')).toContainText('ログインできませんでした')
      await page.goto('/schedule')
      await expect(brokerLogin(page).email).toBeVisible()
    })

    test('Hydra がログインを覚えている間に、ログインの失敗の画面から入り直した場合、メールの入力の画面が出ること', async ({
      page,
    }) => {
      await page.goto('/schedule')
      await signInAtBroker(page, LOGIN_EMAIL)
      await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)
      await page.goto('/auth/error?reason=forbidden')

      await page.getByTestId('auth-error-login').click()

      await expect(brokerLogin(page).email).toBeVisible()
    })
  })
})
