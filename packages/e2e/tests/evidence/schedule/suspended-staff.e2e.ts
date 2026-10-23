import { expect, test, type APIRequestContext } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { LOGIN_EMAIL, LOGIN_STAFF, OFFICE_B, SUSPENDED_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { listStaff, STAFF_FORM } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'

type ListedStaff = { id: string; username: string; suspended_at: string | null }

/** 予定の API の職員の一覧を、email の職員のトークンで取る。録画に映らない API の結果を字幕に出すのに使う。 */
const fetchStaff = async (request: APIRequestContext, email: string, facilityId: string) => {
  const res = await listStaff(request, await issueAccessToken(request, email), facilityId)
  expect(res.status()).toBe(200)
  return (await res.json()) as ListedStaff[]
}

/** 字幕に出す、API の職員の一覧の 1 行。止めた職員には止めた時刻を添える。 */
const describeStaff = (list: ListedStaff[]) =>
  list
    .map((staff) =>
      staff.suspended_at === null
        ? staff.username
        : `${staff.username}（止めた時刻 ${staff.suspended_at}）`,
    )
    .join('、')

const OFFICE_B_ACTOR = `${OFFICE_B.staff.name}（2 つ目の事業所のマネージャー）`

test.describe('予定のカレンダー', () => {
  test.describe('止めた職員', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}止めた職員がいる事業所で予定のカレンダーを開いた場合、止めた職員の列が出ないこと`, async ({
        browser,
        request,
      }) => {
        const staff = await fetchStaff(request, OFFICE_B.email, OFFICE_B.facilityId)
        expect(staff.find(({ id }) => id === SUSPENDED_STAFF.id)?.suspended_at).not.toBeNull()
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-suspended-staff-column',
            title:
              '止めた職員がいる事業所で予定のカレンダーを日の表示で開くと、止めた職員の列が出ない',
            actor: OFFICE_B_ACTOR,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, OFFICE_B.email)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            await step(
              [
                '止めた職員がいる 2 つ目の事業所で、予定のカレンダーを開いている',
                `（撮影のため、録画に映らない予定の API の職員の一覧を出す）${describeStaff(staff)}`,
              ].join('\n'),
            )

            await step('日の表示を開く')
            await page.goto('/schedule?view=day')
            await expect(page.getByTestId(`day-grid-staff-${OFFICE_B.staff.id}`)).toBeVisible()
            await expect(page.getByTestId(`day-grid-staff-${SUSPENDED_STAFF.id}`)).toHaveCount(0)
            await check(
              `${OFFICE_B.staff.name}の列だけが出て、止めた職員の${SUSPENDED_STAFF.name}の列は出ない`,
            )
          },
        )
      })

      test(`${prefix}止めた職員がいる事業所で職員の絞り込みの候補を開いた場合、止めた職員が候補に出ないこと`, async ({
        browser,
        request,
      }) => {
        const staff = await fetchStaff(request, OFFICE_B.email, OFFICE_B.facilityId)
        expect(staff.find(({ id }) => id === SUSPENDED_STAFF.id)?.suspended_at).not.toBeNull()
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-suspended-staff-filter',
            title: '止めた職員がいる事業所で職員の絞り込みを開くと、止めた職員が候補に出ない',
            actor: OFFICE_B_ACTOR,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, OFFICE_B.email)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            await step(
              [
                '止めた職員がいる 2 つ目の事業所で、予定のカレンダーを開いている',
                `（撮影のため、録画に映らない予定の API の職員の一覧を出す）${describeStaff(staff)}`,
              ].join('\n'),
            )

            const sidebar = page.getByTestId('staff-filter-sidebar')
            await step('左の職員の絞り込みの候補を見る')
            await expect(
              sidebar.getByTestId(`staff-filter-staff-${OFFICE_B.staff.id}`),
            ).toBeVisible()
            await expect(
              sidebar.getByTestId(`staff-filter-staff-${SUSPENDED_STAFF.id}`),
            ).toHaveCount(0)
            await check(
              `職員の絞り込みの候補に${OFFICE_B.staff.name}だけが出て、止めた職員の${SUSPENDED_STAFF.name}は出ない`,
            )
          },
        )
      })

      test(`${prefix}止めていない職員だけの事業所で予定のカレンダーを開いた場合、全ての職員の列が API の一覧と同じ順に出ること`, async ({
        browser,
        request,
      }) => {
        const staff = await fetchStaff(request, LOGIN_EMAIL, STAFF_FORM.facilityId)
        expect(staff.every(({ suspended_at }) => suspended_at === null)).toBe(true)
        await recordPrEvidence(
          browser,
          {
            name: 'schedule-active-staff-columns',
            title:
              '止めていない職員だけの事業所で予定のカレンダーを日の表示で開くと、全ての職員の列が今と同じ順に出る',
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, LOGIN_EMAIL)
          },
          async ({ page, step, check }) => {
            await page.goto('/schedule')
            await step(
              [
                '止めた職員がいない 1 つ目の事業所で、予定のカレンダーを開いている',
                `（撮影のため、録画に映らない予定の API の職員の一覧を、API が返した順に出す）${describeStaff(staff)}`,
              ].join('\n'),
            )

            await step('日の表示を開く')
            await page.goto('/schedule?view=day')
            const columns = page.getByTestId(/^day-grid-staff-/)
            await expect(columns).toHaveCount(staff.length)
            for (const [index, { id }] of staff.entries()) {
              await expect(columns.nth(index)).toHaveAttribute(
                'data-testid',
                `day-grid-staff-${id}`,
              )
            }
            await check(`${staff.length} 人の職員の列が、API の一覧と同じ順に全て出る`)
          },
        )
      })
    }
  })
})
