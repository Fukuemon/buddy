import { expect, test } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF, SEED_PATIENT } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

test.describe('入力のダイアログ', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}利用者の登録と変更、職員の登録と情報、部署の作成のダイアログを開いた場合、名前の欄にフォーカスがあること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'dialog-initial-focus',
          title: '5 つの入力のダイアログを開くと、名前の欄にフォーカスがある',
          actor: MANAGER,
          variant,
        },
        async (page) => {
          await page.goto('/patients')
          await signInAtBroker(page, LOGIN_EMAIL)
        },
        async ({ page, step, check }) => {
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
          for (const { url, open, dialog, name, label } of opens) {
            await page.goto(url)
            await step(`${label}のダイアログを開く`)
            await open.click()
            await expect(name).toBeFocused()
            await check(`${label}のダイアログで、名前の欄にフォーカスがある`)
            await page.keyboard.press('Escape')
            await expect(dialog).toBeHidden()
          }
        },
      )
    })
  }
})
