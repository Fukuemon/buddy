import { expect, test } from '@playwright/test'

import { prepareApiReference, routeApiReference } from '../../fixtures/apiReference'
import { LEADER, LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'
import { fillApiToken, fillApiVariable, openApiClient } from '../../screens/apiReference'
import { apiClient } from '../../selectors/apiReference'

/** シードの、青木の 2026-10-20 10:00 の予定「カンファレンス」。チーム B のリーダーの森は見てよくない。 */
const AOKI_CONFERENCE = {
  id: '01M3TC6BBRBQM0QK0S43P56AFH',
  date: '2026-10-20',
  title: 'カンファレンス',
}

/** シードの、森の 2026-10-21 の見本 一郎の訪問。 */
const MORI_VISIT = { date: '2026-10-21', title: '見本 一郎 訪問' }

test.describe('予定のカレンダー', () => {
  test.describe('職員の権限による予定の閲覧', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}全ての予定を見られるマネージャーが日の表示を開いた場合、ほかのチームの職員の予定も出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-permission-manager',
            title: '全ての予定を見られるマネージャーには、日の表示に青木 陽菜の予定が出る',
            actor: `${LOGIN_STAFF.name}（マネージャー、事業所の全ての予定の閲覧の権限あり）`,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            await page.goto(`/schedule?view=day&date=${AOKI_CONFERENCE.date}`)
            const column = page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
            await expect(column).toBeVisible()
            await step(`${LOGIN_STAFF.name} で入り、${AOKI_CONFERENCE.date} の日の表示を開いている`)

            await expect(
              column.getByTestId(/^schedule-event-/).filter({ hasText: AOKI_CONFERENCE.title }),
            ).toBeVisible()
            await check(`${LOGIN_STAFF.name} の列に 10:00 の「${AOKI_CONFERENCE.title}」が出る`)
          },
        )
      })

      test(`${prefix}チームリーダーが日の表示を開いた場合、見てよくない職員の予定が出ず、自分の予定は出ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-permission-leader',
            title:
              'チーム B のリーダーには、チーム A の青木 陽菜の予定が日の表示に出ず、自分の予定は出る',
            actor: `${LEADER.staff.name}（チーム B のリーダー、チーム B の予定の閲覧の権限あり）`,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LEADER.email)
          },
          async ({ page, step, check }) => {
            await page.goto(`/schedule?view=day&date=${AOKI_CONFERENCE.date}`)
            await expect(page.getByTestId('viewer-menu')).toContainText(LEADER.staff.name)
            const aoki = page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
            await expect(aoki).toBeVisible()
            await step(
              `${LEADER.staff.name} で入り、${AOKI_CONFERENCE.date} の日の表示を開いている`,
            )

            await expect(aoki.getByTestId(/^schedule-event-/)).toHaveCount(0)
            await check(
              `${LOGIN_STAFF.name} の列に、マネージャーには出る 10:00 の「${AOKI_CONFERENCE.title}」が出ない`,
            )

            await step(`次の日（${MORI_VISIT.date}）へ移る`)
            await page.getByTestId('calendar-next').click()
            await expect(
              page
                .getByTestId(`day-grid-staff-${LEADER.staff.id}`)
                .getByTestId(/^schedule-event-/)
                .filter({ hasText: MORI_VISIT.title }),
            ).toBeVisible()
            await check(`${LEADER.staff.name} の列に、自分の「${MORI_VISIT.title}」が出る`)
          },
        )
      })

      test(`${prefix}チームリーダーが見てよくない職員の予定を API で取得した場合、403 が返ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-permission-api-forbidden',
            title:
              'チーム B のリーダーが、チーム A の青木 陽菜の予定を API で取得すると 403 が返る',
            actor: `${LEADER.staff.name}（チーム B のリーダー）`,
            variant,
          },
          prepareApiReference('schedule', LEADER.email),
          async ({ page, step, check }, token) => {
            await routeApiReference(page)
            await openApiClient(page, 'schedule', {
              tag: 'schedule',
              method: 'get',
              path: '/v1/schedules/{schedule_id}',
            })
            await step('API の参照のページで「単発の予定を取得する」のリクエストを開いている')

            await step(`認証の欄に ${LEADER.staff.name} のトークンを入れる（伏せ字で出る）`)
            await fillApiToken(page, token)

            await step(
              `${LOGIN_STAFF.name} の「${AOKI_CONFERENCE.title}」（${AOKI_CONFERENCE.id}）を取得するリクエストを送る`,
            )
            await fillApiVariable(page, 'schedule_id', AOKI_CONFERENCE.id)
            await apiClient(page).send.click()
            await expect(apiClient(page).dialog).toContainText('403 Forbidden')
            await expect(apiClient(page).dialog).toContainText('"code": "forbidden"')
            await check('403 が返り、code は forbidden になる')
          },
        )
      })
    }
  })
})
