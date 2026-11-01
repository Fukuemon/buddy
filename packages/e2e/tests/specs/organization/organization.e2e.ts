import { expect, test } from '@playwright/test'

import { LEADER_STATE } from '../../fixtures/env'
import { createTeam, moveStaffToTeam, newUnitName } from '../../fixtures/organization'
import { issueManagerToken, newStaff, registerStaff } from '../../fixtures/staff'

test.describe('部署とチーム', () => {
  test.describe('チームの作成', () => {
    test('職員の管理の権限を持つ職員が色を選んでチームを作った場合、チームの一覧に色の点と名前が出ること', async ({
      page,
    }) => {
      const name = newUnitName('team')

      await page.goto('/organization')
      await page.getByTestId('organization-list-team-new').click()
      const dialog = page.getByTestId('organization-list-team-dialog')
      await dialog.getByTestId('organization-list-team-name').fill(name)
      await dialog.getByTestId('organization-list-team-color-purple').click()
      await expect(dialog.getByTestId('organization-list-team-color-purple')).toBeChecked()
      await dialog.getByTestId('organization-list-team-color-green').click()
      await expect(dialog.getByTestId('organization-list-team-color-purple')).not.toBeChecked()
      await dialog.getByTestId('organization-list-team-submit').click()

      await expect(dialog).toHaveCount(0)
      const row = page.getByTestId(/^organization-list-team-row-/).filter({ hasText: name })
      await expect(row).toHaveCount(1)
      await expect(row.getByTestId(/^organization-list-team-edit-/)).toHaveAccessibleName(
        `${name}を編集`,
      )
      await expect(row.getByTestId(/^organization-list-team-dot-/)).toHaveClass(/bg-team-green/)
    })
  })

  test.describe('チームの色の変更', () => {
    test('チームの色を変えた場合、職員の一覧とカレンダーの絞り込みの見出しの点が新しい色になること', async ({
      page,
      request,
    }) => {
      const token = await issueManagerToken(request)
      const teamId = await createTeam(request, token, { name: newUnitName('color'), color: 'blue' })
      const staff = newStaff('team-color')
      const registered = await registerStaff(request, token, staff)
      expect(registered.ok()).toBe(true)
      const { id: staffId } = (await registered.json()) as { id: string }
      await moveStaffToTeam(request, token, { id: staffId, name: staff.name }, teamId)

      await page.goto('/organization')
      await page.getByTestId(`organization-list-team-edit-${teamId}`).click()
      const dialog = page.getByTestId('organization-list-team-dialog')
      await dialog.getByTestId('organization-list-team-color-lime').click()
      await dialog.getByTestId('organization-list-team-submit').click()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByTestId(`organization-list-team-dot-${teamId}`)).toHaveClass(
        /bg-team-lime/,
      )

      await page.goto('/staff')
      await page.getByTestId('staff-list-search').fill(staff.name)
      await expect(page.getByTestId(`staff-list-team-dot-${staffId}`)).toHaveClass(/bg-team-lime/)

      await page.goto('/schedule')
      await expect(page.getByTestId(`staff-filter-team-dot-${teamId}`)).toHaveClass(/bg-team-lime/)
    })
  })

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
