import { expect, test } from '@playwright/test'

import { prepareApiReference, routeApiReference } from '../../fixtures/apiReference'
import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { STAFF_FORM } from '../../fixtures/staff'
import {
  fillApiBody,
  fillApiToken,
  fillApiVariable,
  openApiClient,
} from '../../screens/apiReference'
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
    for (const variant of EVIDENCE_VARIANTS) {
      for (const c of cases) {
        test(`${variant.label ? `${variant.label}: ` : ''}${c.condition}、409 で「メール … の職員はこの事業所にすでにいます」が返ること`, async ({
          browser,
        }) => {
          await recordPrEvidence(
            browser,
            {
              name: c.name,
              title: c.title,
              actor: `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`,
              variant,
            },
            prepareApiReference('schedule', LOGIN_EMAIL),
            async ({ page, step, check }, token) => {
              await routeApiReference(page)
              await openApiClient(page, 'schedule', CREATE_USER)
              await step('API の参照のページで「職員を作る」のリクエストを開いている')

              await step(`認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`)
              await fillApiToken(page, token)

              await step(
                `メールを ${c.email}（${LOGIN_STAFF.name} のメール）にして、職員を作るリクエストを送る`,
              )
              await fillApiVariable(page, 'facility_id', STAFF_FORM.facilityId)
              await fillApiBody(page, {
                username: '見本 職員',
                email: c.email,
                department_id: STAFF_FORM.departmentId,
                team_id: STAFF_FORM.teamId,
                position_id: STAFF_FORM.positionId,
              })
              await apiClient(page).send.click()
              await expect(apiClient(page).dialog).toContainText('409 Conflict')
              await expect(apiClient(page).dialog).toContainText(
                '"message": "メール hina.aoki@example.com の職員はこの事業所にすでにいます"',
              )
              await check(
                '409 が返り、message に「メール hina.aoki@example.com の職員はこの事業所にすでにいます」が出る',
              )
            },
          )
        })
      }
    }
  })
})
