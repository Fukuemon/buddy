import { expect, test } from '@playwright/test'

import { LEADER_STATE } from '../../fixtures/env'
import { newStaff, STAFF_FORM } from '../../fixtures/staff'

test.describe('職員の一覧', () => {
  test.describe('職員の登録', () => {
    test('職員の管理の権限を持つ職員がメールアドレスと役職で職員を登録した場合、一覧に出ること', async ({
      page,
    }) => {
      const staff = newStaff('screen')

      await page.goto('/staff')
      await page.getByTestId('staff-list-new').click()
      const dialog = page.getByTestId('staff-new-dialog')
      await dialog.getByTestId('staff-new-name').fill(staff.name)
      await dialog.getByTestId('staff-new-email').fill(staff.email)
      await dialog.getByTestId('staff-new-position').selectOption(STAFF_FORM.positionId)
      await dialog.getByTestId('staff-new-submit').click()

      await expect(dialog).toHaveCount(0)
      await page.getByTestId('staff-list-search').fill(staff.name)
      await expect(page.getByTestId('staff-list-count')).toHaveText('1 人')
      await expect(page.getByTestId('staff-list-table')).toContainText(staff.name)
    })
  })

  test.describe('権限が無い職員', () => {
    test.use({ storageState: LEADER_STATE })

    test('職員の管理の権限を持たない職員が職員の画面の URL を開いた場合、職員の管理の画面が出ないこと', async ({
      page,
    }) => {
      for (const url of ['/staff', '/staff/new']) {
        await page.goto(url)
        await expect(page.getByTestId('page-forbidden')).toBeVisible()
        await expect(page.getByTestId('site-nav')).not.toContainText('職員')
        await expect(page.getByTestId('staff-list-table')).toHaveCount(0)
        await expect(page.getByTestId('staff-new-dialog')).toHaveCount(0)
      }
    })
  })
})
