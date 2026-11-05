import { expect, test } from '@playwright/test'

import { LEADER, LEADER_STATE, LOGIN_STAFF, OKADA, OKADA_STATE } from '../../fixtures/env'

test.describe('自分の情報', () => {
  test.describe('職員の管理の権限を持たない職員', () => {
    test.use({ storageState: LEADER_STATE })

    test('アカウントのメニューから自分の情報を開いた場合、自分の名前、所属、持っている権限、カレンダーの連携が出て、職員の詳細へ移る操作が出ないこと', async ({
      page,
    }) => {
      await page.goto('/schedule')
      await page.getByTestId('viewer-menu-open').click()
      await page.getByTestId('viewer-profile').click()

      await expect(page).toHaveURL(/\/me$/)
      await expect(page.getByTestId('account-profile-name')).toHaveText(LEADER.staff.name)
      await expect(page.getByTestId('account-profile-email')).toHaveText(LEADER.email)
      await expect(page.getByTestId('account-profile-team')).not.toBeEmpty()
      await expect(page.getByTestId('account-profile-position')).not.toBeEmpty()
      await expect(page.getByTestId('account-profile-policy-list')).toBeVisible()
      await expect(page.getByTestId('account-profile-calendar')).toBeVisible()
      await expect(page.getByTestId('account-profile-staff-detail')).toHaveCount(0)
    })
  })

  test.describe('職員の管理の権限を持つ職員', () => {
    test('職員の詳細を開くを押した場合、自分の職員の詳細の画面へ移ること', async ({ page }) => {
      await page.goto('/me')
      await page.getByTestId('account-profile-staff-detail').click()

      await expect(page).toHaveURL(new RegExp(`/staff/${LOGIN_STAFF.id}$`))
      await expect(page.getByTestId('staff-detail-name')).toHaveText(LOGIN_STAFF.name)
    })
  })

  test.describe('カレンダーを結び付けた職員', () => {
    test.use({ storageState: OKADA_STATE })

    test('自分の情報を開いた場合、結び付いたカレンダーの ID が出ること', async ({ page }) => {
      await page.goto('/me')

      await expect(page.getByTestId('account-profile-calendar-id')).toHaveText(OKADA.calendarId)
      await expect(page.getByTestId('account-profile-calendar-not-linked')).toHaveCount(0)
    })
  })
})
