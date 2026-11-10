import { expect, test } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE, SEED_PATIENT } from '../../fixtures/env'
import { pageHeading } from '../../selectors/page'

test.describe('画面のデータの読み込み', () => {
  test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('route-loader-data 職員の管理の権限を持つ職員が、利用者、職員、部署とチーム、確認が必要な予定の画面を開いた場合、画面のデータが読み込まれて出ること', async ({
      page,
    }) => {
      await page.goto('/schedule')
      await expect(page.getByTestId('site-nav')).toBeVisible()
      await intro(page, '職員の管理の権限を持つ職員が開くと、6 つの画面のデータが出る')

      await step(page, '利用者の画面を開く', async () => {
        await page.goto('/patients')
      })
      await check(page, '利用者の一覧が出る', () =>
        expect(page.getByTestId(`patient-list-row-${SEED_PATIENT.id}`)).toBeVisible(),
      )

      await step(page, '利用者の詳細の画面を開く', async () => {
        await page.goto(`/patients/${SEED_PATIENT.id}`)
      })
      await check(page, '利用者の名前が出る', () =>
        expect(page.getByTestId('patient-detail-name')).toHaveText(SEED_PATIENT.name),
      )

      await step(page, '職員の画面を開く', async () => {
        await page.goto('/staff')
      })
      await check(page, '職員の一覧が出る', () =>
        expect(page.getByTestId(`staff-list-row-${LOGIN_STAFF.id}`)).toBeVisible(),
      )

      await step(page, '職員の詳細の画面を開く', async () => {
        await page.goto(`/staff/${LOGIN_STAFF.id}`)
      })
      await check(page, '職員の名前が出る', () =>
        expect(page.getByTestId('staff-detail-name')).toHaveText(LOGIN_STAFF.name),
      )

      await step(page, '部署とチームの画面を開く', async () => {
        await page.goto('/organization')
      })
      await check(page, '部署とチームの一覧が出る', async () => {
        await expect(pageHeading(page, '部署とチーム')).toBeVisible()
        await expect(
          page
            .getByTestId('organization-list-department-table')
            .or(page.getByTestId('organization-list-department-empty')),
        ).toBeVisible()
      })

      await step(page, '確認が必要な予定の画面を開く', async () => {
        await page.goto('/schedule/review')
      })
      await check(page, '確認が必要な予定の一覧が、読み込みの誤りなしで出る', async () => {
        await expect(
          page.getByTestId('calendar-review-table').or(page.getByTestId('calendar-review-empty')),
        ).toBeVisible()
        await expect(page.getByTestId('calendar-review-error')).toBeHidden()
      })
    })
  })
})
