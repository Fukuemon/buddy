import { expect, test } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'

/** 事業所にいない職員の ID。ID の形は合うが、シードにも撮影で作るデータにも無い。 */
const MISSING_STAFF_ID = '01M3TC5TRG5200KYWTZW6ER3ZZ'

test.describe('職員の詳細', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}職員の管理の権限を持つ職員が無い職員の ID で職員の詳細を開いた場合、職員が見つからないことと開き直す先が出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'staff-detail-not-found',
          title: '無い職員の ID で職員の詳細を開くと、職員が見つからないことと開き直す先が出る',
          actor: `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`,
          variant,
        },
        async (page) => {
          await page.goto('/staff')
          await signInAtBroker(page, LOGIN_EMAIL)
        },
        async ({ page, step, check }) => {
          await step(`無い職員の ID（${MISSING_STAFF_ID}）で、職員の詳細の URL を開く`)
          await page.goto(`/staff/${MISSING_STAFF_ID}`)
          await expect(page.getByTestId('staff-detail-error')).toHaveText(
            '職員が見つかりません。職員の一覧から開き直してください。',
          )
          await expect(page.getByTestId('staff-detail-retry')).toHaveCount(0)
          await check(
            '「職員が見つかりません。職員の一覧から開き直してください。」が出て、読み直すは出ない',
          )
        },
      )
    })
  }
})
