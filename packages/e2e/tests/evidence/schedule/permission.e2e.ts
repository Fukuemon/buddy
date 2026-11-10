import { expect, test } from '@playwright/test'

import { issueAccessToken, routeApiReference } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import { LEADER, LEADER_STATE, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { openApiClient } from '../../screens/apiReference'
import { fillApiToken, fillApiVariable } from '../../widgets/apiClient/actions/apiClient'
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
  test.describe(`職員の権限による予定の閲覧（${LOGIN_STAFF.name}、マネージャー、事業所の全ての予定の閲覧の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('schedule-permission-manager 全ての予定を見られるマネージャーが日の表示を開いた場合、ほかのチームの職員の予定も出ること', async ({
      page,
    }) => {
      await page.goto(`/schedule?view=day&date=${AOKI_CONFERENCE.date}`)
      const column = page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
      await expect(column).toBeVisible()
      await intro(
        page,
        `全ての予定を見られるマネージャーには、日の表示に青木 陽菜の予定が出る\n前提 ${LOGIN_STAFF.name} で入り、${AOKI_CONFERENCE.date} の日の表示を開いている`,
      )

      await check(
        page,
        `${LOGIN_STAFF.name} の列に 10:00 の「${AOKI_CONFERENCE.title}」が出る`,
        () =>
          expect(
            column.getByTestId(/^schedule-event-/).filter({ hasText: AOKI_CONFERENCE.title }),
          ).toBeVisible(),
      )
    })
  })

  test.describe(`職員の権限による予定の閲覧（${LEADER.staff.name}、チーム B のリーダー、チーム B の予定の閲覧の権限あり）`, () => {
    test.use({ storageState: LEADER_STATE })

    test('schedule-permission-leader チームリーダーが日の表示を開いた場合、見てよくない職員の列が出ず、自分の予定は出ること', async ({
      page,
    }) => {
      await page.goto(`/schedule?view=day&date=${AOKI_CONFERENCE.date}`)
      await expect(page.getByTestId('viewer-menu')).toContainText(LEADER.staff.name)
      await expect(page.getByTestId(`day-grid-staff-${LEADER.staff.id}`)).toBeVisible()
      await intro(
        page,
        `チーム B のリーダーには、チーム A の青木 陽菜の列が日の表示に出ず、自分の予定は出る\n前提 ${LEADER.staff.name} で入り、${AOKI_CONFERENCE.date} の日の表示を開いている`,
      )

      await check(
        page,
        `マネージャーには出る ${LOGIN_STAFF.name} の列と、10:00 の「${AOKI_CONFERENCE.title}」が出ない`,
        () => expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toHaveCount(0),
      )

      await step(page, `次の日（${MORI_VISIT.date}）へ移る`, () =>
        page.getByTestId('calendar-next').click(),
      )
      await check(page, `${LEADER.staff.name} の列に、自分の「${MORI_VISIT.title}」が出る`, () =>
        expect(
          page
            .getByTestId(`day-grid-staff-${LEADER.staff.id}`)
            .getByTestId(/^schedule-event-/)
            .filter({ hasText: MORI_VISIT.title }),
        ).toBeVisible(),
      )
    })

    // トークンは録画の外で取る。API の参照のページはログインしない
    test('schedule-permission-api-forbidden チームリーダーが見てよくない職員の予定を API で取得した場合、403 が返ること', async ({
      context,
      request,
    }) => {
      const token = await issueAccessToken(request, LEADER.email)
      const page = await context.newPage()
      await routeApiReference(page)
      await openApiClient(page, 'schedule', {
        tag: 'schedule',
        method: 'get',
        path: '/v1/schedules/{schedule_id}',
      })
      await intro(
        page,
        'チーム B のリーダーが、チーム A の青木 陽菜の予定を API で取得すると 403 が返る\n前提 API の参照のページで「単発の予定を取得する」のリクエストを開いている',
      )

      await step(page, `認証の欄に ${LEADER.staff.name} のトークンを入れる（伏せ字で出る）`, () =>
        fillApiToken(page, token),
      )

      await step(
        page,
        `${LOGIN_STAFF.name} の「${AOKI_CONFERENCE.title}」（${AOKI_CONFERENCE.id}）を取得するリクエストを送る`,
        async () => {
          await fillApiVariable(page, 'schedule_id', AOKI_CONFERENCE.id)
          await apiClient(page).send.click()
        },
      )
      await check(page, '403 が返り、code は forbidden になる', async () => {
        await expect(apiClient(page).dialog).toContainText('403 Forbidden')
        await expect(apiClient(page).dialog).toContainText('"code": "forbidden"')
      })
    })
  })
})
