import { expect, test, type Browser } from '@playwright/test'

import { issueAccessToken, routeApiReference } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import { HAYASHI, LEADER, LOGIN_EMAIL, LOGIN_STAFF, TEAM_MEMBER } from '../../fixtures/env'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { openApiClient } from '../../screens/apiReference'
import {
  fillApiBody,
  fillApiToken,
  fillApiVariable,
} from '../../widgets/apiClient/actions/apiClient'
import { apiClient } from '../../selectors/apiReference'

/** 指定した職員の予定の閲覧（schedule.user.read）。初期のマイグレーションが入れる権限である。 */
const USER_READ_POLICY = '01M5E1S42TTS7QZK05YGS0GYR9'

const ADD_POLICY = { tag: 'staff', method: 'post', path: '/v1/users/{user_id}/policies' }
const REMOVE_POLICY = {
  tag: 'staff',
  method: 'delete',
  path: '/v1/users/{user_id}/policies/{user_policy_id}',
}

/** 録画の外で、email の職員のトークンを取る。 */
const tokenOf = (browser: Browser, email: string) =>
  prepareOutsideRecording(browser, {}, (page) => issueAccessToken(page.request, email))

const ADD_REQUEST = `${TEAM_MEMBER.name} に、${HAYASHI.name} を対象にした「指定した職員の予定の閲覧」を足すリクエストを送る`

test.describe('職員の管理', () => {
  test.describe('職員ごとの権限', () => {
    test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり、API の参照のページ）`, () => {
      test('staff-policy-add-remove 職員の管理の権限を持つ職員が権限を足して外した場合、足した権限が職員の権限に出て、外すと消えること', async ({
        browser,
        context,
      }) => {
        const token = await tokenOf(browser, LOGIN_EMAIL)

        const page = await context.newPage()
        await routeApiReference(page)
        await openApiClient(page, 'schedule', ADD_POLICY)
        await expect(apiClient(page).send).toBeVisible()
        await intro(
          page,
          '職員の管理の権限を持つ職員が、職員に権限を足すと職員の権限に出て、外すと消える\n前提 API の参照のページで「職員に権限を足す」のリクエストを開いている',
        )

        await step(page, `認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`, () =>
          fillApiToken(page, token),
        )
        let userPolicyId = ''
        await step(page, ADD_REQUEST, async () => {
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
          userPolicyId =
            policies.find((p) => p.policy_id === USER_READ_POLICY)?.user_policy_id ?? ''
        })
        await check(
          page,
          `201 が返り、${TEAM_MEMBER.name} の権限に schedule.user.read（対象は ${HAYASHI.name}）が出る`,
          async () => {
            await expect(apiClient(page).dialog).toContainText('201 Created')
            await expect(apiClient(page).dialog).toContainText('"code": "schedule.user.read"')
          },
        )

        await step(
          page,
          '「職員の権限を外す」のリクエストを開き、足した権限を外すリクエストを送る',
          async () => {
            await apiClient(page).dialog.press('Escape')
            await openApiClient(page, 'schedule', REMOVE_POLICY)
            await fillApiToken(page, token)
            await fillApiVariable(page, 'user_id', TEAM_MEMBER.id)
            await fillApiVariable(page, 'user_policy_id', userPolicyId)
            await apiClient(page).send.click()
          },
        )
        await check(
          page,
          `200 が返り、${TEAM_MEMBER.name} の権限から schedule.user.read が消える`,
          async () => {
            await expect(apiClient(page).dialog).toContainText('200 OK')
            await expect(apiClient(page).dialog).toContainText('"code": "schedule.self.edit"')
            await expect(apiClient(page).dialog).not.toContainText('"code": "schedule.user.read"')
          },
        )
      })
    })

    test.describe(`${LEADER.staff.name}（チームリーダー、職員の管理の権限なし、API の参照のページ）`, () => {
      test('staff-policy-add-forbidden 職員の管理の権限を持たない職員が権限を足そうとした場合、403 が返ること', async ({
        browser,
        context,
      }) => {
        const token = await tokenOf(browser, LEADER.email)

        const page = await context.newPage()
        await routeApiReference(page)
        await openApiClient(page, 'schedule', ADD_POLICY)
        await expect(apiClient(page).send).toBeVisible()
        await intro(
          page,
          '職員の管理の権限を持たない職員が、職員に権限を足そうとすると 403 が返る\n前提 API の参照のページで「職員に権限を足す」のリクエストを開いている',
        )

        await step(page, `認証の欄に ${LEADER.staff.name} のトークンを入れる（伏せ字で出る）`, () =>
          fillApiToken(page, token),
        )
        await step(page, ADD_REQUEST, async () => {
          await fillApiVariable(page, 'user_id', TEAM_MEMBER.id)
          await fillApiBody(page, {
            policy_id: USER_READ_POLICY,
            target_user_ids: [HAYASHI.id],
          })
          await apiClient(page).send.click()
        })
        await check(page, '403 が返り、code は forbidden になる', async () => {
          await expect(apiClient(page).dialog).toContainText('403 Forbidden')
          await expect(apiClient(page).dialog).toContainText('"code": "forbidden"')
        })
      })
    })
  })
})
