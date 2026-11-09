import { expect, test } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF, OFFICE_A_SCHEDULE, OFFICE_B } from '../../fixtures/env'
import { signInAtBroker } from '../../screens/login'
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
  })
})
