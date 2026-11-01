import { expect, test } from '@playwright/test'

import { FACILITY_SERVICE_ACCOUNT, LEADER, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../screens/calendar'
import { signInAtBroker } from '../../screens/login'

const MORI = LEADER.staff
const ACTOR = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

test.describe('カレンダーの連携', () => {
  test.describe('共有の手順', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}どの職員も結び付けていない事業所で連携の画面を開いた場合、共有の手順を開いた状態で出すこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-link-guide-first',
            title: 'どの職員もカレンダーを結び付けていない事業所で、連携の画面を開く',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await page.goto('/schedule/link')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, check }) => {
            await page.goto('/schedule/link')
            await expect(page.getByTestId(`calendar-link-open-${MORI.id}`)).toBeVisible()
            // ほかの spec が結び付けを残していれば、全員が未連携という前提が崩れるので、ここで落とす
            await expect(page.getByTestId(/^calendar-link-menu-/)).toHaveCount(0)
            await expect(page.getByTestId('calendar-link-service-account')).toHaveText(
              FACILITY_SERVICE_ACCOUNT,
            )
            await expect(page.getByTestId('calendar-link-guide-toggle')).toHaveAttribute(
              'aria-expanded',
              'true',
            )
            await expect(page.getByTestId('calendar-link-steps')).toBeVisible()
            await check(
              `どの職員も結び付けていないので、「カレンダーの共有」の「共有する相手のメールアドレス」に ${FACILITY_SERVICE_ACCOUNT} とコピーのボタンが並び、「詳しく」の下の 3 つの共有の手順が開いた状態で出る`,
            )
          },
        )
      })

      test(`${prefix}結び付けた職員がいる事業所で詳しくのボタンを押した場合、閉じていた手順が開き、もう一度押すと閉じること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-link-guide-toggle',
            title: '結び付けた職員がいる事業所で、「詳しく」のボタンで共有の手順を開いて閉じる',
            actor: ACTOR,
            variant,
          },
          async (page) => {
            await page.goto('/schedule/link')
            await signInAtBroker(page, LOGIN_EMAIL)
            await linkStaffCalendar(page, MORI.id)
          },
          async ({ page, step, check }) => {
            try {
              await page.goto('/schedule/link')
              const toggle = page.getByTestId('calendar-link-guide-toggle')
              const steps = page.getByTestId('calendar-link-steps')
              await expect(page.getByTestId(`calendar-link-menu-${MORI.id}`)).toBeVisible()
              await expect(toggle).toHaveAttribute('aria-expanded', 'false')
              await expect(steps).toBeHidden()
              await expect(page.getByTestId('calendar-link-service-account')).toHaveText(
                FACILITY_SERVICE_ACCOUNT,
              )
              await expect(page.getByTestId('calendar-link-copy')).toBeVisible()
              await check(
                `${MORI.name} にカレンダーを結び付けているので、共有の手順は閉じている。共有する相手のメールアドレスとコピーのボタンは出ている`,
              )

              await step('メールアドレスの下の 1 文に続く「詳しく」のボタンを押す')
              await toggle.click()
              await expect(toggle).toHaveAttribute('aria-expanded', 'true')
              await expect(steps).toBeVisible()
              await check('ボタンの下に、3 つの共有の手順が開く')

              await step('もう一度「詳しく」のボタンを押す')
              await toggle.click()
              await expect(toggle).toHaveAttribute('aria-expanded', 'false')
              await expect(steps).toBeHidden()
              await check('共有の手順が閉じる')
            } finally {
              await step('（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）')
              await unlinkStaffCalendar(page, MORI.id)
            }
          },
        )
      })
    }
  })
})
