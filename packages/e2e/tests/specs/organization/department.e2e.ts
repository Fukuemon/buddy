import { expect, test } from '@playwright/test'

import { newUnitName } from '../../fixtures/organization'

test.describe('部署とチーム', () => {
  test.describe('部署の作成と名前の変更', () => {
    test('部署を作って名前を変えた場合、部署の一覧に変えた名前が出ること', async ({ page }) => {
      const name = newUnitName('dept')
      const renamed = `${name} 改`

      await page.goto('/organization')
      await page.getByTestId('organization-list-department-new').click()
      const dialog = page.getByTestId('organization-list-department-dialog')
      await dialog.getByTestId('organization-list-department-name').fill(name)
      await dialog.getByTestId('organization-list-department-submit').click()
      await expect(dialog).toHaveCount(0)
      const row = page.getByTestId(/^organization-list-department-row-/).filter({ hasText: name })
      await expect(row).toHaveCount(1)
      await row.getByTestId(/^organization-list-department-edit-/).click()
      await expect(dialog.getByTestId('organization-list-department-name')).toHaveValue(name)
      await dialog.getByTestId('organization-list-department-name').fill(renamed)
      await dialog.getByTestId('organization-list-department-submit').click()

      await expect(dialog).toHaveCount(0)
      await expect(row.getByTestId(/^organization-list-department-edit-/)).toHaveAccessibleName(
        `${renamed}を編集`,
      )
      await expect(row).toHaveCount(1)
    })
  })
})
