import { expect, test, type APIRequestContext } from '@playwright/test'

import { LEADER, LEADER_STATE, LOGIN_STAFF } from '../../fixtures/env'
import { endPatientService, registerPatient } from '../../fixtures/patient'
import { issueManagerToken, STAFF_FORM } from '../../fixtures/staff'
import { patientOptionByName } from '../../selectors/patientSelect'

/** 走らせるたびに違う利用者の名前にする。 */
const newPatientName = (label: string) => `E2E ${label} ${Date.now()}`

/** マネージャーで、担当を青木 陽菜にした利用者を登録し、ID を返す。 */
const registerPatientId = async (request: APIRequestContext, name: string) => {
  const res = await registerPatient(
    request,
    await issueManagerToken(request),
    STAFF_FORM.facilityId,
    {
      name,
      assignedStaffId: LOGIN_STAFF.id,
    },
  )
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: string }).id
}

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
      await expect(page.getByTestId('patient-detail-name')).toHaveText(name)

      await page.getByTestId('patient-detail-back').click()
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
      playwright,
    }) => {
      // request のフィクスチャはリーダーのログインの状態を持ち、ブローカーでマネージャーのトークンを取れないので、状態の無いコンテキストで登録する
      const manager = await playwright.request.newContext()
      const id = await registerPatientId(manager, newPatientName('hidden'))
      await manager.dispose()

      for (const url of ['/patients', '/patients/new', `/patients/${id}`]) {
        await page.goto(url)
        await expect(page.getByTestId('page-forbidden')).toBeVisible()
        await expect(page.getByTestId('site-nav')).not.toContainText('利用者')
        await expect(page.getByTestId('patient-list-table')).toHaveCount(0)
        await expect(page.getByTestId('patient-new-dialog')).toHaveCount(0)
        await expect(page.getByTestId('patient-detail-name')).toHaveCount(0)
      }
    })
  })
})

test.describe('利用者の詳細', () => {
  test.describe('利用者の編集', () => {
    test('利用者の名前、サービス、希望、担当の職員を変えた場合、一覧に変えた値が出ること', async ({
      page,
      request,
    }) => {
      const name = newPatientName('edited')
      const id = await registerPatientId(request, name)

      await page.goto(`/patients/${id}`)
      await page.getByTestId('patient-detail-edit').click()
      const dialog = page.getByTestId('patient-detail-edit-dialog')
      await dialog.getByTestId('patient-detail-name-input').fill(`${name} 改`)
      await dialog.getByTestId('patient-detail-service-input').selectOption({ index: 2 })
      await dialog.getByTestId('patient-detail-time-input-afternoon').check()
      await dialog.getByTestId('patient-detail-gender-input-male').check()
      await dialog.getByTestId('patient-detail-staff-input').selectOption(LEADER.staff.id)
      await dialog.getByTestId('patient-detail-save').click()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByTestId('patient-detail-name')).toHaveText(`${name} 改`)

      await page.goto('/patients')
      await page.getByTestId('patient-list-search').fill(`${name} 改`)
      const row = page.getByTestId(`patient-list-row-${id}`)
      await expect(row).toContainText(`${name} 改`)
      await expect(row).toContainText(LEADER.staff.name)
      await expect(row).toContainText('午後')
      await expect(row).toContainText('男性')
    })
  })

  test.describe('利用の終了', () => {
    test('利用者を利用の終了にした場合、一覧のデフォルトの表示と予定の作成の利用者の候補に出ないこと', async ({
      page,
      request,
    }) => {
      const name = newPatientName('ended')
      const id = await registerPatientId(request, name)

      await page.goto(`/patients/${id}`)
      await page.getByTestId('patient-detail-menu').click()
      await page.getByTestId('patient-detail-end').click()
      const dialog = page.getByTestId('patient-end-dialog')
      await expect(dialog).toContainText(`${name} を利用の終了にしますか`)
      await expect(dialog.getByTestId('patient-end-schedules')).toHaveText(
        '今日以降の予定は残っていません。',
      )
      await dialog.getByTestId('patient-end-submit').click()
      await expect(page.getByTestId('patient-detail-status')).toContainText('利用の終了')

      await page.goto('/patients')
      await page.getByTestId('patient-list-search').fill(name)
      await expect(page.getByTestId('patient-list-empty')).toBeVisible()
      await page.getByTestId('patient-list-filter-status').selectOption('ended')
      await expect(page.getByTestId(`patient-list-row-${id}`)).toBeVisible()

      await page.goto('/schedule?view=day')
      await page.getByTestId('schedule-create-open').click()
      await page.getByTestId('schedule-kind-tab-visit').check()
      await page.getByTestId('schedule-field-patient').click()
      await expect(page.getByTestId(/^patient-select-option-/).first()).toBeVisible()
      await expect(page.getByTestId(`patient-select-option-${id}`)).toHaveCount(0)
    })
  })

  test.describe('利用の再開', () => {
    test('利用の終了の利用者の利用を再開した場合、一覧のデフォルトの表示に戻ること', async ({
      page,
      request,
    }) => {
      const name = newPatientName('resumed')
      const id = await registerPatientId(request, name)
      expect(
        (await endPatientService(request, await issueManagerToken(request), id)).status(),
      ).toBe(200)

      await page.goto(`/patients/${id}`)
      await expect(page.getByTestId('patient-detail-status')).toContainText('利用の終了')
      await page.getByTestId('patient-detail-menu').click()
      await page.getByTestId('patient-detail-resume').click()
      const dialog = page.getByTestId('patient-resume-dialog')
      await expect(dialog.getByTestId('patient-resume-staff')).toHaveValue(LOGIN_STAFF.id)
      await dialog.getByTestId('patient-resume-submit').click()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByTestId('patient-detail-status')).toHaveCount(0)

      await page.goto('/patients')
      await page.getByTestId('patient-list-search').fill(name)
      await expect(page.getByTestId(`patient-list-row-${id}`)).toBeVisible()
    })
  })
})
