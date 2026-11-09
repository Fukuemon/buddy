import { expect, test } from '@playwright/test'

import { LEADER_STATE } from '../../fixtures/env'
import { issueManagerToken, newStaff, registerStaffId } from '../../fixtures/staff'

test.describe('職員の一覧', () => {
  test.describe('権限が無い職員', () => {
    test.use({ storageState: LEADER_STATE })

    test('職員の管理の権限を持たない職員が職員の画面の URL を開いた場合、職員の管理の画面が出ないこと', async ({
      page,
      request,
    }) => {
      const id = await registerStaffId(request, await issueManagerToken(), newStaff('hidden'))

      for (const url of ['/staff', '/staff/new', `/staff/${id}`]) {
        await page.goto(url)
        await expect(page.getByTestId('page-forbidden')).toBeVisible()
        await expect(page.getByTestId('site-nav')).not.toContainText('職員')
        await expect(page.getByTestId('staff-list-table')).toHaveCount(0)
        await expect(page.getByTestId('staff-new-dialog')).toHaveCount(0)
        await expect(page.getByTestId('staff-detail-name')).toHaveCount(0)
      }
    })
  })
})
