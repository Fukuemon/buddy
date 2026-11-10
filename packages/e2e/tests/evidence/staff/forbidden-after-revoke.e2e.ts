import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LEADER, LEADER_STATE, TEAM_MEMBER } from '../../fixtures/env'
import {
  STAFF_MANAGE_CODE,
  addPolicy,
  issueManagerToken,
  policyIdOf,
  removePolicy,
} from '../../fixtures/staff'

test.describe('職員の詳細', () => {
  test.describe('操作の途中で権限を外されたとき', () => {
    test.describe(`${LEADER.staff.name}（チームリーダー、撮影のため職員の管理の権限を足した）`, () => {
      test.use({ storageState: LEADER_STATE })

      test('staff-forbidden-after-revoke 職員の詳細を開いた後に職員の管理の権限を外され、保存を押した場合、権限が無いことの文を出すこと', async ({
        context,
        request,
      }) => {
        // 録画の外で、マネージャーのトークンで森に職員の管理の権限を足す。page はその後に開く
        const token = await issueManagerToken()
        const policyId = await policyIdOf(request, token, STAFF_MANAGE_CODE)
        const added = await addPolicy(request, token, LEADER.staff.id, policyId)
        expect(added.ok()).toBe(true)
        const detail = (await added.json()) as {
          policies: { code: string; user_policy_id: string | null }[]
        }
        const userPolicyId = detail.policies.find(
          (p) => p.code === STAFF_MANAGE_CODE,
        )?.user_policy_id
        if (!userPolicyId) throw new Error('足した職員の管理の権限の ID が無い')

        const page = await context.newPage()
        await page.goto(`/staff/${TEAM_MEMBER.id}`)
        await expect(page.getByTestId('staff-detail-name')).toBeVisible()
        await intro(
          page,
          '職員の詳細を開いた後に職員の管理の権限を外されると、保存で権限が無いことの文が出る',
        )

        const dialog = page.getByTestId('staff-detail-edit-dialog')
        await step(page, '職員の詳細を開き、「編集」を押す', async () => {
          await page.getByTestId('staff-detail-edit').click()
          await expect(dialog).toBeVisible()
        })
        await step(
          page,
          '（撮影のため）マネージャーが API で、この職員の職員の管理の権限を外す',
          async () => {
            const removed = await removePolicy(request, token, LEADER.staff.id, userPolicyId)
            expect(removed.ok()).toBe(true)
          },
        )
        await step(page, '「保存」を押す', () => dialog.getByTestId('staff-detail-save').click())
        await check(page, '「この操作をする権限がありません。」が出る', () =>
          expect(dialog).toContainText('この操作をする権限がありません。'),
        )
      })
    })
  })
})
