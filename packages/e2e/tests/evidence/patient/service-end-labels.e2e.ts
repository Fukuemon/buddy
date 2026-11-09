import { expect, test, type APIRequestContext } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { endPatientService, registerPatient } from '../../fixtures/patient'
import { issueManagerToken, STAFF_FORM } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/** マネージャーで、担当を青木 陽菜にした利用者を登録し、名前と ID を返す。 */
const registerPatientOf = async (request: APIRequestContext, name: string) => {
  const res = await registerPatient(request, await issueManagerToken(), STAFF_FORM.facilityId, {
    name,
    assignedStaffId: LOGIN_STAFF.id,
  })
  expect(res.status()).toBe(201)
  return { name, id: ((await res.json()) as { id: string }).id }
}

test.describe('利用者の詳細', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}利用中の利用者の詳細で「…」のメニューを開いた場合、「利用を終了する」が出ること`, async ({
      browser,
      request,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'patient-end-menu-label',
          title: '利用中の利用者の詳細の「…」のメニューに、「利用を終了する」が出る',
          actor: MANAGER,
          variant,
        },
        async (page) => {
          await page.goto('/patients')
          await signInAtBroker(page, LOGIN_EMAIL)
          return registerPatientOf(request, '見本 夏美')
        },
        async ({ page, step, check }, patient) => {
          await page.goto(`/patients/${patient.id}`)
          await expect(page.getByTestId('patient-detail-name')).toHaveText(patient.name)
          await step(`利用中の ${patient.name} の詳細を開いている`)

          await step('「…」を押す')
          await page.getByTestId('patient-detail-menu').click()
          await expect(page.getByTestId('patient-detail-end')).toHaveText('利用を終了する')
          await check('「…」のメニューに「利用を終了する」が出る')
        },
      )
    })

    test(`${prefix}利用の終了の確認のダイアログを開いた場合、何が起きるかと利用の再開で戻せることが書かれていること`, async ({
      browser,
      request,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'patient-end-dialog-text',
          title:
            '利用の終了の確認のダイアログに、何が起きるかと、利用の再開で戻せることが書かれている',
          actor: MANAGER,
          variant,
        },
        async (page) => {
          await page.goto('/patients')
          await signInAtBroker(page, LOGIN_EMAIL)
          return registerPatientOf(request, '見本 秋穂')
        },
        async ({ page, step, check }, patient) => {
          await page.goto(`/patients/${patient.id}`)
          await expect(page.getByTestId('patient-detail-name')).toHaveText(patient.name)
          await step(`利用中の ${patient.name} の詳細を開いている`)

          await step('「…」から「利用を終了する」を押す')
          await page.getByTestId('patient-detail-menu').click()
          await page.getByTestId('patient-detail-end').click()
          const dialog = page.getByTestId('patient-end-dialog')
          await expect(dialog.getByTestId('patient-end-schedules')).toHaveText(
            '今日以降の予定は残っていません。',
          )
          await expect(dialog).toContainText(`${patient.name} の利用を終了しますか`)
          await expect(dialog).toContainText(
            `利用を終了すると、${patient.name} は予定の利用者の候補と、利用者の一覧に、ふだんは出なくなります。`,
          )
          await expect(dialog).toContainText(
            '過去の予定は残り、利用を再開すると同じ利用者として戻せます。',
          )
          await expect(dialog.getByTestId('patient-end-submit')).toHaveText('利用を終了する')
          await check(
            '予定の候補と一覧に出なくなること、過去の予定が残ること、利用を再開すると戻せることが書かれ、確定のボタンは「利用を終了する」',
          )

          await step('(撮影のため、利用を終了せずに「キャンセル」で閉じる)')
          await dialog.getByTestId('patient-end-cancel').click()
          await expect(dialog).toHaveCount(0)
        },
      )
    })

    test(`${prefix}利用の終了の利用者の詳細で「…」のメニューを開いた場合、「利用を再開する」が出ること`, async ({
      browser,
      request,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'patient-resume-menu-label',
          title: '利用の終了の利用者の詳細の「…」のメニューに、「利用を再開する」が出る',
          actor: MANAGER,
          variant,
        },
        async (page) => {
          await page.goto('/patients')
          await signInAtBroker(page, LOGIN_EMAIL)
          const patient = await registerPatientOf(request, '見本 冬美')
          const ended = await endPatientService(request, await issueManagerToken(), patient.id)
          expect(ended.status()).toBe(200)
          return patient
        },
        async ({ page, step, check }, patient) => {
          await page.goto(`/patients/${patient.id}`)
          await expect(page.getByTestId('patient-detail-status')).toContainText('利用の終了')
          await step(`利用の終了の ${patient.name} の詳細を開いている（API で利用を終了してある）`)

          await step('「…」を押す')
          await page.getByTestId('patient-detail-menu').click()
          await expect(page.getByTestId('patient-detail-resume')).toHaveText('利用を再開する')
          await check('「…」のメニューに「利用を再開する」が出る')
        },
      )
    })
  }
})
