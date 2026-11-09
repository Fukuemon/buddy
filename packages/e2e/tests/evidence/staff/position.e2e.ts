import { expect, test, type Page } from '@playwright/test'

import { issueAccessToken, routeApiReference } from '../../fixtures/apiReference'
import { LOGIN_EMAIL, LOGIN_STAFF, SCHEDULE_URL } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { STAFF_FORM } from '../../fixtures/staff'
import { openApiClient, openApiReference } from '../../screens/apiReference'
import {
  fillApiBody,
  fillApiToken,
  fillApiVariable,
} from '../../widgets/apiClient/actions/apiClient'
import { apiClient } from '../../selectors/apiReference'

const TEAM_B = '01M3TC5MX04QJ19X6XR1ZCBZRJ'
const LEADER_POSITION = '01M3TC5PVG7W2H1H20W0T1ZVEJ'

/** API の参照のページを開き、トークンを取って、役職を変える相手のメンバーの職員を作る。シードの職員の権限を変えないため。 */
const prepareMember = async (page: Page) => {
  await routeApiReference(page)
  await openApiReference(page, 'schedule')
  const token = await issueAccessToken(page.request, LOGIN_EMAIL)
  const res = await page.request.post(
    `${SCHEDULE_URL}/v1/facilities/${STAFF_FORM.facilityId}/users`,
    {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        username: '見本 職員',
        email: `member-${Date.now()}@example.com`,
        department_id: STAFF_FORM.departmentId,
        team_id: TEAM_B,
        position_id: STAFF_FORM.positionId,
      },
    },
  )
  if (!res.ok()) throw new Error(`職員を作れない: ${res.status()} ${await res.text()}`)
  const { id } = (await res.json()) as { id: string }
  return { token, userId: id }
}

test.describe('職員の管理', () => {
  test.describe('職員の役職', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      test(`${variant.label ? `${variant.label}: ` : ''}メンバーの役職をリーダーに変えた場合、役職と権限がリーダーのデフォルトになること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'staff-position-change',
            title: 'メンバーの役職をリーダーに変えると、役職と権限がリーダーのデフォルトになる',
            actor: `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`,
            variant,
          },
          prepareMember,
          async ({ page, step, check }, { token, userId }) => {
            await routeApiReference(page)
            await openApiClient(page, 'schedule', {
              tag: 'staff',
              method: 'put',
              path: '/v1/users/{user_id}/position',
            })
            await step(
              'API の参照のページで「職員の役職を変える」のリクエストを開いている。チーム B のメンバーの「見本 職員」を、撮影の前に作ってある',
            )

            await step(`認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`)
            await fillApiToken(page, token)

            await step('「見本 職員」の役職をリーダーに変えるリクエストを送る')
            await fillApiVariable(page, 'user_id', userId)
            await fillApiBody(page, { position_id: LEADER_POSITION })
            await apiClient(page).send.click()
            await expect(apiClient(page).dialog).toContainText('200 OK')
            await expect(apiClient(page).dialog).toContainText('"name": "リーダー"')
            await expect(apiClient(page).dialog).toContainText('"code": "schedule.team.edit"')
            await check(
              '200 が返り、役職がリーダーになり、権限がリーダーのデフォルト（自分の予定の編集、チームの予定の閲覧と編集）になる',
            )
          },
        )
      })
    }
  })
})
