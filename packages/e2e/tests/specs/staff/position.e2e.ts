import { expect, test } from '@playwright/test'

import {
  issueManagerToken,
  listPositions,
  newStaff,
  registerStaffId,
  STAFF_FORM,
} from '../../fixtures/staff'

test.describe('職員の詳細', () => {
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
  })
})
