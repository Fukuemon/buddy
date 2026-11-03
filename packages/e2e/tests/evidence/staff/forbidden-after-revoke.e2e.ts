import { expect, test } from '@playwright/test'

import { LEADER, TEAM_MEMBER } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import {
  STAFF_MANAGE_CODE,
  addPolicy,
  issueManagerToken,
  policyIdOf,
  removePolicy,
} from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'

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
            const policyId = await policyIdOf(request, token, STAFF_MANAGE_CODE)
            const added = await addPolicy(request, token, LEADER.staff.id, policyId)
            expect(added.ok()).toBe(true)
            const detail = (await added.json()) as {
              policies: { code: string; user_policy_id: string | null }[]
            }
            const granted = detail.policies.find((p) => p.code === STAFF_MANAGE_CODE)
            if (!granted?.user_policy_id) throw new Error('足した職員の管理の権限の ID が無い')
            userPolicyId = granted.user_policy_id
            await page.goto('/staff')
            await signInAtBroker(page, LEADER.email)
          },
          async ({ page, step, check }) => {
            await page.goto(`/staff/${TEAM_MEMBER.id}`)
            await expect(page.getByTestId('staff-detail-name')).toBeVisible()
            await step('職員の詳細を開き、「編集」を押す')
            await page.getByTestId('staff-detail-edit').click()
            const dialog = page.getByTestId('staff-detail-edit-dialog')
            await expect(dialog).toBeVisible()

            await step('（撮影のため）マネージャーが API で、この職員の職員の管理の権限を外す')
            const removed = await removePolicy(request, token, LEADER.staff.id, userPolicyId)
            expect(removed.ok()).toBe(true)

            await step('「保存」を押す')
            await dialog.getByTestId('staff-detail-save').click()
            await expect(dialog).toContainText('この操作をする権限がありません。')
            await check('「この操作をする権限がありません。」が出る')
          },
        )
      })
    }
  })
})
