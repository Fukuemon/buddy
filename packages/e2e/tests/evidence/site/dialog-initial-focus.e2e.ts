import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE, SEED_PATIENT } from '../../fixtures/env'

test.describe('入力のダイアログ', () => {
  test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('dialog-initial-focus 利用者の登録と変更、職員の登録と情報、部署の作成のダイアログを開いた場合、名前の欄にフォーカスがあること', async ({
      page,
    }) => {
      const opens = [
        {
          url: '/patients',
          open: page.getByTestId('patient-list-new'),
          dialog: page.getByTestId('patient-new-dialog'),
          name: page.getByTestId('patient-new-name'),
          label: '利用者の登録',
        },
        {
          url: `/patients/${SEED_PATIENT.id}`,
          open: page.getByTestId('patient-detail-edit'),
          dialog: page.getByTestId('patient-detail-edit-dialog'),
          name: page.getByTestId('patient-detail-name-input'),
          label: '利用者の変更',
        },
        {
          url: '/staff',
          open: page.getByTestId('staff-list-new'),
          dialog: page.getByTestId('staff-new-dialog'),
          name: page.getByTestId('staff-new-name'),
          label: '職員の登録',
        },
        {
          url: `/staff/${LOGIN_STAFF.id}`,
          open: page.getByTestId('staff-detail-edit'),
          dialog: page.getByTestId('staff-detail-edit-dialog'),
          name: page.getByTestId('staff-detail-name-input'),
          label: '職員の情報',
        },
        {
          url: '/organization',
          open: page.getByTestId('organization-list-department-new'),
          dialog: page.getByTestId('organization-list-department-dialog'),
          name: page.getByTestId('organization-list-department-name'),
          label: '部署の作成',
        },
      ]
      await page.goto('/patients')
      await expect(page.getByTestId('patient-list-new')).toBeVisible()
      await intro(page, '5 つの入力のダイアログを開くと、名前の欄にフォーカスがある')

      for (const { url, open, dialog, name, label } of opens) {
        await step(page, `${label}のダイアログを開く`, async () => {
          await page.goto(url)
          await open.click()
        })
        await check(page, `${label}のダイアログで、名前の欄にフォーカスがある`, () =>
          expect(name).toBeFocused(),
        )
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
      }
    })
  })
})
