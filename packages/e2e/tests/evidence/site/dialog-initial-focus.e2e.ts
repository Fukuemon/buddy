import { expect, test } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF, SEED_PATIENT } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

test.describe('入力のダイアログ', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}利用者、職員、部署とチームの入力のダイアログを開いた場合、名前の欄にフォーカスがあること`, async ({
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
              open: 'patient-list-new',
              dialog: 'patient-new-dialog',
              name: 'patient-new-name',
              label: '利用者の登録',
            },
            {
              url: `/patients/${SEED_PATIENT.id}`,
              open: 'patient-detail-edit',
              dialog: 'patient-detail-edit-dialog',
              name: 'patient-detail-name-input',
              label: '利用者の変更',
            },
            {
              url: '/staff',
              open: 'staff-list-new',
              dialog: 'staff-new-dialog',
              name: 'staff-new-name',
              label: '職員の登録',
            },
            {
              url: `/staff/${LOGIN_STAFF.id}`,
              open: 'staff-detail-edit',
              dialog: 'staff-detail-edit-dialog',
              name: 'staff-detail-name-input',
              label: '職員の情報',
            },
            {
              url: '/organization',
              open: 'organization-list-department-new',
              dialog: 'organization-list-department-dialog',
              name: 'organization-list-department-name',
              label: '部署の作成',
            },
          ]
          for (const { url, open, dialog, name, label } of opens) {
            await page.goto(url)
            await step(`${label}のダイアログを開く`)
            await page.getByTestId(open).click()
            await expect(page.getByTestId(name)).toBeFocused()
            await check(`${label}のダイアログで、名前の欄にフォーカスがある`)
            await page.keyboard.press('Escape')
            await expect(page.getByTestId(dialog)).toBeHidden()
          }
        },
      )
    })
  }
})
