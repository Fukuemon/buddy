import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LEADER, LEADER_STATE, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { endPatientService, registerPatient } from '../../fixtures/patient'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { issueManagerToken, STAFF_FORM } from '../../fixtures/staff'

/** 登録する利用者の名前。撮影の compose は撮るたびに作り直すので、固定の名前にする。 */
const NEW_PATIENT = '見本 春香'

/**
 * 録画の外で、マネージャーのトークンで担当を青木 陽菜にした利用者を登録し、名前と ID を返す。
 * ended を渡すと、登録した利用者の利用を API で終了しておく。
 */
const preparePatient = (browser: Browser, name: string, { ended = false } = {}) =>
  prepareOutsideRecording(browser, {}, async (page) => {
    const token = await issueManagerToken()
    const res = await registerPatient(page.request, token, STAFF_FORM.facilityId, {
      name,
      assignedStaffId: LOGIN_STAFF.id,
    })
    expect(res.status()).toBe(201)
    const id = ((await res.json()) as { id: string }).id
    if (ended) expect((await endPatientService(page.request, token, id)).status()).toBe(200)
    return { name, id }
  })

/** 予定のカレンダーで「予定を作成」を押し、訪問の予定の利用者の候補を開く。 */
const openPatientCandidates = async (page: Page) => {
  await page.goto('/schedule?view=day')
  await page.getByTestId('schedule-create-open').click()
  await page.getByTestId('schedule-kind-tab-visit').check()
  await page.getByTestId('schedule-field-patient').click()
}

test.describe('利用者の一覧', () => {
  test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('patient-register-list 職員の管理の権限を持つ職員が利用者を登録した場合、利用者の一覧に出ること', async ({
      page,
    }) => {
      await page.goto('/patients')
      await expect(page.getByTestId('patient-list-table')).toBeVisible()
      await intro(page, '職員の管理の権限を持つ職員が利用者を登録すると、利用者の一覧に出る')

      await step(
        page,
        '「利用者を登録」を押し、名前、サービス、希望、担当の職員を入れて登録する',
        async () => {
          await page.getByTestId('patient-list-new').click()
          const dialog = page.getByTestId('patient-new-dialog')
          await dialog.getByTestId('patient-new-name').fill(NEW_PATIENT)
          await dialog.getByTestId('patient-new-service').selectOption({ index: 1 })
          await dialog.getByTestId('patient-new-time-afternoon').check()
          await dialog.getByTestId('patient-new-gender-female').check()
          await dialog.getByTestId('patient-new-staff').selectOption(LOGIN_STAFF.id)
          await dialog.getByTestId('patient-new-submit').click()
          await expect(page.getByTestId('patient-detail-name')).toHaveText(NEW_PATIENT)
        },
      )
      await step(
        page,
        `登録した利用者の詳細から利用者の一覧へ戻り、名前の検索に「${NEW_PATIENT}」を入れる`,
        async () => {
          await page.getByTestId('patient-detail-back').click()
          await page.getByTestId('patient-list-search').fill(NEW_PATIENT)
        },
      )
      await check(
        page,
        `利用者の一覧に ${NEW_PATIENT} が、担当の職員とサービスと希望とともに出る`,
        async () => {
          await expect(page.getByTestId('patient-list-count')).toHaveText('1 人')
          await expect(page.getByTestId('patient-list-table')).toContainText(LOGIN_STAFF.name)
        },
      )
    })

    test('patient-register-candidate 職員の管理の権限を持つ職員が利用者を登録した場合、予定の作成の利用者の候補に出ること', async ({
      browser,
      context,
    }) => {
      const patient = await preparePatient(browser, `${NEW_PATIENT} 候補`)

      const page = await context.newPage()
      await page.goto('/patients')
      await page.getByTestId('patient-list-search').fill(patient.name)
      await expect(page.getByTestId(`patient-list-row-${patient.id}`)).toBeVisible()
      await intro(
        page,
        `登録した利用者は、予定の作成の利用者の候補に出る\n前提 利用者の一覧に、登録した ${patient.name} が出ている`,
      )

      await step(
        page,
        '予定のカレンダーで「予定を作成」を押し、訪問の予定の利用者の候補を開く',
        () => openPatientCandidates(page),
      )
      await step(page, `利用者の検索に「${patient.name}」を入れる`, () =>
        page.getByTestId('patient-select-search').fill(patient.name),
      )
      await check(page, `予定の作成の利用者の候補に ${patient.name} が出る`, () =>
        expect(page.getByTestId(`patient-select-option-${patient.id}`)).toBeVisible(),
      )
    })

    test('patient-edit-list 利用者の名前、サービス、希望、担当の職員を変えた場合、一覧に変えた値が出ること', async ({
      browser,
      context,
    }) => {
      const patient = await preparePatient(browser, '見本 夏美')
      const renamed = `${patient.name} 改`

      const page = await context.newPage()
      await page.goto(`/patients/${patient.id}`)
      await expect(page.getByTestId('patient-detail-name')).toHaveText(patient.name)
      await intro(
        page,
        `利用者の名前、サービス、希望、担当の職員を変えると、一覧に変えた値が出る\n前提 ${patient.name} の詳細を開いている（午前、女性、担当は ${LOGIN_STAFF.name}）`,
      )

      await step(
        page,
        `編集で、名前を「${renamed}」に、サービスを訪看I3に、希望を午後と男性に、担当を ${LEADER.staff.name} に変えて保存する`,
        async () => {
          await page.getByTestId('patient-detail-edit').click()
          const dialog = page.getByTestId('patient-detail-edit-dialog')
          await dialog.getByTestId('patient-detail-name-input').fill(renamed)
          await dialog
            .getByTestId('patient-detail-service-input')
            .selectOption({ label: '訪看I3（30〜59 分）' })
          await dialog.getByTestId('patient-detail-time-input-afternoon').check()
          await dialog.getByTestId('patient-detail-gender-input-male').check()
          await dialog.getByTestId('patient-detail-staff-input').selectOption(LEADER.staff.id)
          await dialog.getByTestId('patient-detail-save').click()
          await expect(page.getByTestId('patient-detail-name')).toHaveText(renamed)
        },
      )
      await step(page, '利用者の一覧へ戻り、名前で検索する', async () => {
        await page.getByTestId('patient-detail-back').click()
        await page.getByTestId('patient-list-search').fill(renamed)
      })
      await check(
        page,
        `一覧の行に、変えた名前、担当の ${LEADER.staff.name}、訪看I3、午後、男性が出る`,
        async () => {
          const row = page.getByTestId(`patient-list-row-${patient.id}`)
          await expect(row).toContainText(LEADER.staff.name)
          await expect(row).toContainText('訪看I3')
          await expect(row).toContainText('午後')
          await expect(row).toContainText('男性')
        },
      )
    })

    test('patient-end-list 利用者の利用を終了した場合、利用者の一覧のデフォルトの表示に出ないこと', async ({
      browser,
      context,
    }) => {
      const patient = await preparePatient(browser, '見本 秋子')

      const page = await context.newPage()
      await page.goto(`/patients/${patient.id}`)
      await expect(page.getByTestId('patient-detail-name')).toHaveText(patient.name)
      await intro(page, '利用者の利用を終了すると、利用者の一覧のデフォルトの表示に出ない')

      await step(page, '「…」から「利用を終了する」を押す', async () => {
        await page.getByTestId('patient-detail-menu').click()
        await page.getByTestId('patient-detail-end').click()
      })
      const dialog = page.getByTestId('patient-end-dialog')
      await check(page, '残る予定が無いことを示し、利用を終了するを押せる', () =>
        expect(dialog.getByTestId('patient-end-schedules')).toHaveText(
          '今日以降の予定は残っていません。',
        ),
      )

      await step(page, 'ダイアログの「利用を終了する」を押す', async () => {
        await dialog.getByTestId('patient-end-submit').click()
        await expect(page.getByTestId('patient-detail-status')).toContainText('利用の終了')
      })
      await step(page, `利用者の一覧へ戻り、名前の検索に「${patient.name}」を入れる`, async () => {
        await page.getByTestId('patient-detail-back').click()
        await page.getByTestId('patient-list-search').fill(patient.name)
      })
      await check(
        page,
        `状態の絞り込みが「利用中」のデフォルトの表示に、${patient.name} が出ない`,
        () => expect(page.getByTestId('patient-list-empty')).toBeVisible(),
      )
    })

    test('patient-end-candidate 利用者の利用を終了した場合、予定の作成の利用者の候補に出ないこと', async ({
      browser,
      context,
    }) => {
      const patient = await preparePatient(browser, '見本 冬子')

      const page = await context.newPage()
      await openPatientCandidates(page)
      await page.getByTestId('patient-select-search').fill(patient.name)
      await expect(page.getByTestId(`patient-select-option-${patient.id}`)).toBeVisible()
      await intro(
        page,
        `利用者の利用を終了すると、予定の作成の利用者の候補に出ない\n前提 利用中の ${patient.name} は、予定の作成の利用者の候補に出ている`,
      )

      await step(page, `${patient.name} の詳細で、「…」から利用を終了する`, async () => {
        await page.goto(`/patients/${patient.id}`)
        await page.getByTestId('patient-detail-menu').click()
        await page.getByTestId('patient-detail-end').click()
        const dialog = page.getByTestId('patient-end-dialog')
        await expect(dialog.getByTestId('patient-end-schedules')).toHaveText(
          '今日以降の予定は残っていません。',
        )
        await dialog.getByTestId('patient-end-submit').click()
        await expect(page.getByTestId('patient-detail-status')).toContainText('利用の終了')
      })
      await step(
        page,
        `予定の作成の利用者の候補を開き、「${patient.name}」で検索する`,
        async () => {
          await openPatientCandidates(page)
          await page.getByTestId('patient-select-search').fill(patient.name)
        },
      )
      await check(page, `予定の作成の利用者の候補に、${patient.name} が出ない`, async () => {
        await expect(page.getByTestId('patient-select-search')).toHaveValue(patient.name)
        await expect(page.getByTestId(`patient-select-option-${patient.id}`)).toHaveCount(0)
      })
    })

    test('patient-resume-list 利用の終了の利用者の利用を再開した場合、利用者の一覧のデフォルトの表示に戻ること', async ({
      browser,
      context,
    }) => {
      const patient = await preparePatient(browser, '見本 春男', { ended: true })

      const page = await openEndedPatient(context, patient)
      await intro(
        page,
        `利用の終了の利用者の利用を再開すると、利用者の一覧のデフォルトの表示に戻る\n前提 利用の終了の ${patient.name} の詳細を開いている（API で利用の終了にしてある）`,
      )

      await resumeService(page)
      await step(page, `利用者の一覧へ戻り、名前の検索に「${patient.name}」を入れる`, async () => {
        await page.getByTestId('patient-detail-back').click()
        await page.getByTestId('patient-list-search').fill(patient.name)
      })
      await check(
        page,
        `状態の絞り込みが「利用中」のデフォルトの表示に、${patient.name} が戻る`,
        async () => {
          await expect(page.getByTestId('patient-list-filter-status')).toHaveValue('active')
          await expect(page.getByTestId(`patient-list-row-${patient.id}`)).toBeVisible()
        },
      )
    })

    test('patient-resume-candidate 利用の終了の利用者の利用を再開した場合、予定の作成の利用者の候補に戻ること', async ({
      browser,
      context,
    }) => {
      const patient = await preparePatient(browser, '見本 夏男', { ended: true })

      const page = await openEndedPatient(context, patient)
      await intro(
        page,
        `利用の終了の利用者の利用を再開すると、予定の作成の利用者の候補に戻る\n前提 利用の終了の ${patient.name} の詳細を開いている（API で利用の終了にしてある）`,
      )

      await resumeService(page)
      await step(
        page,
        `予定の作成の利用者の候補を開き、「${patient.name}」で検索する`,
        async () => {
          await openPatientCandidates(page)
          await page.getByTestId('patient-select-search').fill(patient.name)
        },
      )
      await check(page, `予定の作成の利用者の候補に、${patient.name} が戻る`, () =>
        expect(page.getByTestId(`patient-select-option-${patient.id}`)).toBeVisible(),
      )
    })
  })

  test.describe(`${LEADER.staff.name}（チームリーダー、職員の管理の権限なし）`, () => {
    test.use({ storageState: LEADER_STATE })

    for (const target of [
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
      test(`${target.name} 職員の管理の権限を持たない職員が${target.label}の URL を開いた場合、${target.label}の画面が出ないこと`, async ({
        page,
      }) => {
        await page.goto('/schedule')
        await expect(page.getByTestId('site-nav-schedule')).toBeVisible()
        await intro(
          page,
          `職員の管理の権限を持たない職員が${target.label}の URL を開くと、${target.label}の画面が出ない`,
        )

        await step(page, `${target.label}の URL（${target.url}）を開く`, async () => {
          await page.goto(target.url)
        })
        await check(page, target.result, async () => {
          await expect(page.getByTestId('page-forbidden')).toBeVisible()
          await expect(page.getByTestId('site-nav')).not.toContainText('利用者')
          await expect(target.hidden(page)).toHaveCount(0)
        })
      })
    }

    test('patient-forbidden-detail 職員の管理の権限を持たない職員が利用者の詳細の URL を開いた場合、利用者の管理の画面が出ないこと', async ({
      browser,
      context,
    }) => {
      const patient = await preparePatient(browser, '見本 一夫')

      const page = await context.newPage()
      await page.goto('/schedule')
      await expect(page.getByTestId('site-nav-schedule')).toBeVisible()
      await intro(
        page,
        '職員の管理の権限を持たない職員が利用者の詳細の URL を開くと、利用者の管理の画面が出ない',
      )

      await step(page, `利用者の ${patient.name} の詳細の URL を開く`, async () => {
        await page.goto(`/patients/${patient.id}`)
      })
      await check(
        page,
        '権限が無いことの案内が出て、利用者の名前とプロフィールが出ない',
        async () => {
          await expect(page.getByTestId('page-forbidden')).toBeVisible()
          await expect(page.getByTestId('patient-detail-name')).toHaveCount(0)
          await expect(page.getByTestId('site-nav')).not.toContainText('利用者')
        },
      )
    })
  })
})

/** 録画する page を開き、利用の終了の利用者の詳細を出す。 */
async function openEndedPatient(context: BrowserContext, patient: { id: string }) {
  const page = await context.newPage()
  await page.goto(`/patients/${patient.id}`)
  await expect(page.getByTestId('patient-detail-status')).toContainText('利用の終了')
  return page
}

/** 「…」から「利用を再開する」を押し、担当の青木 陽菜のまま再開する。 */
async function resumeService(page: Page) {
  await step(
    page,
    `「…」から「利用を再開する」を押し、担当の ${LOGIN_STAFF.name} のまま再開する`,
    async () => {
      await page.getByTestId('patient-detail-menu').click()
      await page.getByTestId('patient-detail-resume').click()
      const dialog = page.getByTestId('patient-resume-dialog')
      await expect(dialog.getByTestId('patient-resume-staff')).toHaveValue(LOGIN_STAFF.id)
      await dialog.getByTestId('patient-resume-submit').click()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByTestId('patient-detail-status')).toHaveCount(0)
    },
  )
}
