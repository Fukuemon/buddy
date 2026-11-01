import { expect, test } from '@playwright/test'

import { LEADER_STATE, LOGIN_STAFF } from '../../fixtures/env'
import { patientOptionByName } from '../../selectors/patientSelect'

/** 走らせるたびに違う利用者の名前にする。 */
const newPatientName = (label: string) => `E2E ${label} ${Date.now()}`

test.describe('利用者の一覧', () => {
  test.describe('利用者の登録', () => {
    test('職員の管理の権限を持つ職員が利用者を登録した場合、利用者の一覧に出て、予定の作成の利用者の候補に出ること', async ({
      page,
    }) => {
      const name = newPatientName('patient')

      await page.goto('/patients')
      await page.getByTestId('patient-list-new').click()
      const dialog = page.getByTestId('patient-new-dialog')
      await dialog.getByTestId('patient-new-name').fill(name)
      await dialog.getByTestId('patient-new-service').selectOption({ index: 1 })
      await dialog.getByTestId('patient-new-time-afternoon').check()
      await dialog.getByTestId('patient-new-gender-male').check()
      await dialog.getByTestId('patient-new-staff').selectOption(LOGIN_STAFF.id)
      await dialog.getByTestId('patient-new-submit').click()
      await expect(dialog).toHaveCount(0)

      await page.getByTestId('patient-list-search').fill(name)
      await expect(page.getByTestId('patient-list-count')).toHaveText('1 人')
      const table = page.getByTestId('patient-list-table')
      await expect(table).toContainText(name)
      await expect(table).toContainText(LOGIN_STAFF.name)
      await expect(table).toContainText('午後')

      await page.goto('/schedule?view=day')
      await page.getByTestId('schedule-create-open').click()
      await page.getByTestId('schedule-kind-tab-visit').check()
      await page.getByTestId('schedule-field-patient').click()
      await page.getByTestId('patient-select-search').fill(name)
      await expect(patientOptionByName(page, name)).toBeVisible()
    })
  })

  test.describe('権限が無い職員', () => {
    test.use({ storageState: LEADER_STATE })

    test('職員の管理の権限を持たない職員が利用者の画面の URL を開いた場合、利用者の管理の画面が出ないこと', async ({
      page,
    }) => {
      for (const url of ['/patients', '/patients/new']) {
        await page.goto(url)
        await expect(page.getByTestId('page-forbidden')).toBeVisible()
        await expect(page.getByTestId('site-nav')).not.toContainText('利用者')
        await expect(page.getByTestId('patient-list-table')).toHaveCount(0)
        await expect(page.getByTestId('patient-new-dialog')).toHaveCount(0)
      }
    })
  })
})
