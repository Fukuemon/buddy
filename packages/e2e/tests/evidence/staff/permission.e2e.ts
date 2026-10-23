import { expect, test } from '@playwright/test'

import { prepareApiReference, routeApiReference } from '../../fixtures/apiReference'
import { HAYASHI, LEADER, LOGIN_EMAIL, LOGIN_STAFF, TEAM_MEMBER } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import {
  fillApiBody,
  fillApiToken,
  fillApiVariable,
  openApiClient,
} from '../../screens/apiReference'
import { apiClient } from '../../selectors/apiReference'

/** 指定した職員の予定の閲覧（schedule.user.read）。初期のマイグレーションが入れる権限である。 */
const USER_READ_POLICY = '01M5E1S42TTS7QZK05YGS0GYR9'

const ADD_POLICY = { tag: 'staff', method: 'post', path: '/v1/users/{user_id}/policies' }
const REMOVE_POLICY = {
  tag: 'staff',
  method: 'delete',
  path: '/v1/users/{user_id}/policies/{user_policy_id}',
}

test.describe('職員の管理', () => {
  test.describe('職員ごとの権限', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}職員の管理の権限を持つ職員が権限を足して外した場合、足した権限が職員の権限に出て、外すと消えること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'staff-policy-add-remove',
            title: '職員の管理の権限を持つ職員が、職員に権限を足すと職員の権限に出て、外すと消える',
            actor: `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`,
            variant,
          },
          prepareApiReference('schedule', LOGIN_EMAIL),
          async ({ page, step, check }, token) => {
            await routeApiReference(page)
            await openApiClient(page, 'schedule', ADD_POLICY)
            await step('API の参照のページで「職員に権限を足す」のリクエストを開いている')

            await step(`認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`)
            await fillApiToken(page, token)

            await step(
              `${TEAM_MEMBER.name} に、${HAYASHI.name} を対象にした「指定した職員の予定の閲覧」を足すリクエストを送る`,
            )
            await fillApiVariable(page, 'user_id', TEAM_MEMBER.id)
            await fillApiBody(page, {
              policy_id: USER_READ_POLICY,
              target_user_ids: [HAYASHI.id],
            })
            const added = page.waitForResponse(
              (r) => r.request().method() === 'POST' && r.url().endsWith('/policies'),
            )
            await apiClient(page).send.click()
            const { policies } = (await (await added).json()) as {
              policies: { user_policy_id: string; policy_id: string }[]
            }
            const userPolicyId =
              policies.find((p) => p.policy_id === USER_READ_POLICY)?.user_policy_id ?? ''
            await expect(apiClient(page).dialog).toContainText('201 Created')
            await expect(apiClient(page).dialog).toContainText('"code": "schedule.user.read"')
            await check(
              `201 が返り、${TEAM_MEMBER.name} の権限に schedule.user.read（対象は ${HAYASHI.name}）が出る`,
            )

            await step('「職員の権限を外す」のリクエストを開き、足した権限を外すリクエストを送る')
            await apiClient(page).dialog.press('Escape')
            await openApiClient(page, 'schedule', REMOVE_POLICY)
            await fillApiToken(page, token)
            await fillApiVariable(page, 'user_id', TEAM_MEMBER.id)
            await fillApiVariable(page, 'user_policy_id', userPolicyId)
            await apiClient(page).send.click()
            await expect(apiClient(page).dialog).toContainText('200 OK')
            await expect(apiClient(page).dialog).toContainText('"code": "schedule.self.edit"')
            await expect(apiClient(page).dialog).not.toContainText('"code": "schedule.user.read"')
            await check(`200 が返り、${TEAM_MEMBER.name} の権限から schedule.user.read が消える`)
          },
        )
      })

      test(`${prefix}職員の管理の権限を持たない職員が権限を足そうとした場合、403 が返ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'staff-policy-add-forbidden',
            title: '職員の管理の権限を持たない職員が、職員に権限を足そうとすると 403 が返る',
            actor: `${LEADER.staff.name}（チームリーダー、職員の管理の権限なし）`,
            variant,
          },
          prepareApiReference('schedule', LEADER.email),
          async ({ page, step, check }, token) => {
            await routeApiReference(page)
            await openApiClient(page, 'schedule', ADD_POLICY)
            await step('API の参照のページで「職員に権限を足す」のリクエストを開いている')

            await step(`認証の欄に ${LEADER.staff.name} のトークンを入れる（伏せ字で出る）`)
            await fillApiToken(page, token)

            await step(
              `${TEAM_MEMBER.name} に、${HAYASHI.name} を対象にした「指定した職員の予定の閲覧」を足すリクエストを送る`,
            )
            await fillApiVariable(page, 'user_id', TEAM_MEMBER.id)
            await fillApiBody(page, {
              policy_id: USER_READ_POLICY,
              target_user_ids: [HAYASHI.id],
            })
            await apiClient(page).send.click()
            await expect(apiClient(page).dialog).toContainText('403 Forbidden')
            await expect(apiClient(page).dialog).toContainText('"code": "forbidden"')
            await check('403 が返り、code は forbidden になる')
          },
        )
      })
    }
  })
})
