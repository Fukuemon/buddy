import { type Page, expect, test } from '@playwright/test'

import { prepareApiReference, routeApiReference } from '../../fixtures/apiReference'
import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { STAFF_FORM } from '../../fixtures/staff'
import {
  fillApiBody,
  fillApiQuery,
  fillApiToken,
  fillApiVariable,
  openApiClient,
  scrollApiResponseTo,
} from '../../screens/apiReference'
import { apiClient } from '../../selectors/apiReference'

/** 初期のマイグレーションが入れる、通常の予定の種類。 */
const NORMAL_TYPE = '01M3TC68E05E1N46YCCBT6ZQB2'

const CREATE = { tag: 'schedule', method: 'post', path: '/v1/facilities/{facility_id}/schedules' }
const CREATE_RECURRING = {
  tag: 'schedule',
  method: 'post',
  path: '/v1/facilities/{facility_id}/schedules/recurring',
}
const GET = { tag: 'schedule', method: 'get', path: '/v1/schedules/{schedule_id}' }
const LIST = CREATE_RECURRING.path.replace('/recurring', '')

/** 2026-11-01 の 22:00 に始まり翌日の 1:00 に終わる、通常の予定の本文。 */
const overnightBody = (title: string, endsNextDay?: boolean) => ({
  schedule_type_id: NORMAL_TYPE,
  date: '2026-11-01',
  start_time: '22:00',
  end_time: '01:00',
  ...(endsNextDay === undefined ? {} : { ends_next_day: endsNextDay }),
  staff_id: LOGIN_STAFF.id,
  title,
})

/** 開いたクライアントに、トークンと事業所を入れる。 */
const fillAuthAndFacility = async (page: Page, token: string) => {
  await fillApiToken(page, token)
  await fillApiVariable(page, 'facility_id', STAFF_FORM.facilityId)
}

/** 送ったリクエストのレスポンスの本文を返す。 */
const sendAndRead = async <T>(page: Page, method: string) => {
  const response = page.waitForResponse(
    (r) => r.request().method() === method && new URL(r.url()).pathname.startsWith('/v1/'),
  )
  await apiClient(page).send.click()
  return (await (await response).json()) as T
}

/** 予定を作るクライアントで、翌日に終わる予定を作り、作った予定の ID を返す。 */
const createOvernight = async (page: Page, token: string, title: string) => {
  await openApiClient(page, 'schedule', CREATE)
  await fillAuthAndFacility(page, token)
  await fillApiBody(page, overnightBody(title, true))
  const { id } = await sendAndRead<{ id: string }>(page, 'POST')
  await expect(apiClient(page).dialog).toContainText('201 Created')
  await expect(apiClient(page).dialog).toContainText('"ends_next_day": true')
  return id
}

test.describe('予定の API', () => {
  test.describe('終了が翌日の予定', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}印を付けて 22:00 から 1:00 の予定を作った場合、予定が作られ、取得で開始の日の日付と翌日に終わる印が返ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-overnight-create',
            title:
              'ends_next_day を true にして 22:00 から 1:00 の予定を作ると 201 が返り、取得で date は開始の日、ends_next_day は true になる',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          prepareApiReference('schedule', LOGIN_EMAIL),
          async ({ page, step, check }, token) => {
            await routeApiReference(page)
            await step(`認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`)
            await step(
              '「単発の予定を作る」で、2026-11-01 の 22:00 から 01:00、ends_next_day を true にした予定を作る',
            )
            const id = await createOvernight(page, token, '夜勤')
            await check('201 が返り、レスポンスの ends_next_day が true になる')

            await step('「予定を取得する」で、作った予定を取得する')
            await apiClient(page).dialog.press('Escape')
            await openApiClient(page, 'schedule', GET)
            await fillApiToken(page, token)
            await fillApiVariable(page, 'schedule_id', id)
            await sendAndRead(page, 'GET')
            const dialog = apiClient(page).dialog
            await expect(dialog).toContainText('200 OK')
            await expect(dialog).toContainText('"date": "2026-11-01"')
            await expect(dialog).toContainText('"start_time": "22:00"')
            await expect(dialog).toContainText('"end_time": "01:00"')
            await expect(dialog).toContainText('"ends_next_day": true')
            await check(
              '200 が返り、date は開始の日の 2026-11-01、end_time は 01:00、ends_next_day は true になる',
            )
          },
        )
      })

      test(`${prefix}印を付けずに 22:00 から 1:00 の予定を作った場合、400 が返ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-overnight-without-flag',
            title: 'ends_next_day を付けずに 22:00 から 1:00 の予定を作ると、400 の invalid_input が返る',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          prepareApiReference('schedule', LOGIN_EMAIL),
          async ({ page, step, check }, token) => {
            await routeApiReference(page)
            await openApiClient(page, 'schedule', CREATE)
            await step('API の参照のページで「単発の予定を作る」のリクエストを開いている')

            await step(`認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`)
            await fillAuthAndFacility(page, token)

            await step('ends_next_day を付けずに、2026-11-01 の 22:00 から 01:00 の予定を作る')
            await fillApiBody(page, overnightBody('印のない夜勤'))
            await apiClient(page).send.click()
            const dialog = apiClient(page).dialog
            await expect(dialog).toContainText('400 Bad Request')
            await expect(dialog).toContainText('"code": "invalid_input"')
            await expect(dialog).toContainText('終了の時刻は開始の時刻より後にします')
            await check(
              '400 が返り、code は invalid_input、message に「終了の時刻は開始の時刻より後にします」が出る',
            )
          },
        )
      })

      test(`${prefix}印を付けた毎週の繰り返しの予定を作って期間の一覧を取った場合、繰り返しの予定が印を持って返ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-overnight-recurring',
            title:
              'ends_next_day を true にした毎週の繰り返しの予定を作り、期間の一覧を取ると、その繰り返しの予定が ends_next_day を true にして返る',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          prepareApiReference('schedule', LOGIN_EMAIL),
          async ({ page, step, check }, token) => {
            await routeApiReference(page)
            await openApiClient(page, 'schedule', CREATE_RECURRING)
            await step('API の参照のページで「繰り返しの予定を作る」のリクエストを開いている')

            await step(`認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`)
            await fillAuthAndFacility(page, token)

            await step(
              '2026-11-02（月）から毎週、22:00 から 01:00、ends_next_day を true にした繰り返しの予定を作る',
            )
            await fillApiBody(page, {
              ...overnightBody('毎週の夜勤', true),
              date: '2026-11-02',
              recurring_rule: { frequency: 'weekly' },
            })
            const { id } = await sendAndRead<{ id: string }>(page, 'POST')
            await expect(apiClient(page).dialog).toContainText('201 Created')
            await expect(apiClient(page).dialog).toContainText('"ends_next_day": true')
            await check('201 が返り、繰り返しの予定の ends_next_day が true になる')

            await step('「事業所の予定を一覧する」で、2026-11-02 から 2026-11-15 の一覧を取る')
            await apiClient(page).dialog.press('Escape')
            await openApiClient(page, 'schedule', { tag: 'schedule', method: 'get', path: LIST })
            await fillAuthAndFacility(page, token)
            await fillApiQuery(page, 'date_from', '2026-11-02')
            await fillApiQuery(page, 'date_to', '2026-11-15')
            const list = await sendAndRead<{
              recurring_schedules: { id: string; ends_next_day: boolean }[]
            }>(page, 'GET')
            await expect(apiClient(page).dialog).toContainText('200 OK')
            await scrollApiResponseTo(page, id)
            await expect(apiClient(page).response).toContainText(id)
            expect(list.recurring_schedules.find((r) => r.id === id)?.ends_next_day).toBe(true)
            await check(
              `200 が返り、recurring_schedules の ${id} が ends_next_day を true にして返る。API は回に展開せず、この印が全ての回に当たる`,
            )
          },
        )
      })

      test(`${prefix}11 月 2 日だけの期間で一覧を取り、11 月 1 日の 22:00 に始まり翌日に終わる予定がある場合、その予定が一覧に含まれること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-overnight-list-previous-day',
            title:
              '2026-11-01 の 22:00 に始まり翌日に終わる予定は、date_from と date_to を 2026-11-02 にした一覧に含まれる',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          prepareApiReference('schedule', LOGIN_EMAIL),
          async ({ page, step, check }, token) => {
            await routeApiReference(page)
            await step(`認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`)
            await step(
              '「単発の予定を作る」で、2026-11-01 の 22:00 から 01:00、ends_next_day を true にした予定を作る',
            )
            const id = await createOvernight(page, token, '前の日からの夜勤')
            await check('201 が返り、2026-11-01 に始まる翌日に終わる予定ができる')

            await step('「事業所の予定を一覧する」で、date_from と date_to を 2026-11-02 にして一覧を取る')
            await apiClient(page).dialog.press('Escape')
            await openApiClient(page, 'schedule', { tag: 'schedule', method: 'get', path: LIST })
            await fillAuthAndFacility(page, token)
            await fillApiQuery(page, 'date_from', '2026-11-02')
            await fillApiQuery(page, 'date_to', '2026-11-02')
            const list = await sendAndRead<{ schedules: { id: string; date: string }[] }>(
              page,
              'GET',
            )
            await expect(apiClient(page).dialog).toContainText('200 OK')
            await scrollApiResponseTo(page, id)
            await expect(apiClient(page).response).toContainText(id)
            expect(list.schedules.find((s) => s.id === id)?.date).toBe('2026-11-01')
            await check(
              `200 が返り、schedules に date が 2026-11-01 の ${id}（22:00 から翌日の 01:00）が含まれる`,
            )
          },
        )
      })
    }
  })
})
