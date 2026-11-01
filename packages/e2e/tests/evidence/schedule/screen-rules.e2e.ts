import { expect, request, test, type APIRequestContext } from '@playwright/test'

import { LEADER, LOGIN_EMAIL, LOGIN_STAFF, SCHEDULE_URL } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { addPolicy, issueManagerToken, newStaff, registerStaffId } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'
import { scheduleDetailError } from '../../selectors/scheduleDetail'

/** シードの、青木の 2026-10-20 10:00 の予定「カンファレンス」。 */
const AOKI_CONFERENCE = {
  id: '01M3TC6BBRBQM0QK0S43P56AFH',
  date: '2026-10-20',
  title: 'カンファレンス',
}

/** 予定の API のシードの、事業所の全ての予定の閲覧の権限（schedule.all.read）。 */
const SCHEDULE_ALL_READ_POLICY = '01M5E1S42TTS7QZK05YGS0GYRD'

/** どの予定も指さない、形だけ正しい予定の ID。 */
const MISSING_SCHEDULE_ID = '01M3TC6BBRBQM0QK0S43P56AFZ'

const asManager = async <T>(fn: (api: APIRequestContext, token: string) => Promise<T>) => {
  const api = await request.newContext()
  try {
    return await fn(api, await issueManagerToken(api))
  } finally {
    await api.dispose()
  }
}

/** 予定の API のサービスコードの一覧（listServiceCodes）の code を、返る順に読む。 */
const listServiceCodes = () =>
  asManager(async (api, token) => {
    const res = await api.get(`${SCHEDULE_URL}/v1/visit_infos/service_codes`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.ok()).toBe(true)
    return ((await res.json()) as { code: string }[]).map((c) => c.code)
  })

test.describe('予定の画面の権限の出し分けとエラーの見せ方', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}予定の編集の権限を持たない職員がほかの職員の予定の詳細を開いた場合、編集のボタンが出ないこと`, async ({
      browser,
    }) => {
      const reader = newStaff('reader')
      await recordPrEvidence(
        browser,
        {
          name: 'schedule-detail-read-only',
          title: '予定の編集の権限を持たない職員には、ほかの職員の予定の詳細に編集のボタンが出ない',
          actor: `${reader.name}（メンバー、事業所の全ての予定の閲覧の権限だけを足した）`,
          variant,
        },
        async (page) => {
          await asManager(async (api, token) => {
            const id = await registerStaffId(api, token, reader)
            const res = await addPolicy(api, token, id, SCHEDULE_ALL_READ_POLICY)
            expect(res.status()).toBe(201)
          })
          await page.goto('/schedule')
          await signInAtBroker(page, reader.email)
        },
        async ({ page, step, check }) => {
          await page.goto(`/schedule?view=day&date=${AOKI_CONFERENCE.date}`)
          const column = page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)
          const event = column
            .getByTestId(/^schedule-event-/)
            .filter({ hasText: AOKI_CONFERENCE.title })
          await expect(event).toBeVisible()
          await step(
            `${reader.name} で入り、${AOKI_CONFERENCE.date} の日の表示を開いている\n${LOGIN_STAFF.name} の予定は見られるが、編集の権限は無い`,
          )

          await step(`${LOGIN_STAFF.name} の 10:00 の「${AOKI_CONFERENCE.title}」を押す`)
          await event.click()
          await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
          await expect(page.getByTestId('schedule-detail-close')).toBeVisible()
          await expect(page.getByTestId('schedule-detail-edit')).toHaveCount(0)
          await check('予定の詳細が開き、下端に「閉じる」だけが出て、「編集」が出ない')
        },
      )
    })

    test(`${prefix}存在しない予定の URL を開いた場合、予定が見つからない表示になること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'schedule-detail-not-found',
          title:
            '存在しない予定の URL を開くと、読み込みの失敗ではなく、予定が見つからない表示になる',
          actor: `${LOGIN_STAFF.name}（マネージャー）`,
          variant,
        },
        async (page) => {
          await page.goto('/schedule')
          await signInAtBroker(page, LOGIN_EMAIL)
        },
        async ({ page, step, check }) => {
          await page.goto('/schedule')
          await expect(page.getByTestId('schedule-create-open')).toBeVisible()
          await step(`${LOGIN_STAFF.name} で入り、予定のカレンダーを開いている`)

          await step(`存在しない予定の URL（/schedule/${MISSING_SCHEDULE_ID}）を開く`)
          const started = Date.now()
          await page.goto(`/schedule/${MISSING_SCHEDULE_ID}`)
          await expect(scheduleDetailError(page)).toHaveText('予定が見つかりません。')
          const seconds = ((Date.now() - started) / 1000).toFixed(1)
          await check(
            `予定の詳細に「予定が見つかりません。」が出て、「予定を取得できませんでした。」は出ない\n開いてから文が出るまで ${seconds} 秒（読み直さずに出す）`,
          )
        },
      )
    })

    test(`${prefix}予定の作成を開いた場合、サービスコードが予定の API の一覧のとおりに並ぶこと`, async ({
      browser,
    }) => {
      const codes = await listServiceCodes()
      await recordPrEvidence(
        browser,
        {
          name: 'schedule-new-service-codes',
          title: '予定の作成のサービスコードが、予定の API のサービスコードの一覧の順と表記で並ぶ',
          actor: `${LOGIN_STAFF.name}（マネージャー）`,
          variant,
        },
        async (page) => {
          await page.goto('/schedule')
          await signInAtBroker(page, LOGIN_EMAIL)
        },
        async ({ page, step, check }) => {
          await page.goto('/schedule')
          await expect(page.getByTestId('schedule-create-open')).toBeVisible()
          await step(
            `${LOGIN_STAFF.name} で入り、予定のカレンダーを開いている\n予定の API のサービスコードの一覧: ${codes.join('、')}`,
          )

          await step('「予定を作成」を押し、訪問の予定を選ぶ')
          await page.getByTestId('schedule-create-open').click()
          await page.getByTestId('schedule-kind-tab-visit').check()
          const radios = page.getByTestId(/^service-code-/)
          await expect(radios).toHaveCount(codes.length)
          const shown = await radios.evaluateAll((inputs) =>
            inputs.map((input) => (input as HTMLInputElement).value),
          )
          expect(shown).toEqual(codes)
          await check(
            `サービスコードが、予定の API の一覧と同じ順と表記で並ぶ\n画面の並び: ${shown.join('、')}`,
          )
        },
      )
    })

    test(`${prefix}予定の作成を開いた場合、主訪問者と訪問の区分の語で項目が出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'schedule-new-terms',
          title: '訪問の予定の作成で、項目が「主訪問者」「訪問の区分」の語で出る',
          actor: `${LOGIN_STAFF.name}（マネージャー）`,
          variant,
        },
        async (page) => {
          await page.goto('/schedule')
          await signInAtBroker(page, LOGIN_EMAIL)
        },
        async ({ page, step, check }) => {
          await page.goto('/schedule')
          await expect(page.getByTestId('schedule-create-open')).toBeVisible()
          await step(`${LOGIN_STAFF.name} で入り、予定のカレンダーを開いている`)

          await step('「予定を作成」を押し、訪問の予定を選ぶ')
          await page.getByTestId('schedule-create-open').click()
          await page.getByTestId('schedule-kind-tab-visit').check()
          await expect(page.getByTestId('schedule-field-staff')).toContainText('主訪問者')
          await expect(page.getByTestId('schedule-field-category')).toContainText('訪問の区分')
          await check(
            '項目の一覧に「主訪問者」と「訪問の区分」が出て、「担当者」「訪問の種類」は出ない',
          )

          await step('項目の一覧の「主訪問者」を押す')
          await page.getByTestId('schedule-field-staff').click()
          await expect(page.getByTestId('staff-select-search')).toBeVisible()
          await check('右の欄の見出しが「主訪問者を選んでください」になる')

          await step('項目の一覧の「訪問の区分」を押す')
          await page.getByTestId('schedule-field-category').click()
          await expect(page.getByTestId('staff-select-search')).toBeHidden()
          await check('右の欄の見出しが「訪問の区分を選んでください」になる')
        },
      )
    })

    test(`${prefix}チームリーダーが職員の絞り込みを開いた場合、見る権限の無い職員が出ないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'schedule-staff-filter-readable',
          title:
            'チーム B のリーダーの職員の絞り込みに、見る権限の無いチーム A の青木 陽菜が出ない',
          actor: `${LEADER.staff.name}（チーム B のリーダー、チーム B の予定の閲覧と編集の権限あり）`,
          variant,
        },
        async (page) => {
          await page.goto('/schedule')
          await signInAtBroker(page, LEADER.email)
        },
        async ({ page, step, check }) => {
          await page.goto('/schedule?view=day')
          const filter = page.getByTestId('staff-filter-sidebar')
          await expect(filter.getByTestId(`staff-filter-staff-${LEADER.staff.id}`)).toBeVisible()
          await step(`${LEADER.staff.name} で入り、日の表示を開いている`)

          await expect(filter.getByTestId(`staff-filter-staff-${LOGIN_STAFF.id}`)).toHaveCount(0)
          await check(
            `左の職員の絞り込みに ${LEADER.staff.name} は出て、チーム A の ${LOGIN_STAFF.name} は出ない`,
          )
        },
      )
    })
  }
})
