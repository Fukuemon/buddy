import { expect, test, type Page } from '@playwright/test'

import { LEADER, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { registerPatient } from '../../fixtures/patient'
import { issueManagerToken, STAFF_FORM } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'

/** 登録する利用者の名前。撮影の compose は撮るたびに作り直すので、固定の名前にする。 */
const NEW_PATIENT = '見本 春香'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

test.describe('利用者の一覧', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}職員の管理の権限を持つ職員が利用者を登録した場合、利用者の一覧に出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'patient-register-list',
          title: '職員の管理の権限を持つ職員が利用者を登録すると、利用者の一覧に出る',
          actor: MANAGER,
          variant,
        },
        async (page) => {
          await page.goto('/patients')
          await signInAtBroker(page, LOGIN_EMAIL)
        },
        async ({ page, step, check }) => {
          await page.goto('/patients')
          await expect(page.getByTestId('patient-list-table')).toBeVisible()
          await step('利用者の一覧を開いている')

          await step('「利用者を登録」を押し、名前、サービス、希望、担当の職員を入れて登録する')
          await page.getByTestId('patient-list-new').click()
          const dialog = page.getByTestId('patient-new-dialog')
          await dialog.getByTestId('patient-new-name').fill(NEW_PATIENT)
          await dialog.getByTestId('patient-new-service').selectOption({ index: 1 })
          await dialog.getByTestId('patient-new-time-afternoon').check()
          await dialog.getByTestId('patient-new-gender-female').check()
          await dialog.getByTestId('patient-new-staff').selectOption(LOGIN_STAFF.id)
          await dialog.getByTestId('patient-new-submit').click()
          await expect(dialog).toHaveCount(0)

          await step(`名前の検索に「${NEW_PATIENT}」を入れる`)
          await page.getByTestId('patient-list-search').fill(NEW_PATIENT)
          await expect(page.getByTestId('patient-list-count')).toHaveText('1 人')
          await expect(page.getByTestId('patient-list-table')).toContainText(LOGIN_STAFF.name)
          await check(`利用者の一覧に ${NEW_PATIENT} が、担当の職員とサービスと希望とともに出る`)
        },
      )
    })

    test(`${prefix}職員の管理の権限を持つ職員が利用者を登録した場合、予定の作成の利用者の候補に出ること`, async ({
      browser,
      request,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'patient-register-candidate',
          title: '登録した利用者は、予定の作成の利用者の候補に出る',
          actor: MANAGER,
          variant,
        },
        async (page) => {
          await page.goto('/patients')
          await signInAtBroker(page, LOGIN_EMAIL)
          const name = `${NEW_PATIENT} 候補`
          const res = await registerPatient(
            request,
            await issueManagerToken(request),
            STAFF_FORM.facilityId,
            { name, assignedStaffId: LOGIN_STAFF.id },
          )
          expect(res.status()).toBe(201)
          return { name, id: ((await res.json()) as { id: string }).id }
        },
        async ({ page, step, check }, patient) => {
          await page.goto('/patients')
          await page.getByTestId('patient-list-search').fill(patient.name)
          await expect(page.getByTestId(`patient-list-row-${patient.id}`)).toBeVisible()
          await step(`利用者の一覧に、登録した ${patient.name} が出ている`)

          await step('予定のカレンダーで「予定を作成」を押し、訪問の予定の利用者の候補を開く')
          await page.goto('/schedule?view=day')
          await page.getByTestId('schedule-create-open').click()
          await page.getByTestId('schedule-kind-tab-visit').check()
          await page.getByTestId('schedule-field-patient').click()

          await step(`利用者の検索に「${patient.name}」を入れる`)
          await page.getByTestId('patient-select-search').fill(patient.name)
          await expect(page.getByTestId(`patient-select-option-${patient.id}`)).toBeVisible()
          await check(`予定の作成の利用者の候補に ${patient.name} が出る`)
        },
      )
    })

    for (const page of [
      {
        name: 'patient-forbidden-list',
        url: '/patients',
        label: '利用者の一覧',
        hidden: (p: Page) => p.getByTestId('patient-list-table'),
        result: '権限が無いことの案内が出て、利用者の一覧とナビゲーションの「利用者」が出ない',
      },
      {
        name: 'patient-forbidden-new',
        url: '/patients/new',
        label: '利用者の登録',
        hidden: (p: Page) => p.getByTestId('patient-new-dialog'),
        result: '権限が無いことの案内が出て、登録のダイアログとナビゲーションの「利用者」が出ない',
      },
    ]) {
      test(`${prefix}職員の管理の権限を持たない職員が${page.label}の URL を開いた場合、${page.label}の画面が出ないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: page.name,
            title: `職員の管理の権限を持たない職員が${page.label}の URL を開くと、${page.label}の画面が出ない`,
            actor: `${LEADER.staff.name}（チームリーダー、職員の管理の権限なし）`,
            variant,
          },
          async (p) => {
            await p.goto('/schedule')
            await signInAtBroker(p, LEADER.email)
          },
          async ({ page: p, step, check }) => {
            await step(`${page.label}の URL（${page.url}）を開く`)
            await p.goto(page.url)
            await expect(p.getByTestId('page-forbidden')).toBeVisible()
            await expect(p.getByTestId('site-nav')).not.toContainText('利用者')
            await expect(page.hidden(p)).toHaveCount(0)
            await check(page.result)
          },
        )
      })
    }
  }
})
