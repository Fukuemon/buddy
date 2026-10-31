import { expect, test } from '@playwright/test'

import {
  LOGIN_EMAIL,
  LOGIN_STAFF,
  OFFICE_A_SCHEDULE,
  OFFICE_B,
  SUSPENDED_STAFF,
  TEAM_MEMBER,
  UNREGISTERED_EMAIL,
} from '../../fixtures/env'
import { enterEmailAtBroker, signInAtBroker } from '../../screens/login'
import { brokerLogin } from '../../selectors/idp'

test.use({ storageState: { cookies: [], origins: [] } })

test.describe('予定のカレンダー', () => {
  test.describe('ログイン', () => {
    test('ログインしていない場合、登録したメールで事業所の IdP に入ると予定のカレンダーに戻り職員の名前が出ること', async ({
      page,
    }) => {
      await page.goto('/schedule?view=day')
      await expect(brokerLogin(page).email).toBeVisible()

      await signInAtBroker(page, LOGIN_EMAIL)

      await expect(page).toHaveURL(/\/schedule\?view=day$/)
      await expect(page.getByTestId('viewer-menu')).toContainText(LOGIN_STAFF.name)
    })

    test('2 つ目の事業所の職員でログインした場合、その事業所の予定だけが出ること', async ({
      page,
    }) => {
      await page.goto(`/schedule?view=day&date=${OFFICE_B.schedule.date}`)
      await signInAtBroker(page, OFFICE_B.email)

      await expect(page.getByTestId('viewer-menu')).toContainText(OFFICE_B.staff.name)
      const events = page.getByTestId(/^schedule-event-/)
      await expect(events.filter({ hasText: OFFICE_B.schedule.title })).toBeVisible()
      // 2 つ目の事業所の予定が出た後に、同じ日の 1 つ目の事業所の予定が無いことを確認する
      await expect(events.filter({ hasText: OFFICE_A_SCHEDULE.title })).toHaveCount(0)
    })

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
