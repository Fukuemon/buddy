import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { prepareApiReference, routeApiReference } from '../../fixtures/apiReference'
import { LOGIN_EMAIL, LOGIN_STAFF, SCHEDULE_URL, SEED_PATIENT } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { createNormalSchedule } from '../../fixtures/schedule'
import {
  issueManagerToken,
  newStaff,
  registerStaffId,
  setNonVisiting,
  STAFF_FORM,
} from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'
import {
  fillApiBody,
  fillApiToken,
  fillApiVariable,
  openApiClient,
} from '../../screens/apiReference'
import { apiClient } from '../../selectors/apiReference'

/** 訪問しない職員への変更を拒む予定の日。今日より後にする。 */
const FUTURE_DATE = '2030-01-09'

/** 訪問の予定を作る日。 */
const VISIT_DATE = '2026-10-20'

const MANAGER = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`

const CREATE_SCHEDULE = {
  tag: 'schedule',
  method: 'post',
  path: '/v1/facilities/{facility_id}/schedules',
}

/** マネージャーでログインする。 */
const signInManager = async (page: Page) => {
  await page.goto('/schedule')
  await signInAtBroker(page, LOGIN_EMAIL)
}

/** マネージャーのトークンで、職員を 1 人登録して訪問しない職員にし、ID と名前を返す。 */
const registerNonVisiting = async (request: APIRequestContext, label: string) => {
  const token = await issueManagerToken(request)
  const staff = newStaff(label)
  const id = await registerStaffId(request, token, staff)
  const res = await setNonVisiting(request, token, id)
  if (res.status() !== 200) throw new Error(`訪問しない職員にできない: ${res.status()}`)
  return { id, name: staff.name }
}

/** マネージャーでログインし、撮影の前に訪問しない職員を 1 人登録して、その ID と名前を返す。 */
const prepareNonVisiting = (label: string) => async (page: Page) => {
  await signInManager(page)
  return registerNonVisiting(page.request, label)
}

/**
 * 予定の API のマスタから、名前（サービスコードは code）が name の 1 件の ID を返す。
 * 古いシードのサービスコードは全角の数字で入っているので、NFKC にそろえて比べる。
 */
const masterId = async (request: APIRequestContext, token: string, path: string, name: string) => {
  const res = await request.get(`${SCHEDULE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const found = ((await res.json()) as { id: string; name?: string; code?: string }[]).find(
    (m) => (m.name ?? m.code)?.normalize('NFKC') === name.normalize('NFKC'),
  )
  if (found === undefined) throw new Error(`${path} に ${name} が無い`)
  return found.id
}

test.describe('職員の管理', () => {
  test.describe('訪問しない職員', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}訪問しない職員がいる事業所で予定のカレンダーを開いた場合、その職員の列と絞り込みの項目が出ないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'non-visiting-calendar-column',
            title:
              '訪問しない職員がいる事業所で予定のカレンダーを開くと、その職員の列と絞り込みの項目が出ない',
            actor: MANAGER,
            variant,
          },
          prepareNonVisiting('calendar'),
          async ({ page, step, check }, { id, name }) => {
            await page.goto(`/staff/${id}`)
            await expect(page.getByTestId('staff-detail-visits')).toContainText('訪問しない')
            await step(`撮影の前に登録して訪問しない職員にした ${name} の詳細を開いている`)

            await step('予定のカレンダーを日の表示で開く')
            await page.goto('/schedule?view=day')
            await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
            await expect(page.getByTestId(`day-grid-staff-${id}`)).toHaveCount(0)
            await check(`${LOGIN_STAFF.name}の列は出て、訪問しない ${name} の列は出ない`)

            const sidebar = page.getByTestId('staff-filter-sidebar')
            await step('左の職員の絞り込みの項目を見る')
            await expect(sidebar.getByTestId(`staff-filter-staff-${LOGIN_STAFF.id}`)).toBeVisible()
            await expect(sidebar.getByTestId(`staff-filter-staff-${id}`)).toHaveCount(0)
            await check(`職員の絞り込みの項目にも、訪問しない ${name} は出ない`)
          },
        )
      })

      test(`${prefix}訪問の予定を作る場合、主訪問者の候補に訪問しない職員が出ないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'non-visiting-visit-assignee',
            title: '訪問の予定を作るとき、主訪問者の候補に訪問しない職員が出ない',
            actor: MANAGER,
            variant,
          },
          prepareNonVisiting('assignee'),
          async ({ page, step, check }, { id, name }) => {
            await page.goto('/schedule?view=day')
            await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
            await step(
              `予定のカレンダーを日の表示で開いている（撮影の前に、訪問しない ${name} を登録した）`,
            )

            await step('「予定を作成」を押し、訪問の予定を選んで、項目の一覧の「主訪問者」を押す')
            await page.getByTestId('schedule-create-open').click()
            await page.getByTestId('schedule-kind-tab-visit').check()
            await page.getByTestId('schedule-field-staff').click()
            await expect(page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`)).toBeVisible()
            await expect(page.getByTestId(`staff-select-option-${id}`)).toHaveCount(0)
            await check(`主訪問者の候補に${LOGIN_STAFF.name}は出て、訪問しない ${name} は出ない`)
          },
        )
      })

      test(`${prefix}訪問しない職員を同行者に指して訪問の予定を作った場合、400 で拒まれること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'non-visiting-companion-api',
            title: '訪問しない職員を同行者に指して訪問の予定を作ると、予定の API が 400 で拒む',
            actor: MANAGER,
            variant,
          },
          async (page) => {
            const token = await prepareApiReference('schedule', LOGIN_EMAIL)(page)
            const companion = await registerNonVisiting(page.request, 'companion')
            const visitType = await masterId(page.request, token, '/v1/schedule_types', '訪問')
            const serviceCode = await masterId(
              page.request,
              token,
              '/v1/visit_infos/service_codes',
              '訪看I3',
            )
            return { token, companion, visitType, serviceCode }
          },
          async ({ page, step, check }, { token, companion, visitType, serviceCode }) => {
            await routeApiReference(page)
            await openApiClient(page, 'schedule', CREATE_SCHEDULE)
            await step('API の参照のページで「単発の予定を作る」のリクエストを開いている')

            await step(`認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`)
            await fillApiToken(page, token)

            await step(
              `主訪問者を${LOGIN_STAFF.name}、同行者を訪問しない ${companion.name} にした訪問の予定を送る`,
            )
            await fillApiVariable(page, 'facility_id', STAFF_FORM.facilityId)
            await fillApiBody(page, {
              schedule_type_id: visitType,
              date: VISIT_DATE,
              start_time: '10:00',
              end_time: '11:00',
              staff_id: LOGIN_STAFF.id,
              visit_info: {
                patient_id: SEED_PATIENT.id,
                assigned_staff_id: LOGIN_STAFF.id,
                companion_id: companion.id,
                service_code_id: serviceCode,
              },
            })
            await apiClient(page).send.click()
            await expect(apiClient(page).dialog).toContainText('400 Bad Request')
            const message = `訪問しない職員 ${companion.id} には、予定と担当を割り振れません`
            await expect(apiClient(page).dialog).toContainText(`"message": "${message}"`)
            await check(`400 が返り、code は invalid_input、message は「${message}」`)
          },
        )
      })

      test(`${prefix}職員を訪問しない職員として登録した場合、職員の一覧に出ること`, async ({
        browser,
      }) => {
        const staff = newStaff('register')
        await recordPrEvidence(
          browser,
          {
            name: 'non-visiting-register-list',
            title: '職員を訪問しない職員として登録すると、職員の一覧に出る',
            actor: MANAGER,
            variant,
          },
          signInManager,
          async ({ page, step, check }) => {
            await page.goto('/staff')
            await expect(page.getByTestId('staff-list-table')).toBeVisible()
            await step('職員の一覧を開いている')

            await step(
              '「職員を登録」を押し、名前とメールアドレスを入れ、訪問を「訪問しない」にする',
            )
            await page.getByTestId('staff-list-new').click()
            const dialog = page.getByTestId('staff-new-dialog')
            await dialog.getByTestId('staff-new-name').fill(staff.name)
            await dialog.getByTestId('staff-new-email').fill(staff.email)
            await expect(dialog.getByTestId('staff-new-visits-visits')).toBeChecked()
            await dialog.getByTestId('staff-new-visits-non-visiting').check()
            await check('訪問は「訪問する」で始まり、「訪問しない」に選び直した')

            await step('「登録」を押す')
            await dialog.getByTestId('staff-new-submit').click()
            await expect(page.getByTestId('staff-detail-name')).toHaveText(staff.name)
            await expect(page.getByTestId('staff-detail-visits')).toContainText('訪問しない')
            await check('登録した職員の詳細へ移り、訪問の行が「訪問しない」になる')

            await step('職員の一覧に戻り、名前で探す')
            await page.goto('/staff')
            await page.getByTestId('staff-list-search').fill(staff.name)
            await expect(
              page.getByTestId(/^staff-list-row-/).filter({ hasText: staff.name }),
            ).toBeVisible()
            await check(`職員の一覧に、訪問しない ${staff.name} が出る`)
          },
        )
      })

      test(`${prefix}訪問しない職員として登録した職員の場合、予定のカレンダーの列に出ないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'non-visiting-register-calendar',
            title: '訪問しない職員として登録した職員は、予定のカレンダーの列に出ない',
            actor: MANAGER,
            variant,
          },
          async (page) => {
            await signInManager(page)
            const token = await issueManagerToken(page.request)
            const staff = newStaff('register-calendar')
            const res = await page.request.post(
              `${SCHEDULE_URL}/v1/facilities/${STAFF_FORM.facilityId}/users`,
              {
                headers: { Authorization: `Bearer ${token}` },
                data: {
                  username: staff.name,
                  email: staff.email,
                  department_id: STAFF_FORM.departmentId,
                  team_id: STAFF_FORM.teamId,
                  position_id: STAFF_FORM.positionId,
                  visits: false,
                },
              },
            )
            if (res.status() !== 201) throw new Error(`職員を登録できない: ${res.status()}`)
            return { id: ((await res.json()) as { id: string }).id, name: staff.name }
          },
          async ({ page, step, check }, { id, name }) => {
            await page.goto('/staff')
            await page.getByTestId('staff-list-search').fill(name)
            await expect(page.getByTestId(`staff-list-row-${id}`)).toBeVisible()
            await step(
              `職員の一覧で、撮影の前に訪問しない職員として登録した ${name} を探して出している`,
            )

            await step('予定のカレンダーを日の表示で開く')
            await page.goto('/schedule?view=day')
            await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
            await expect(page.getByTestId(`day-grid-staff-${id}`)).toHaveCount(0)
            await check(`職員の一覧に出る ${name} の列は、予定のカレンダーに出ない`)
          },
        )
      })

      test(`${prefix}予定の残らない職員をプロフィールの編集で訪問しない職員にした場合、詳細の訪問の行が「訪問しない」になること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'non-visiting-edit',
            title:
              '予定の残らない職員をプロフィールの編集で訪問しないにすると、詳細の訪問の行が変わる',
            actor: MANAGER,
            variant,
          },
          async (page) => {
            await signInManager(page)
            const staff = newStaff('edit')
            const id = await registerStaffId(
              page.request,
              await issueManagerToken(page.request),
              staff,
            )
            return { id, name: staff.name }
          },
          async ({ page, step, check }, { id, name }) => {
            await page.goto(`/staff/${id}`)
            await expect(page.getByTestId('staff-detail-visits')).toHaveText('訪問する')
            await step(
              `撮影の前に登録した、予定の無い ${name} の詳細を開いている。訪問は「訪問する」`,
            )

            await step('「編集」を押し、訪問を「訪問しない」にして保存する')
            await page.getByTestId('staff-detail-edit').click()
            const dialog = page.getByTestId('staff-detail-edit-dialog')
            await expect(dialog.getByTestId('staff-detail-department-input')).toBeEnabled()
            await dialog.getByTestId('staff-detail-visits-input-non-visiting').check()
            await dialog.getByTestId('staff-detail-save').click()

            await expect(dialog).toBeHidden()
            await expect(page.getByTestId('staff-detail-visits')).toContainText('訪問しない')
            await check('ダイアログが閉じ、詳細の訪問の行が「訪問しない」になる')
          },
        )
      })

      test(`${prefix}今日以降の予定が残る職員を訪問しない職員にしようとした場合、残る予定の一覧が出て保存されないこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'non-visiting-refused',
            title:
              '今日以降の予定が残る職員を訪問しないにしようとすると、ダイアログを閉じずに残る予定の一覧が出て、保存されない',
            actor: MANAGER,
            variant,
          },
          async (page) => {
            await signInManager(page)
            const token = await issueManagerToken(page.request)
            const staff = newStaff('refused')
            const id = await registerStaffId(page.request, token, staff)
            const res = await createNormalSchedule(page.request, token, STAFF_FORM.facilityId, {
              staffId: id,
              title: `見本の会議 ${Date.now()}`,
              date: FUTURE_DATE,
            })
            if (res.status() !== 201) throw new Error(`予定を作れない: ${res.status()}`)
            return { id, name: staff.name }
          },
          async ({ page, step, check }, { id, name }) => {
            await page.goto(`/staff/${id}`)
            await expect(page.getByTestId('staff-detail-visits')).toHaveText('訪問する')
            await step(
              `撮影の前に登録し、${FUTURE_DATE} の予定を作った ${name} の詳細を開いている。訪問は「訪問する」`,
            )

            await step('「編集」を押し、訪問を「訪問しない」にして保存する')
            await page.getByTestId('staff-detail-edit').click()
            const dialog = page.getByTestId('staff-detail-edit-dialog')
            await expect(dialog.getByTestId('staff-detail-department-input')).toBeEnabled()
            await dialog.getByTestId('staff-detail-visits-input-non-visiting').check()
            await dialog.getByTestId('staff-detail-save').click()

            const list = dialog.getByTestId('staff-non-visiting-assignments')
            await expect(list).toContainText(
              '別の職員に割り振り直してから、訪問しない職員にしてください。',
            )
            await check(
              'ダイアログは閉じず、今日以降に残る予定の一覧と、割り振り直すよう伝える文が出る',
            )

            await step('ダイアログを閉じて、詳細を読み直す')
            await dialog.getByTestId('staff-detail-edit-cancel').click()
            await page.reload()
            await expect(page.getByTestId('staff-detail-visits')).toHaveText('訪問する')
            await check('訪問の行は「訪問する」のままで、保存されていない')
          },
        )
      })
    }
  })
})
