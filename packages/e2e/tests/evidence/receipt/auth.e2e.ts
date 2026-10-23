import { expect, test } from '@playwright/test'

import { prepareApiReference, routeApiReference } from '../../fixtures/apiReference'
import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { fillApiToken, openApiClient } from '../../screens/apiReference'
import { apiClient } from '../../selectors/apiReference'

test.describe('照合の API', () => {
  test.describe('access token の確認', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      test(`${variant.label ? `${variant.label}: ` : ''}トークンを付けずに照合を送った場合は 401 が返り、トークンを付けると認証を通ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'receipt-check-auth',
            title:
              'トークンを付けずに照合を送ると 401 が返り、トークンを付けると認証を通って本文の誤りの 400 になる',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          prepareApiReference('receipt', LOGIN_EMAIL),
          async ({ page, step, check }, token) => {
            await routeApiReference(page)
            await openApiClient(page, 'receipt', {
              tag: 'check',
              method: 'post',
              path: '/v1/checks',
            })
            await step(
              '照合の API の参照のページで「実訪問の CSV と予定を照合する」のリクエストを開いている',
            )

            await step('認証の欄を空のまま、ファイルを付けずにリクエストを送る')
            await apiClient(page).send.click()
            await expect(apiClient(page).dialog).toContainText('401 Unauthorized')
            await expect(apiClient(page).dialog).toContainText('"code": "unauthenticated"')
            await check('401 が返り、code は unauthenticated になる')

            await step(
              `認証の欄に ${LOGIN_STAFF.name} のトークンを入れ（伏せ字で出る）、同じリクエストを送る`,
            )
            await fillApiToken(page, token)
            await apiClient(page).send.click()
            await expect(apiClient(page).dialog).toContainText('400 Bad Request')
            await check('認証を通り、ファイルが無いことの 400 が返る')
          },
        )
      })
    }
  })
})
