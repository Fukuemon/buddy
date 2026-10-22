import { expect, test } from '@playwright/test'

import { prepareApiReference, routeApiReference } from '../../fixtures/apiReference'
import { LOGIN_NAME, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import {
  fillApiBody,
  fillApiToken,
  fillApiVariable,
  openApiClient,
} from '../../screens/apiReference'
import { apiClient } from '../../selectors/apiReference'

const FACILITY_ID = '01M3TC5H00QV17BC0J9V3393ZP'
/** 初期のマイグレーションが入れる、通常の予定の種類。 */
const NORMAL_TYPE = '01M3TC68E05E1N46YCCBT6ZQB2'

test.describe('予定の API', () => {
  test.describe('要求の検証', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      test(`${variant.label ? `${variant.label}: ` : ''}openapi.yaml の時刻の形に合わない本文で予定を作った場合、400 の invalid_input が返ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-create-invalid-time',
            title:
              'openapi.yaml の時刻の形（HH:MM）に合わない開始時間で予定を作ると、400 の invalid_input が返る',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          prepareApiReference('schedule-api', LOGIN_NAME),
          async ({ page, step, check }, token) => {
            await routeApiReference(page)
            await openApiClient(page, 'schedule-api', {
              tag: 'schedule',
              method: 'post',
              path: '/v1/facilities/{facility_id}/schedules',
            })
            await step('API の参照のページで「単発の予定を作る」のリクエストを開いている')

            await step(`認証の欄に ${LOGIN_STAFF.name} のトークンを入れる（伏せ字で出る）`)
            await fillApiToken(page, token)

            await step('開始時間を 9:00（時が 1 桁）にして、予定を作るリクエストを送る')
            await fillApiVariable(page, 'facility_id', FACILITY_ID)
            await fillApiBody(page, {
              schedule_type_id: NORMAL_TYPE,
              date: '2026-10-22',
              start_time: '9:00',
              end_time: '10:00',
              staff_id: LOGIN_STAFF.id,
              title: '会議',
            })
            await apiClient(page).send.click()
            await expect(apiClient(page).dialog).toContainText('400 Bad Request')
            await expect(apiClient(page).dialog).toContainText('"code": "invalid_input"')
            await expect(apiClient(page).dialog).toContainText('start_time が定義に合いません')
            await check(
              '400 が返り、code は invalid_input、message に「start_time が定義に合いません」と定義の正規表現が出る',
            )
          },
        )
      })
    }
  })
})
