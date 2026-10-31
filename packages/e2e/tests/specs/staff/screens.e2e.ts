import { expect, test } from '@playwright/test'

import { LEADER_STATE } from '../../fixtures/env'
import { createNormalSchedule } from '../../fixtures/schedule'
import {
  issueManagerToken,
  leaveStaff,
  listPositions,
  listUnits,
  newStaff,
  registerStaffId,
  STAFF_FORM,
} from '../../fixtures/staff'

/** 休職と退職の確認に残る予定の日。今日より後にする。 */
const FUTURE_DATE = '2030-01-08'

test.describe('職員の一覧', () => {
  test.describe('職員の登録', () => {
    test('職員の管理の権限を持つ職員がメールアドレスと役職で職員を登録した場合、一覧に出て、役職に決まっている権限が付くこと', async ({
      page,
      request,
    }) => {
      const staff = newStaff('screen')
      const positions = await listPositions(request, await issueManagerToken(request))
      const member = positions.find((p) => p.id === STAFF_FORM.positionId)
      expect(member).toBeDefined()

      await page.goto('/staff')
      await page.getByTestId('staff-list-new').click()
      const dialog = page.getByTestId('staff-new-dialog')
      await dialog.getByTestId('staff-new-name').fill(staff.name)
      await dialog.getByTestId('staff-new-email').fill(staff.email)
      await dialog.getByTestId('staff-new-position').selectOption(STAFF_FORM.positionId)
      await dialog.getByTestId('staff-new-submit').click()

      await expect(page).toHaveURL(/\/staff\/[0-9A-HJKMNP-TV-Z]{26}$/)
      await expect(page.getByTestId('staff-detail-name')).toHaveText(staff.name)
      await page.getByTestId('staff-detail-tab-policies').click()
      for (const { code } of member?.policies ?? []) {
        await expect(page.getByTestId(`staff-policy-row-${code}`)).toContainText('✓ 付いている')
        await expect(page.getByTestId(`staff-policy-row-${code}`)).toContainText('役職で付く')
      }

      await page.getByTestId('staff-detail-back').click()
      await page.getByTestId('staff-list-search').fill(staff.name)
      await expect(page.getByTestId('staff-list-count')).toHaveText('1 人')
      await expect(page.getByTestId('staff-list-table')).toContainText(staff.name)
    })
  })

  test.describe('権限が無い職員', () => {
    test.use({ storageState: LEADER_STATE })

    test('職員の管理の権限を持たない職員が職員の画面の URL を開いた場合、職員の管理の画面が出ないこと', async ({
      page,
      request,
    }) => {
      const id = await registerStaffId(
        request,
        await issueManagerToken(request),
        newStaff('hidden'),
      )

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

  test.describe('役職と権限', () => {
    test('職員の役職を変え、権限を足し外しした場合、詳細の権限が変えたとおりに出ること', async ({
      page,
      request,
    }) => {
      const manager = await issueManagerToken(request)
      const staff = newStaff('policies')
      const id = await registerStaffId(request, manager, staff)
      const other = (await listPositions(request, manager)).find(
        (p) => p.id !== STAFF_FORM.positionId && !p.policies.some((q) => q.code === 'staff.manage'),
      )
      expect(other).toBeDefined()

      await page.goto(`/staff/${id}`)
      await page.getByTestId('staff-detail-position-change').click()
      const position = page.getByTestId('staff-position-dialog')
      await position.getByTestId(`staff-position-option-${other?.id}`).check()
      await position.getByTestId('staff-position-submit').click()
      await expect(page.getByTestId('staff-detail-position-name')).toHaveText(other?.name ?? '')

      await page.getByTestId('staff-detail-tab-policies').click()
      const owned = other?.policies[0]?.code ?? ''
      await expect(page.getByTestId(`staff-policy-row-${owned}`)).toContainText('✓ 付いている')
      await page.getByTestId('staff-detail-policies-change').click()
      const policies = page.getByTestId('staff-policies-dialog')
      await policies.getByTestId(`staff-policies-option-${owned}`).uncheck()
      await policies.getByTestId('staff-policies-option-schedule.all.read').check()
      await policies.getByTestId('staff-policies-submit').click()
      await expect(policies).toHaveCount(0)

      await expect(page.getByTestId(`staff-policy-row-${owned}`)).toContainText('— 付いていない')
      const added = page.getByTestId('staff-policy-row-schedule.all.read')
      await expect(added).toContainText('✓ 付いている')
      await expect(added).toContainText('個別に足した')
    })
  })

  test.describe('休職と復職', () => {
    test('職員を休職にした場合、その日以降の予定が一覧で出て、確定すると職員の状態が休職になること', async ({
      page,
      request,
    }) => {
      const manager = await issueManagerToken(request)
      const id = await registerStaffId(request, manager, newStaff('leave-screen'))
      const created = await createNormalSchedule(request, manager, STAFF_FORM.facilityId, {
        staffId: id,
        title: `E2E の休職の会議 ${Date.now()}`,
        date: FUTURE_DATE,
      })
      const scheduleId = ((await created.json()) as { id: string }).id

      await page.goto(`/staff/${id}`)
      await page.getByTestId('staff-detail-menu').click()
      await page.getByTestId('staff-detail-leave').click()
      const dialog = page.getByTestId('staff-leave-dialog')
      await expect(
        dialog.getByTestId(`staff-leave-assignment-schedule-${scheduleId}`),
      ).toContainText('2030/01/08')
      await dialog.getByTestId('staff-leave-submit').click()

      await expect(dialog).toHaveCount(0)
      await expect(page.getByTestId('staff-detail-status')).toHaveText('休職')
    })

    test('休職の職員を復職にした場合、職員の状態が有効に戻ること', async ({ page, request }) => {
      const manager = await issueManagerToken(request)
      const id = await registerStaffId(request, manager, newStaff('reinstate-screen'))
      expect((await leaveStaff(request, manager, id)).status()).toBe(200)

      await page.goto(`/staff/${id}`)
      await expect(page.getByTestId('staff-detail-status')).toHaveText('休職')
      await page.getByTestId('staff-detail-menu').click()
      await page.getByTestId('staff-detail-reinstate').click()

      await expect(page.getByTestId('staff-detail-status')).toHaveText('有効')
    })
  })

  test.describe('退職', () => {
    test('その日以降の予定が残る職員を退職にしようとした場合、残る予定が出て、退職を確定できないこと', async ({
      page,
      request,
    }) => {
      const manager = await issueManagerToken(request)
      const staff = newStaff('retire-screen')
      const id = await registerStaffId(request, manager, staff)
      const created = await createNormalSchedule(request, manager, STAFF_FORM.facilityId, {
        staffId: id,
        title: `E2E の退職の会議 ${Date.now()}`,
        date: FUTURE_DATE,
      })
      const scheduleId = ((await created.json()) as { id: string }).id

      await page.goto(`/staff/${id}`)
      await page.getByTestId('staff-detail-menu').click()
      await page.getByTestId('staff-detail-retire').click()
      const dialog = page.getByTestId('staff-retire-dialog')

      await expect(dialog).toContainText(`${staff.name} を退職にできません`)
      await expect(
        dialog.getByTestId(`staff-retire-assignment-schedule-${scheduleId}`),
      ).toBeVisible()
      await expect(dialog.getByTestId('staff-retire-submit')).toHaveAttribute(
        'aria-disabled',
        'true',
      )
    })
  })
})
