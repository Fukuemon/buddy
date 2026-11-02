import { expect, test } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'

/** 事業所にいない利用者の ID。ID の形は合うが、シードにも撮影で作るデータにも無い。 */
const MISSING_PATIENT_ID = '01M3TC5TRG5200KYWTZW6ER3ZZ'

test.describe('利用者の詳細', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}職員の管理の権限を持つ職員が無い利用者の ID で利用者の詳細を開いた場合、利用者が見つからないことと開き直す先が出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'patient-detail-not-found',
          title:
            '無い利用者の ID で利用者の詳細を開くと、利用者が見つからないことと開き直す先が出る',
          actor: `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`,
          variant,
        },
        async (page) => {
          await page.goto('/patients')
          await signInAtBroker(page, LOGIN_EMAIL)
        },
        async ({ page, step, check }) => {
          await step(`無い利用者の ID（${MISSING_PATIENT_ID}）で、利用者の詳細の URL を開く`)
          await page.goto(`/patients/${MISSING_PATIENT_ID}`)
          await expect(page.getByTestId('patient-detail-error')).toHaveText(
            '利用者が見つかりません。利用者の一覧から開き直してください。',
          )
          await expect(page.getByTestId('patient-detail-retry')).toHaveCount(0)
          await check(
            '「利用者が見つかりません。利用者の一覧から開き直してください。」が出て、読み直すは出ない',
          )
        },
      )
    })
  }
})
