import { expect, test, type APIRequestContext } from '@playwright/test'

import { LEADER, SCHEDULE_URL, TEAM_MEMBER } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { addPolicy, issueManagerToken } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'

/** 予定の API の権限の一覧から、職員の管理の権限（staff.manage）の ID を引く。 */
const staffManagePolicyId = async (request: APIRequestContext, token: string) => {
  const res = await request.get(`${SCHEDULE_URL}/v1/policies`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const policies = (await res.json()) as { id: string; code: string }[]
  const policy = policies.find((p) => p.code === 'staff.manage')
  if (policy === undefined) throw new Error('職員の管理の権限が無い')
  return policy.id
}

test.describe('職員の詳細', () => {
  test.describe('操作の途中で権限を外されたとき', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}職員の詳細を開いた後に職員の管理の権限を外され、保存を押した場合、権限が無いことの文を出すこと`, async ({
        browser,
        request,
      }) => {
        let userPolicyId = ''
        let token = ''
        await recordPrEvidence(
          browser,
          {
            name: 'staff-forbidden-after-revoke',
            title:
              '職員の詳細を開いた後に職員の管理の権限を外されると、保存で権限が無いことの文が出る',
            actor: `${LEADER.staff.name}（チームリーダー、撮影のため職員の管理の権限を足した）`,
            variant,
          },
          async (page) => {
            token = await issueManagerToken(request)
            const added = await addPolicy(
              request,
              token,
              LEADER.staff.id,
              await staffManagePolicyId(request, token),
            )
            expect(added.ok()).toBe(true)
            const detail = (await added.json()) as {
              policies: { code: string; user_policy_id: string | null }[]
            }
            userPolicyId =
              detail.policies.find((p) => p.code === 'staff.manage')?.user_policy_id ?? ''
            await page.goto('/staff')
            await signInAtBroker(page, LEADER.email)
          },
          async ({ page, step, check }) => {
            await page.goto(`/staff/${TEAM_MEMBER.id}`)
            await expect(page.getByTestId('staff-detail-name')).toBeVisible()
            await step('職員の詳細を開き、「編集」を押す')
            await page.getByTestId('staff-detail-edit').click()
            await expect(page.getByTestId('staff-detail-edit-dialog')).toBeVisible()

            await step('（撮影のため）マネージャーが API で、この職員の職員の管理の権限を外す')
            const removed = await request.delete(
              `${SCHEDULE_URL}/v1/users/${LEADER.staff.id}/policies/${userPolicyId}`,
              { headers: { Authorization: `Bearer ${token}` } },
            )
            expect(removed.ok()).toBe(true)

            await step('「保存」を押す')
            await page.getByTestId('staff-detail-save').click()
            await expect(page.getByTestId('staff-detail-edit-dialog')).toContainText(
              'この操作をする権限がありません。',
            )
            await check('「この操作をする権限がありません。」が出る')
          },
        )
      })
    }
  })
})
