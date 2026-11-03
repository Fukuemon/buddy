import { expect, test } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF, SEED_PATIENT } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { pageHeading } from '../../selectors/page'
import { signInAtBroker } from '../../screens/login'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

test.describe('画面のデータの読み込み', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}職員の管理の権限を持つ職員が、利用者、職員、部署とチーム、確認が必要な予定の画面を開いた場合、画面のデータが読み込まれて出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'route-loader-data',
          title: '職員の管理の権限を持つ職員が開くと、6 つの画面のデータが出る',
          actor: MANAGER,
          variant,
        },
        async (page) => {
          await page.goto('/patients')
          await signInAtBroker(page, LOGIN_EMAIL)
        },
        async ({ page, step, check }) => {
          await step('利用者の画面を開く')
          await page.goto('/patients')
          await expect(page.getByTestId(`patient-list-row-${SEED_PATIENT.id}`)).toBeVisible()
          await check('利用者の一覧が出る')

          await step('利用者の詳細の画面を開く')
          await page.goto(`/patients/${SEED_PATIENT.id}`)
          await expect(page.getByTestId('patient-detail-name')).toHaveText(SEED_PATIENT.name)
          await check('利用者の名前が出る')

          await step('職員の画面を開く')
          await page.goto('/staff')
          await expect(page.getByTestId(`staff-list-row-${LOGIN_STAFF.id}`)).toBeVisible()
          await check('職員の一覧が出る')

          await step('職員の詳細の画面を開く')
          await page.goto(`/staff/${LOGIN_STAFF.id}`)
          await expect(page.getByTestId('staff-detail-name')).toHaveText(LOGIN_STAFF.name)
          await check('職員の名前が出る')

          await step('部署とチームの画面を開く')
          await page.goto('/organization')
          await expect(pageHeading(page, '部署とチーム')).toBeVisible()
          await expect(page.getByTestId('organization-list-loading')).toBeHidden()
          await expect(page.getByTestId('organization-list-error')).toBeHidden()
          await check('部署とチームの一覧が出る')

          await step('確認が必要な予定の画面を開く')
          await page.goto('/schedule/review')
          await expect(
            page.getByTestId('calendar-review-table').or(page.getByTestId('calendar-review-empty')),
          ).toBeVisible()
          await expect(page.getByTestId('calendar-review-error')).toBeHidden()
          await check('確認が必要な予定の一覧が、読み込みの誤りなしで出る')
        },
      )
    })
  }
})
