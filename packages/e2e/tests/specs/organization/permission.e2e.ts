import { expect, test } from '@playwright/test'

import { LEADER_STATE } from '../../fixtures/env'

test.describe('部署とチーム', () => {
  test.describe('権限が無い職員', () => {
    test.use({ storageState: LEADER_STATE })

    test('職員の管理の権限を持たない職員が画面の URL を開いた場合、部署とチームの管理の画面が出ないこと', async ({
      page,
    }) => {
      await page.goto('/organization')
      await expect(page.getByTestId('page-forbidden')).toBeVisible()
      await expect(page.getByTestId('site-nav')).not.toContainText('部署とチーム')
      await expect(page.getByTestId('organization-list-team-new')).toHaveCount(0)
      await expect(page.getByTestId('organization-list-department-new')).toHaveCount(0)
    })
  })
})
