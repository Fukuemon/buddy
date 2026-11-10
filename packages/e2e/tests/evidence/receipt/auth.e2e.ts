import { expect, test } from '@playwright/test'

import { issueAccessToken, routeApiReference } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { openApiClient } from '../../screens/apiReference'
import { fillApiToken } from '../../widgets/apiClient/actions/apiClient'
import { apiClient } from '../../selectors/apiReference'

test.describe('照合の API', () => {
  test.describe(`access token の確認（${LOGIN_STAFF.name}、マネージャー、API の参照のページ）`, () => {
    test('receipt-check-auth トークンを付けずに照合を送った場合は 401 が返り、トークンを付けると認証を通ること', async ({
      browser,
      context,
    }) => {
      const token = await prepareOutsideRecording(browser, {}, (page) =>
        issueAccessToken(page.request, LOGIN_EMAIL),
      )

      const page = await context.newPage()
      await routeApiReference(page)
      await openApiClient(page, 'receipt', { tag: 'check', method: 'post', path: '/v1/checks' })
      await expect(apiClient(page).send).toBeVisible()
      await intro(
        page,
        'トークンを付けずに照合を送ると 401 が返り、トークンを付けると認証を通って本文の誤りの 400 になる\n前提 照合の API の参照のページで「実訪問の CSV と予定を照合する」のリクエストを開いている',
      )

      await step(page, '認証の欄を空のまま、ファイルを付けずにリクエストを送る', () =>
        apiClient(page).send.click(),
      )
      await check(page, '401 が返り、code は unauthenticated になる', async () => {
        await expect(apiClient(page).dialog).toContainText('401 Unauthorized')
        await expect(apiClient(page).dialog).toContainText('"code": "unauthenticated"')
      })

      await step(
        page,
        `認証の欄に ${LOGIN_STAFF.name} のトークンを入れ（伏せ字で出る）、同じリクエストを送る`,
        async () => {
          await fillApiToken(page, token)
          await apiClient(page).send.click()
        },
      )
      await check(page, '認証を通り、ファイルが無いことの 400 が返る', () =>
        expect(apiClient(page).dialog).toContainText('400 Bad Request'),
      )
    })
  })
})
