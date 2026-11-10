import { expect, test } from '@playwright/test'

import {
  addPolicy,
  issueManagerToken,
  listPositions,
  newStaff,
  policyIdOf,
  registerStaffId,
  STAFF_FORM,
} from '../../fixtures/staff'

/** 事業所の全ての予定の閲覧。対象を指定しない権限で、メンバーの役職のデフォルトに無い。 */
const ALL_READ_CODE = 'schedule.all.read'

test.describe('職員の詳細', () => {
  test.describe('役職と権限', () => {
    test('職員の役職を変え、権限を足し外しした場合、詳細の権限が変えたとおりに出ること', async ({
      page,
      request,
    }) => {
      const manager = await issueManagerToken()
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
      await expect(
        page.getByTestId('staff-policy-group-position').getByTestId(`staff-policy-row-${owned}`),
      ).toBeVisible()
      await page.getByTestId('staff-detail-policies-change').click()
      const policies = page.getByTestId('staff-policies-dialog')
      await policies.getByTestId(`staff-policies-option-${owned}`).uncheck()
      await policies.getByTestId('staff-policies-option-schedule.all.read').check()
      await policies.getByTestId('staff-policies-submit').click()
      await expect(policies).toHaveCount(0)

      await expect(
        page
          .getByTestId('staff-policy-group-individual')
          .getByTestId('staff-policy-row-schedule.all.read'),
      ).toBeVisible()
      await expect(page.getByTestId(`staff-policy-row-${owned}`)).toHaveCount(0)
    })

    test('個別に足した権限を持つ職員の役職を変えた場合、残ることを示す注意が出て、変えた後も個別に足した権限に残ること', async ({
      page,
      request,
    }) => {
      const manager = await issueManagerToken()
      const id = await registerStaffId(request, manager, newStaff('position-keep'))
      const allRead = await policyIdOf(request, manager, ALL_READ_CODE)
      expect((await addPolicy(request, manager, id, allRead)).ok()).toBe(true)
      const other = (await listPositions(request, manager)).find(
        (p) =>
          p.id !== STAFF_FORM.positionId &&
          !p.policies.some((q) => q.code === 'staff.manage' || q.code === ALL_READ_CODE),
      )
      expect(other).toBeDefined()

      await page.goto(`/staff/${id}`)
      await page.getByTestId('staff-detail-position-change').click()
      const position = page.getByTestId('staff-position-dialog')
      await position.getByTestId(`staff-position-option-${other?.id}`).check()
      await expect(position.getByTestId('staff-position-note')).toContainText(
        '個別に足した権限（事業所の全ての予定の閲覧）は残ります。',
      )
      await position.getByTestId('staff-position-submit').click()
      await expect(page.getByTestId('staff-detail-position-name')).toHaveText(other?.name ?? '')

      await page.getByTestId('staff-detail-tab-policies').click()
      await expect(
        page
          .getByTestId('staff-policy-group-individual')
          .getByTestId(`staff-policy-row-${ALL_READ_CODE}`),
      ).toBeVisible()
    })
  })
})
