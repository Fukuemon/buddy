import { expect, test } from '@playwright/test'

import { issueAccessToken, routeApiReference } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { STAFF_FORM } from '../../fixtures/staff'
import { openApiClient } from '../../screens/apiReference'
import {
  fillApiBody,
  fillApiToken,
  fillApiVariable,
} from '../../widgets/apiClient/actions/apiClient'
import { apiClient } from '../../selectors/apiReference'

/** 初期のマイグレーションが入れる、通常の予定の種類。 */
const NORMAL_TYPE = '01M3TC68E05E1N46YCCBT6ZQB2'

test.describe('予定の API', () => {
  // トークンは録画の外で取る。API の参照のページはログインしない
  test.describe(`要求の検証（${LOGIN_STAFF.name}、マネージャーのトークン）`, () => {
    test('schedule-create-invalid-time openapi.yaml の時刻の形に合わない本文で予定を作った場合、400 の invalid_input が返ること', async ({
      context,
      request,
    }) => {
      const token = await issueAccessToken(request, LOGIN_EMAIL)
      const page = await context.newPage()
      await routeApiReference(page)
      await openApiClient(page, 'schedule', {
        tag: 'schedule',
        method: 'post',
        path: '/v1/facilities/{facility_id}/schedules',
      })
      await intro(
        page,
        'openapi.yaml の時刻の形（HH:MM）に合わない開始時間で予定を作ると、400 の invalid_input が返る\n前提 API の参照のページで「単発の予定を作る」のリクエストを開いている',
      )

      await step(page, `認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`, () =>
        fillApiToken(page, token),
      )

      await step(
        page,
        '開始時間を 9:00（時が 1 桁）にして、予定を作るリクエストを送る',
        async () => {
          await fillApiVariable(page, 'facility_id', STAFF_FORM.facilityId)
          await fillApiBody(page, {
            schedule_type_id: NORMAL_TYPE,
            date: '2026-10-22',
            start_time: '9:00',
            end_time: '10:00',
            staff_id: LOGIN_STAFF.id,
            title: '会議',
          })
          await apiClient(page).send.click()
        },
      )
      await check(
        page,
        '400 が返り、code は invalid_input、message に「start_time が定義に合いません」と定義の正規表現が出る',
        async () => {
          await expect(apiClient(page).dialog).toContainText('400 Bad Request')
          await expect(apiClient(page).dialog).toContainText('"code": "invalid_input"')
          await expect(apiClient(page).dialog).toContainText('start_time が定義に合いません')
        },
      )
    })
  })
})
