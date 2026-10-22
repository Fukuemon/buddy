import { expect, test } from '@playwright/test'

import { LEADER, LOGIN_NAME, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, PHONE_VIEWPORT, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtIdp } from '../../screens/login'

test.describe('予定のカレンダー', () => {
  test.describe('職員の絞り込みのドロワー', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      test(`${variant.label ? `${variant.label}: ` : ''}スマートフォンの幅で職員の絞り込みを開いて職員を外した場合、閉じるとその職員の列が消え、Escape でも閉じられること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-staff-filter-drawer',
            title:
              'スマートフォンの幅で、職員の絞り込みをドロワーで開いて職員を外し、閉じるボタンと Escape で閉じる',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
            viewport: PHONE_VIEWPORT,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtIdp(page, LOGIN_NAME)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule?view=day')
            await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
            const drawer = page.getByTestId('staff-filter-drawer')
            await expect(drawer).toBeHidden()
            await check('幅 390px で日の表示を開くと、職員の絞り込みは閉じている')

            await step('ツールバーの「職員の絞り込み」を押す')
            await page.getByTestId('staff-filter-open').click()
            await expect(drawer).toBeVisible()
            await check('左端から職員の絞り込みのドロワーが開く')

            await step(`${LOGIN_STAFF.name} のチェックを外し、閉じるボタンを押す`)
            await page.getByTestId(`staff-filter-staff-${LOGIN_STAFF.id}`).uncheck()
            await page.getByTestId('staff-filter-close').click()
            await expect(drawer).toBeHidden()
            await expect(page.getByTestId(`day-grid-staff-${LEADER.staff.id}`)).toBeVisible()
            await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeHidden()
            await check(`ドロワーが閉じ、日の表示から ${LOGIN_STAFF.name} の列が消える`)

            await step('もう一度「職員の絞り込み」を押して開き、Escape キーを押す')
            await page.getByTestId('staff-filter-open').click()
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
