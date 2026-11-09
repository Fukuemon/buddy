import { expect, test } from '@playwright/test'

import {
  issueManagerToken,
  listUnits,
  newStaff,
  registerStaffId,
  STAFF_FORM,
} from '../../fixtures/staff'

test.describe('職員の詳細', () => {
  test.describe('プロフィールの編集', () => {
    test('職員の名前、電話番号、部署、チームを変えた場合、一覧と詳細に変えた値が出ること', async ({
      page,
      request,
    }) => {
      const manager = await issueManagerToken(request)
      const staff = newStaff('edited')
      const id = await registerStaffId(request, manager, staff)
      const team = (await listUnits(request, manager, 'teams')).find(
        (t) => t.id !== STAFF_FORM.teamId,
      )
      const department = (await listUnits(request, manager, 'departments'))[0]
      expect(team).toBeDefined()

      await page.goto(`/staff/${id}`)
      await page.getByTestId('staff-detail-edit').click()
      const dialog = page.getByTestId('staff-detail-edit-dialog')
      await dialog.getByTestId('staff-detail-name-input').fill(`${staff.name} 改`)
      await dialog.getByTestId('staff-detail-phone-input').fill('09012345678')
      await dialog.getByTestId('staff-detail-department-input').selectOption(department.id)
      await dialog.getByTestId('staff-detail-team-input').selectOption(team?.id ?? '')
      await dialog.getByTestId('staff-detail-save').click()

      await expect(page.getByTestId('staff-detail-name')).toHaveText(`${staff.name} 改`)
      const profile = page.getByTestId('staff-detail-profile')
      await expect(profile).toContainText('09012345678')
      await expect(profile).toContainText(department.name)
      await expect(profile).toContainText(team?.name ?? '')

      await page.goto('/staff')
      await page.getByTestId('staff-list-search').fill(`${staff.name} 改`)
      const row = page.getByTestId(`staff-list-row-${id}`)
      await expect(row).toContainText(`${staff.name} 改`)
      await expect(row).toContainText(team?.name ?? '')
    })
  })
})
