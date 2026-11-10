import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { issueAccessToken, routeApiReference } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import {
  LOGIN_EMAIL,
  LOGIN_STAFF,
  LOGIN_STATE,
  SCHEDULE_URL,
  SEED_PATIENT,
} from '../../fixtures/env'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { createNormalSchedule } from '../../fixtures/schedule'
import {
  issueManagerToken,
  newStaff,
  registerStaffId,
  setNonVisiting,
  STAFF_FORM,
} from '../../fixtures/staff'
import { openApiClient } from '../../screens/apiReference'
import {
  fillApiBody,
  fillApiToken,
  fillApiVariable,
} from '../../widgets/apiClient/actions/apiClient'
import { apiClient } from '../../selectors/apiReference'

/** 訪問しない職員への変更を拒む予定の日。今日より後にする。 */
const FUTURE_DATE = '2030-01-09'

/** 訪問の予定を作る日。 */
const VISIT_DATE = '2026-10-20'

const CREATE_SCHEDULE = {
  tag: 'schedule',
  method: 'post',
  path: '/v1/facilities/{facility_id}/schedules',
}

/** マネージャーのトークンで、職員を 1 人登録して訪問しない職員にし、ID と名前を返す。 */
const registerNonVisiting = async (request: APIRequestContext, label: string) => {
  const token = await issueManagerToken()
  const staff = newStaff(label)
  const id = await registerStaffId(request, token, staff)
  const res = await setNonVisiting(request, token, id)
  if (res.status() !== 200) throw new Error(`訪問しない職員にできない: ${res.status()}`)
  return { id, name: staff.name }
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

/** 予定のカレンダーを日の表示で開き、マネージャーの列が出るまで待つ。 */
const openDayCalendar = async (page: Page) => {
  await page.goto('/schedule?view=day')
  await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
}

/** プロフィールの編集で、訪問を「訪問しない」にして保存を押す。保存の結果は待たない。 */
const saveAsNonVisiting = async (page: Page) => {
  await page.getByTestId('staff-detail-edit').click()
  const dialog = page.getByTestId('staff-detail-edit-dialog')
  await expect(dialog.getByTestId('staff-detail-department-input')).toBeEnabled()
  await dialog.getByTestId('staff-detail-visits-input-non-visiting').check()
  await dialog.getByTestId('staff-detail-save').click()
}

test.describe('職員の管理', () => {
  test.describe('訪問しない職員', () => {
    test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`, () => {
      test.use({ storageState: LOGIN_STATE })

      test('non-visiting-calendar-column 訪問しない職員がいる事業所で予定のカレンダーを開いた場合、その職員の列と絞り込みの項目が出ないこと', async ({
        context,
        request,
      }) => {
        const { id, name } = await registerNonVisiting(request, 'calendar')

        const page = await context.newPage()
        await page.goto(`/staff/${id}`)
        const visits = page.getByTestId('staff-detail-visits')
        await expect(visits).toContainText('訪問しない')
        await intro(
          page,
          '訪問しない職員がいる事業所で予定のカレンダーを開くと、その職員の列と絞り込みの項目が出ない',
        )

        await check(
          page,
          `前提 撮影の前に登録して訪問しない職員にした ${name} の詳細を開いている`,
          () => expect(visits).toContainText('訪問しない'),
        )
        await step(page, '予定のカレンダーを日の表示で開く', () => openDayCalendar(page))
        await check(page, `${LOGIN_STAFF.name}の列は出て、訪問しない ${name} の列は出ない`, () =>
          expect(page.getByTestId(`day-grid-staff-${id}`)).toHaveCount(0),
        )

        const sidebar = page.getByTestId('staff-filter-sidebar')
        await step(page, '左の職員の絞り込みの項目を見る', () =>
          sidebar.getByTestId(`staff-filter-staff-${LOGIN_STAFF.id}`).scrollIntoViewIfNeeded(),
        )
        await check(page, `職員の絞り込みの項目にも、訪問しない ${name} は出ない`, async () => {
          await expect(sidebar.getByTestId(`staff-filter-staff-${LOGIN_STAFF.id}`)).toBeVisible()
          await expect(sidebar.getByTestId(`staff-filter-staff-${id}`)).toHaveCount(0)
        })
      })

      test('non-visiting-visit-assignee 訪問の予定を作る場合、主訪問者の候補に訪問しない職員が出ないこと', async ({
        context,
        request,
      }) => {
        const { id, name } = await registerNonVisiting(request, 'assignee')

        const page = await context.newPage()
        await openDayCalendar(page)
        await intro(page, '訪問の予定を作るとき、主訪問者の候補に訪問しない職員が出ない')

        await check(
          page,
          `前提 予定のカレンダーを日の表示で開いている（撮影の前に、訪問しない ${name} を登録した）`,
          () => expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible(),
        )
        await step(
          page,
          '「予定を作成」を押し、訪問の予定を選んで、項目の一覧の「主訪問者」を押す',
          async () => {
            await page.getByTestId('schedule-create-open').click()
            await page.getByTestId('schedule-kind-tab-visit').check()
            await page.getByTestId('schedule-field-staff').click()
          },
        )
        await check(
          page,
          `主訪問者の候補に${LOGIN_STAFF.name}は出て、訪問しない ${name} は出ない`,
          async () => {
            await expect(page.getByTestId(`staff-select-option-${LOGIN_STAFF.id}`)).toBeVisible()
            await expect(page.getByTestId(`staff-select-option-${id}`)).toHaveCount(0)
          },
        )
      })

      test('non-visiting-companion-api 訪問しない職員を同行者に指して訪問の予定を作った場合、400 で拒まれること', async ({
        browser,
        context,
        request,
      }) => {
        const token = await prepareOutsideRecording(browser, {}, (page) =>
          issueAccessToken(page.request, LOGIN_EMAIL),
        )
        const companion = await registerNonVisiting(request, 'companion')
        const visitType = await masterId(request, token, '/v1/schedule_types', '訪問')
        const serviceCode = await masterId(
          request,
          token,
          '/v1/visit_infos/service_codes',
          '訪看I3',
        )

        const page = await context.newPage()
        await routeApiReference(page)
        await openApiClient(page, 'schedule', CREATE_SCHEDULE)
        await intro(
          page,
          '訪問しない職員を同行者に指して訪問の予定を作ると、予定の API が 400 で拒む',
        )

        await check(
          page,
          '前提 API の参照のページで「単発の予定を作る」のリクエストを開いている',
          () => expect(apiClient(page).send).toBeVisible(),
        )
        await step(page, `認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`, () =>
          fillApiToken(page, token),
        )
        await step(
          page,
          `主訪問者を${LOGIN_STAFF.name}、同行者を訪問しない ${companion.name} にした訪問の予定を送る`,
          async () => {
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
          },
        )
        const message = `訪問しない職員 ${companion.id} には、予定と担当を割り振れません`
        await check(
          page,
          `400 が返り、code は invalid_input、message は「${message}」`,
          async () => {
            await expect(apiClient(page).dialog).toContainText('400 Bad Request')
            await expect(apiClient(page).dialog).toContainText(`"message": "${message}"`)
          },
        )
      })

      test('non-visiting-register-list 職員を訪問しない職員として登録した場合、職員の一覧に出ること', async ({
        page,
      }) => {
        const staff = newStaff('register')
        await page.goto('/staff')
        await expect(page.getByTestId('staff-list-table')).toBeVisible()
        await intro(page, '職員を訪問しない職員として登録すると、職員の一覧に出る')

        await check(page, '前提 職員の一覧を開いている', () =>
          expect(page.getByTestId('staff-list-table')).toBeVisible(),
        )
        const dialog = page.getByTestId('staff-new-dialog')
        await step(
          page,
          '「職員を登録」を押し、名前とメールアドレスを入れ、訪問を「訪問しない」にする',
          async () => {
            await page.getByTestId('staff-list-new').click()
            await dialog.getByTestId('staff-new-name').fill(staff.name)
            await dialog.getByTestId('staff-new-email').fill(staff.email)
            await expect(dialog.getByTestId('staff-new-visits-visits')).toBeChecked()
            await dialog.getByTestId('staff-new-visits-non-visiting').check()
          },
        )
        await check(page, '訪問は「訪問する」で始まり、「訪問しない」に選び直した', () =>
          expect(dialog.getByTestId('staff-new-visits-non-visiting')).toBeChecked(),
        )

        await step(page, '「登録」を押す', () => dialog.getByTestId('staff-new-submit').click())
        await check(page, '登録した職員の詳細へ移り、訪問の行が「訪問しない」になる', async () => {
          await expect(page.getByTestId('staff-detail-name')).toHaveText(staff.name)
          await expect(page.getByTestId('staff-detail-visits')).toContainText('訪問しない')
        })

        await step(page, '職員の一覧に戻り、名前で探す', async () => {
          await page.goto('/staff')
          await page.getByTestId('staff-list-search').fill(staff.name)
        })
        await check(page, `職員の一覧に、訪問しない ${staff.name} が出る`, () =>
          expect(
            page.getByTestId(/^staff-list-row-/).filter({ hasText: staff.name }),
          ).toBeVisible(),
        )
      })

      test('non-visiting-register-calendar 訪問しない職員として登録した職員の場合、予定のカレンダーの列に出ないこと', async ({
        context,
        request,
      }) => {
        const token = await issueManagerToken()
        const staff = newStaff('register-calendar')
        const res = await request.post(
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
        const id = ((await res.json()) as { id: string }).id

        const page = await context.newPage()
        await page.goto('/staff')
        await page.getByTestId('staff-list-search').fill(staff.name)
        await expect(page.getByTestId(`staff-list-row-${id}`)).toBeVisible()
        await intro(page, '訪問しない職員として登録した職員は、予定のカレンダーの列に出ない')

        await check(
          page,
          `前提 職員の一覧で、撮影の前に訪問しない職員として登録した ${staff.name} を探して出している`,
          () => expect(page.getByTestId(`staff-list-row-${id}`)).toBeVisible(),
        )
        await step(page, '予定のカレンダーを日の表示で開く', () => openDayCalendar(page))
        await check(page, `職員の一覧に出る ${staff.name} の列は、予定のカレンダーに出ない`, () =>
          expect(page.getByTestId(`day-grid-staff-${id}`)).toHaveCount(0),
        )
      })

      test('non-visiting-edit 予定の残らない職員をプロフィールの編集で訪問しない職員にした場合、詳細の訪問の行が「訪問しない」になること', async ({
        context,
        request,
      }) => {
        const staff = newStaff('edit')
        const id = await registerStaffId(request, await issueManagerToken(), staff)

        const page = await context.newPage()
        await page.goto(`/staff/${id}`)
        const visits = page.getByTestId('staff-detail-visits')
        await expect(visits).toHaveText('訪問する')
        await intro(
          page,
          '予定の残らない職員をプロフィールの編集で訪問しないにすると、詳細の訪問の行が変わる',
        )

        await check(
          page,
          `前提 撮影の前に登録した、予定の無い ${staff.name} の詳細を開いている。訪問は「訪問する」`,
          () => expect(visits).toHaveText('訪問する'),
        )
        await step(page, '「編集」を押し、訪問を「訪問しない」にして保存する', () =>
          saveAsNonVisiting(page),
        )
        await check(page, 'ダイアログが閉じ、詳細の訪問の行が「訪問しない」になる', async () => {
          await expect(page.getByTestId('staff-detail-edit-dialog')).toBeHidden()
          await expect(visits).toContainText('訪問しない')
        })
      })

      test('non-visiting-refused 今日以降の予定が残る職員を訪問しない職員にしようとした場合、残る予定の一覧が出て保存されないこと', async ({
        context,
        request,
      }) => {
        const token = await issueManagerToken()
        const staff = newStaff('refused')
        const id = await registerStaffId(request, token, staff)
        const res = await createNormalSchedule(request, token, STAFF_FORM.facilityId, {
          staffId: id,
          title: `見本の会議 ${Date.now()}`,
          date: FUTURE_DATE,
        })
        if (res.status() !== 201) throw new Error(`予定を作れない: ${res.status()}`)

        const page = await context.newPage()
        await page.goto(`/staff/${id}`)
        const visits = page.getByTestId('staff-detail-visits')
        await expect(visits).toHaveText('訪問する')
        await intro(
          page,
          '今日以降の予定が残る職員を訪問しないにしようとすると、ダイアログを閉じずに残る予定の一覧が出て、保存されない',
        )

        await check(
          page,
          `前提 撮影の前に登録し、${FUTURE_DATE} の予定を作った ${staff.name} の詳細を開いている。訪問は「訪問する」`,
          () => expect(visits).toHaveText('訪問する'),
        )
        await step(page, '「編集」を押し、訪問を「訪問しない」にして保存する', () =>
          saveAsNonVisiting(page),
        )
        const dialog = page.getByTestId('staff-detail-edit-dialog')
        await check(
          page,
          'ダイアログは閉じず、今日以降に残る予定の一覧と、割り振り直すよう伝える文が出る',
          () =>
            expect(dialog.getByTestId('staff-non-visiting-assignments')).toContainText(
              '別の職員に割り振り直してから、訪問しない職員にしてください。',
            ),
        )

        await step(page, 'ダイアログを閉じて、詳細を読み直す', async () => {
          await dialog.getByTestId('staff-detail-edit-cancel').click()
          await page.reload()
        })
        await check(page, '訪問の行は「訪問する」のままで、保存されていない', () =>
          expect(visits).toHaveText('訪問する'),
        )
      })
    })
  })
})
