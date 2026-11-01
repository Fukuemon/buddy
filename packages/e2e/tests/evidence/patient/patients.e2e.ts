import { expect, test } from '@playwright/test'

import { LEADER, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { endPatientService, registerPatient } from '../../fixtures/patient'
import type { APIRequestContext } from '@playwright/test'
import { issueManagerToken, STAFF_FORM } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'

/** 登録する利用者の名前。撮影の compose は撮るたびに作り直すので、固定の名前にする。 */
const NEW_PATIENT = '見本 春香'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

/** マネージャーで、担当を青木 陽菜にした利用者を登録し、名前と ID を返す。 */
const registerPatientOf = async (request: APIRequestContext, name: string) => {
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
  return { name, id: ((await res.json()) as { id: string }).id }
}

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
          await expect(page.getByTestId('patient-detail-name')).toHaveText(NEW_PATIENT)

          await step(
            `登録した利用者の詳細から利用者の一覧へ戻り、名前の検索に「${NEW_PATIENT}」を入れる`,
          )
          await page.getByTestId('patient-detail-back').click()
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
        hidden: 'patient-list-table',
        result: '権限が無いことの案内が出て、利用者の一覧とナビゲーションの「利用者」が出ない',
      },
      {
        name: 'patient-forbidden-new',
        url: '/patients/new',
        label: '利用者の登録',
        hidden: 'patient-new-dialog',
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
            await expect(p.getByTestId(page.hidden)).toHaveCount(0)
            await check(page.result)
          },
        )
      })
    }

    test(`${prefix}利用者の名前、サービス、希望、担当の職員を変えた場合、一覧に変えた値が出ること`, async ({
      browser,
      request,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'patient-edit-list',
          title: '利用者の名前、サービス、希望、担当の職員を変えると、一覧に変えた値が出る',
          actor: MANAGER,
          variant,
        },
        async (page) => {
          await page.goto('/patients')
          await signInAtBroker(page, LOGIN_EMAIL)
          return registerPatientOf(request, '見本 夏美')
        },
        async ({ page, step, check }, patient) => {
          const renamed = `${patient.name} 改`
          await page.goto(`/patients/${patient.id}`)
          await expect(page.getByTestId('patient-detail-name')).toHaveText(patient.name)
          await step(
            `${patient.name} の詳細を開いている（訪看I2、午前、女性、担当は ${LOGIN_STAFF.name}）`,
          )

          await step(
            `編集で、名前を「${renamed}」に、サービスを訪看I3に、希望を午後と男性に、担当を ${LEADER.staff.name} に変えて保存する`,
          )
          await page.getByTestId('patient-detail-edit').click()
          const dialog = page.getByTestId('patient-detail-edit-dialog')
          await dialog.getByTestId('patient-detail-name-input').fill(renamed)
          await dialog.getByTestId('patient-detail-service-input').selectOption({ index: 2 })
          await dialog.getByTestId('patient-detail-time-input-afternoon').check()
          await dialog.getByTestId('patient-detail-gender-input-male').check()
          await dialog.getByTestId('patient-detail-staff-input').selectOption(LEADER.staff.id)
          await dialog.getByTestId('patient-detail-save').click()
          await expect(page.getByTestId('patient-detail-name')).toHaveText(renamed)

          await step('利用者の一覧へ戻り、名前で検索する')
          await page.getByTestId('patient-detail-back').click()
          await page.getByTestId('patient-list-search').fill(renamed)
          const row = page.getByTestId(`patient-list-row-${patient.id}`)
          await expect(row).toContainText(LEADER.staff.name)
          await expect(row).toContainText('訪看I3')
          await expect(row).toContainText('午後')
          await expect(row).toContainText('男性')
          await check(
            `一覧の行に、変えた名前、担当の ${LEADER.staff.name}、訪看I3、午後、男性が出る`,
          )
        },
      )
    })

    test(`${prefix}利用者を利用の終了にした場合、利用者の一覧のデフォルトの表示に出ないこと`, async ({
      browser,
      request,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'patient-end-list',
          title: '利用者を利用の終了にすると、利用者の一覧のデフォルトの表示に出ない',
          actor: MANAGER,
          variant,
        },
        async (page) => {
          await page.goto('/patients')
          await signInAtBroker(page, LOGIN_EMAIL)
          return registerPatientOf(request, '見本 秋子')
        },
        async ({ page, step, check }, patient) => {
          await page.goto(`/patients/${patient.id}`)
          await expect(page.getByTestId('patient-detail-name')).toHaveText(patient.name)
          await step(`${patient.name} の詳細を開いている`)

          await step('「…」から「利用の終了にする」を押す')
          await page.getByTestId('patient-detail-menu').click()
          await page.getByTestId('patient-detail-end').click()
          const dialog = page.getByTestId('patient-end-dialog')
          await expect(dialog.getByTestId('patient-end-schedules')).toHaveText(
            '今日以降の予定は残っていません。',
          )
          await check('残る予定が無いことを示し、利用の終了にするを押せる')

          await step('ダイアログの「利用の終了にする」を押す')
          await dialog.getByTestId('patient-end-submit').click()
          await expect(page.getByTestId('patient-detail-status')).toContainText('利用の終了')

          await step(`利用者の一覧へ戻り、名前の検索に「${patient.name}」を入れる`)
          await page.getByTestId('patient-detail-back').click()
          await page.getByTestId('patient-list-search').fill(patient.name)
          await expect(page.getByTestId('patient-list-empty')).toBeVisible()
          await check(`状態の絞り込みが「利用中」のデフォルトの表示に、${patient.name} が出ない`)
        },
      )
    })

    test(`${prefix}利用者を利用の終了にした場合、予定の作成の利用者の候補に出ないこと`, async ({
      browser,
      request,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'patient-end-candidate',
          title: '利用者を利用の終了にすると、予定の作成の利用者の候補に出ない',
          actor: MANAGER,
          variant,
        },
        async (page) => {
          await page.goto('/patients')
          await signInAtBroker(page, LOGIN_EMAIL)
          return registerPatientOf(request, '見本 冬子')
        },
        async ({ page, step, check }, patient) => {
          await page.goto('/schedule?view=day')
          await page.getByTestId('schedule-create-open').click()
          await page.getByTestId('schedule-kind-tab-visit').check()
          await page.getByTestId('schedule-field-patient').click()
          await page.getByTestId('patient-select-search').fill(patient.name)
          await expect(page.getByTestId(`patient-select-option-${patient.id}`)).toBeVisible()
          await step(`利用中の ${patient.name} は、予定の作成の利用者の候補に出ている`)

          await step(`${patient.name} の詳細で、「…」から利用の終了にする`)
          await page.goto(`/patients/${patient.id}`)
          await page.getByTestId('patient-detail-menu').click()
          await page.getByTestId('patient-detail-end').click()
          const dialog = page.getByTestId('patient-end-dialog')
          await expect(dialog.getByTestId('patient-end-schedules')).toHaveText(
            '今日以降の予定は残っていません。',
          )
          await dialog.getByTestId('patient-end-submit').click()
          await expect(page.getByTestId('patient-detail-status')).toContainText('利用の終了')

          await step(`予定の作成の利用者の候補を開き、「${patient.name}」で検索する`)
          await page.goto('/schedule?view=day')
          await page.getByTestId('schedule-create-open').click()
          await page.getByTestId('schedule-kind-tab-visit').check()
          await page.getByTestId('schedule-field-patient').click()
          await page.getByTestId('patient-select-search').fill(patient.name)
          await expect(page.getByTestId('patient-select-search')).toHaveValue(patient.name)
          await expect(page.getByTestId(`patient-select-option-${patient.id}`)).toHaveCount(0)
          await check(`予定の作成の利用者の候補に、${patient.name} が出ない`)
        },
      )
    })

    test(`${prefix}職員の管理の権限を持たない職員が利用者の詳細の URL を開いた場合、利用者の管理の画面が出ないこと`, async ({
      browser,
      request,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'patient-forbidden-detail',
          title:
            '職員の管理の権限を持たない職員が利用者の詳細の URL を開くと、利用者の管理の画面が出ない',
          actor: `${LEADER.staff.name}（チームリーダー、職員の管理の権限なし）`,
          variant,
        },
        async (page) => {
          await page.goto('/patients')
          await signInAtBroker(page, LEADER.email)
          return registerPatientOf(request, '見本 一夫')
        },
        async ({ page, step, check }, patient) => {
          await step(`利用者の ${patient.name} の詳細の URL を開く`)
          await page.goto(`/patients/${patient.id}`)
          await expect(page.getByTestId('page-forbidden')).toBeVisible()
          await expect(page.getByTestId('patient-detail-name')).toHaveCount(0)
          await expect(page.getByTestId('site-nav')).not.toContainText('利用者')
          await check('権限が無いことの案内が出て、利用者の名前とプロフィールが出ない')
        },
      )
    })

    for (const shot of [
      {
        name: 'patient-resume-list',
        patient: '見本 春男',
        target: '利用者の一覧のデフォルトの表示',
      },
      {
        name: 'patient-resume-candidate',
        patient: '見本 夏男',
        target: '予定の作成の利用者の候補',
      },
    ]) {
      test(`${prefix}利用の終了の利用者の利用を再開した場合、${shot.target}に戻ること`, async ({
        browser,
        request,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: shot.name,
            title: `利用の終了の利用者の利用を再開すると、${shot.target}に戻る`,
            actor: MANAGER,
            variant,
          },
          async (page) => {
            await page.goto('/patients')
            await signInAtBroker(page, LOGIN_EMAIL)
            const patient = await registerPatientOf(request, shot.patient)
            const ended = await endPatientService(
              request,
              await issueManagerToken(request),
              patient.id,
            )
            expect(ended.status()).toBe(200)
            return patient
          },
          async ({ page, step, check }, patient) => {
            await page.goto(`/patients/${patient.id}`)
            await expect(page.getByTestId('patient-detail-status')).toContainText('利用の終了')
            await step(
              `利用の終了の ${patient.name} の詳細を開いている（API で利用の終了にしてある）`,
            )

            await step(
              `「…」から「利用を再開する」を押し、担当の ${LOGIN_STAFF.name} のまま再開する`,
            )
            await page.getByTestId('patient-detail-menu').click()
            await page.getByTestId('patient-detail-resume').click()
            const dialog = page.getByTestId('patient-resume-dialog')
            await expect(dialog.getByTestId('patient-resume-staff')).toHaveValue(LOGIN_STAFF.id)
            await dialog.getByTestId('patient-resume-submit').click()
            await expect(dialog).toHaveCount(0)
            await expect(page.getByTestId('patient-detail-status')).toHaveCount(0)

            if (shot.name === 'patient-resume-list') {
              await step(`利用者の一覧へ戻り、名前の検索に「${patient.name}」を入れる`)
              await page.getByTestId('patient-detail-back').click()
              await page.getByTestId('patient-list-search').fill(patient.name)
              await expect(page.getByTestId('patient-list-filter-status')).toHaveValue('active')
              await expect(page.getByTestId(`patient-list-row-${patient.id}`)).toBeVisible()
              await check(`状態の絞り込みが「利用中」のデフォルトの表示に、${patient.name} が戻る`)
              return
            }
            await step(`予定の作成の利用者の候補を開き、「${patient.name}」で検索する`)
            await page.goto('/schedule?view=day')
            await page.getByTestId('schedule-create-open').click()
            await page.getByTestId('schedule-kind-tab-visit').check()
            await page.getByTestId('schedule-field-patient').click()
            await page.getByTestId('patient-select-search').fill(patient.name)
            await expect(page.getByTestId(`patient-select-option-${patient.id}`)).toBeVisible()
            await check(`予定の作成の利用者の候補に、${patient.name} が戻る`)
          },
        )
      })
    }
  }
})
