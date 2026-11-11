import { expect, test } from '@playwright/test'

import { issueAccessToken, routeApiReference } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { STAFF_FORM } from '../../fixtures/staff'
import { openApiClient } from '../../screens/apiReference'
import {
  fillApiBody,
  fillApiToken,
  fillApiVariable,
} from '../../widgets/apiClient/actions/apiClient'
import { apiClient } from '../../selectors/apiReference'

const CREATE_USER = { tag: 'staff', method: 'post', path: '/v1/facilities/{facility_id}/users' }

/** シードの青木と同じメールの職員の作成。メールの書き方だけを変える。 */
const cases = [
  {
    name: 'staff-create-duplicate-email',
    email: 'hina.aoki@example.com',
    condition: '事業所にいる職員と同じメールで職員を作った場合',
    title: '事業所にいる職員と同じメールで職員を作ると、409 で原因の文が返る',
  },
  {
    name: 'staff-create-duplicate-email-case',
    email: 'HINA.AOKI@EXAMPLE.COM',
    condition: '事業所にいる職員のメールを大文字にして職員を作った場合',
    title:
      '事業所にいる職員のメールを大文字にして職員を作っても、同じメールとして 409 で原因の文が返る',
  },
]

test.describe('職員の管理', () => {
  test.describe('職員の作成', () => {
    test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり、API の参照のページ）`, () => {
      for (const c of cases) {
        test(`${c.name} ${c.condition}、409 で「メール … の職員はこの事業所にすでにいます」が返ること`, async ({
          browser,
          context,
        }) => {
          const token = await prepareOutsideRecording(browser, {}, (page) =>
            issueAccessToken(page.request, LOGIN_EMAIL),
          )

          const page = await context.newPage()
          await routeApiReference(page)
          await openApiClient(page, 'schedule', CREATE_USER)
          await expect(apiClient(page).send).toBeVisible()
          await intro(
            page,
            `${c.title}\n前提 API の参照のページで「職員を作る」のリクエストを開いている`,
          )

          await step(
            page,
            `認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`,
            () => fillApiToken(page, token),
          )
          await step(
            page,
            `メールを ${c.email}（${LOGIN_STAFF.name} のメール）にして、職員を作るリクエストを送る`,
            async () => {
              await fillApiVariable(page, 'facility_id', STAFF_FORM.facilityId)
              await fillApiBody(page, {
                username: '見本 職員',
                email: c.email,
                department_id: STAFF_FORM.departmentId,
                team_id: STAFF_FORM.teamId,
                position_id: STAFF_FORM.positionId,
              })
              await apiClient(page).send.click()
            },
          )
          await check(
            page,
            '409 が返り、message に「メール hina.aoki@example.com の職員はこの事業所にすでにいます」が出る',
            async () => {
              await expect(apiClient(page).dialog).toContainText('409 Conflict')
              await expect(apiClient(page).dialog).toContainText(
                '"message": "メール hina.aoki@example.com の職員はこの事業所にすでにいます"',
              )
            },
          )
        })
      }
    })
  })
})
