import { expect, test } from '@playwright/test'

import { LEADER, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, PHONE_VIEWPORT, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'

test.describe('予定のカレンダー', () => {
  test.describe('サイドバーのドロワー', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      test(`${variant.label ? `${variant.label}: ` : ''}スマートフォンの幅でメニューのボタンを押した場合、ドロワーにミニカレンダーと職員の絞り込みが出て、職員を外して閉じるとその職員の列が消えること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-sidebar-drawer',
            title:
              'スマートフォンの幅で、メニューのボタンからドロワーを開き、職員を外して、閉じるボタンと Escape で閉じる',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
            viewport: PHONE_VIEWPORT,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule?view=day')
            await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
            const drawer = page.getByTestId('site-nav-drawer')
            await expect(drawer).toBeHidden()
            await check('幅 390px で日の表示を開くと、サイドバーのドロワーは閉じている')

            await step('ヘッダーの左のメニューのボタンを押す')
            await page.getByTestId('site-nav-open').click()
            await expect(drawer).toBeVisible()
            await expect(drawer.getByTestId('site-nav')).toBeVisible()
            await expect(drawer.getByTestId('mini-calendar')).toBeVisible()
            await expect(drawer.getByTestId('calendar-show-cancelled')).toBeVisible()
            await expect(drawer.getByTestId('staff-filter-sidebar')).toBeVisible()
            await check(
              '左端からドロワーが開き、ナビゲーションの下に、ミニカレンダー、キャンセルした予定を出す、職員の絞り込みが出る',
            )

            await step(`${LOGIN_STAFF.name} のチェックを外し、閉じるボタンを押す`)
            await drawer.getByTestId(`staff-filter-staff-${LOGIN_STAFF.id}`).uncheck()
            await page.getByTestId('site-nav-close').click()
            await expect(drawer).toBeHidden()
            await expect(page.getByTestId(`day-grid-staff-${LEADER.staff.id}`)).toBeVisible()
            await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeHidden()
            await check(`ドロワーが閉じ、日の表示から ${LOGIN_STAFF.name} の列が消える`)

            await step('もう一度メニューのボタンを押して開き、Escape キーを押す')
            await page.getByTestId('site-nav-open').click()
            await expect(drawer).toBeVisible()
            await page.keyboard.press('Escape')
            await expect(drawer).toBeHidden()
            await check('Escape キーでドロワーが閉じる')
          },
        )
      })
    }
  })
})
