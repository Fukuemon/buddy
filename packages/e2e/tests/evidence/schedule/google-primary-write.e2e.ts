import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { CALENDARPIT_URL, OKADA } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import {
  createGoogleEvent,
  deleteGoogleEvent,
  listGoogleEvents,
  shiftGoogleEvent,
} from '../../fixtures/googleCalendar'
import { endPatientService, registerPatient } from '../../fixtures/patient'
import { calendarpitEvent } from '../../selectors/calendarpit'
import { scheduleFormSubmitError } from '../../selectors/scheduleForm'
import { signInAtBroker } from '../../screens/login'

const ACTOR = `${OKADA.staff.name}（Google カレンダーを正本にする事業所のマネージャー）`

/** 今日の Asia/Tokyo の日付（YYYY-MM-DD）。Projection は今日の前後の予定を持つので、今日に予定を作る。 */
const todayInTokyo = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

const signIn = async (page: Page) => {
  await page.goto('/schedule')
  await signInAtBroker(page, OKADA.email)
}

const openDay = async (page: Page, date: string) => {
  await page.goto(`/schedule?view=day&date=${date}`)
  await expect(page.getByTestId(`day-grid-staff-${OKADA.staff.id}`)).toBeVisible()
}

/** 日の表示の岡田の列の、text を含む予定。 */
const okadaEvent = (page: Page, text: string) =>
  page
    .getByTestId(`day-grid-staff-${OKADA.staff.id}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: text })

/** 岡田のカレンダー（calendarpit）の予定のうち、タイトルに text を含むもの。訪問の予定のタイトルはサービス内容を前に持つ。 */
const findOkadaGoogleEvent = async (request: APIRequestContext, text: string) =>
  (await listGoogleEvents(request, OKADA.calendarId)).find((event) => event.summary?.includes(text))

const openCalendarpit = (page: Page, date: string) =>
  page.goto(`${CALENDARPIT_URL}/?calendar=${encodeURIComponent(OKADA.calendarId)}&date=${date}`)

/** Google カレンダーに予定を作り、同期で予定のカレンダーに出るまで待つ。Google の予定の ID を返す。 */
const prepareSyncedEvent = async (page: Page, title: string, start: string, end: string) => {
  await signIn(page)
  const { id } = await createGoogleEvent(page.request, OKADA.calendarId, {
    summary: title,
    date: todayInTokyo(),
    start,
    end,
  })
  await openDay(page, todayInTokyo())
  await expect(async () => {
    await page.reload()
    await expect(okadaEvent(page, title)).toBeVisible()
  }).toPass()
  return id
}

test.describe('予定のカレンダー', () => {
  test.describe('Google カレンダーを正本にする事業所の buddy からの書き込み', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const label = variant.label ? `${variant.label}: ` : ''

      test(`${label}予定の作成の画面で訪問の予定を保存した場合、予定のカレンダーに予定が出て、calendarpit にも同じ予定ができること`, async ({
        browser,
        request,
      }) => {
        const patientName = `書込 花子${Date.now() % 100000}`
        const token = await issueAccessToken(request, OKADA.email)
        const registered = await registerPatient(request, token, OKADA.facilityId, {
          name: patientName,
          assignedStaffId: OKADA.staff.id,
        })
        expect(registered.status()).toBe(201)
        const { id: patientId } = (await registered.json()) as { id: string }
        await recordPrEvidence(
          browser,
          {
            name: 'google-primary-write-create',
            title:
              'Google カレンダーを正本にする事業所で buddy から訪問の予定を作ると、予定のカレンダーと calendarpit に出る',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check }) => {
            try {
              await openDay(page, todayInTokyo())
              await step(
                `予定のカレンダーを日の表示で開いている。利用者の ${patientName} を API で登録してある`,
              )

              await step('「予定を作成」を押し、訪問の予定で「訪看I3」を選ぶ')
              await page.getByTestId('schedule-create-open').click()
              await page.getByTestId('schedule-kind-tab-visit').check()
              await page.getByTestId('service-code-訪看I3').check()

              await step(`利用者に ${patientName}、主訪問者に ${OKADA.staff.name} を選び、作成する`)
              await page.getByTestId('schedule-field-patient').click()
              await page.getByTestId(`patient-select-option-${patientId}`).check()
              await page.getByTestId('schedule-field-staff').click()
              await page.getByTestId(`staff-select-option-${OKADA.staff.id}`).check()
              await page.getByTestId('schedule-create-submit').click()
              await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
              const event = okadaEvent(page, patientName)
              await expect(event).toBeVisible()
              await event.scrollIntoViewIfNeeded()
              await check(`日の表示の ${OKADA.staff.name} の列に、${patientName} の訪問が出る`)

              const written = await findOkadaGoogleEvent(request, patientName)
              const date = written?.start?.dateTime?.slice(0, 10) ?? todayInTokyo()
              await step(
                `Google カレンダーの代わりの calendarpit の管理の画面で、${OKADA.calendarId} の ${date} を開く`,
              )
              await openCalendarpit(page, date)
              await expect(calendarpitEvent(page, written?.summary ?? patientName)).toBeVisible()
              await check(`${OKADA.calendarId} に、${patientName} の訪問の予定が出る`)
            } finally {
              const written = await findOkadaGoogleEvent(request, patientName)
              if (written !== undefined)
                await deleteGoogleEvent(request, OKADA.calendarId, written.id)
              await endPatientService(request, token, patientId)
            }
          },
        )
      })

      test(`${label}予定の詳細から予定を取り消した場合、予定のカレンダーから予定が消え、calendarpit からも消えること`, async ({
        browser,
        request,
      }) => {
        const date = todayInTokyo()
        const title = `勉強会 ${Date.now()}`
        await recordPrEvidence(
          browser,
          {
            name: 'google-primary-write-cancel',
            title:
              'Google カレンダーを正本にする事業所で buddy から予定を取り消すと、予定のカレンダーと calendarpit から消える',
            actor: ACTOR,
            variant,
          },
          (page) => prepareSyncedEvent(page, title, '16:00', '17:00'),
          async ({ page, step, check }, eventId) => {
            try {
              await openDay(page, date)
              const event = okadaEvent(page, title)
              await expect(event).toBeVisible()
              await event.scrollIntoViewIfNeeded()
              await step(
                `予定のカレンダーを日の表示で開いている。${OKADA.staff.name} の列の 16:00〜17:00 に「${title}」が出ている`,
              )

              await step('予定を押して詳細を開き、「予定をキャンセル」を押す')
              await event.click()
              await page.getByTestId('schedule-detail-cancel-schedule').click()
              const dialog = page.getByTestId('schedule-cancel-dialog')
              await expect(dialog.getByTestId('schedule-cancel-description')).toContainText(
                'Google カレンダーから予定を消します',
              )
              await check(
                'キャンセルのモーダルに、Google カレンダーから予定を消し、理由が残らないことが出る',
              )

              await step(
                'キャンセルの理由に「講師の都合で中止」を入れ、「予定をキャンセルする」を押す',
              )
              await dialog.getByTestId('schedule-cancel-reason').fill('講師の都合で中止')
              await dialog.getByTestId('schedule-cancel-submit').click()
              await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()
              await expect(okadaEvent(page, title)).toHaveCount(0)
              await check(`日の表示の ${OKADA.staff.name} の列から「${title}」が消える`)

              await step(
                `Google カレンダーの代わりの calendarpit の管理の画面で、${OKADA.calendarId} の ${date} を開く`,
              )
              await openCalendarpit(page, date)
              await expect(calendarpitEvent(page, title)).toHaveCount(0)
              await check(`${OKADA.calendarId} から「${title}」が消える`)
            } finally {
              const left = await findOkadaGoogleEvent(request, title)
              if (left !== undefined) await deleteGoogleEvent(request, OKADA.calendarId, eventId)
            }
          },
        )
      })

      test(`${label}予定を開いた後に calendarpit で同じ予定を変えてから保存した場合、Google カレンダーで変更されたことと最新の予定を示し、入力を残すこと`, async ({
        browser,
        request,
      }) => {
        const date = todayInTokyo()
        const title = `面談 ${Date.now()}`
        const memo = '持ち物: 資料'
        await recordPrEvidence(
          browser,
          {
            name: 'google-primary-write-changed',
            title:
              '編集を開いた後に Google カレンダーで予定が変わると、保存で変更されたことと最新の予定を示し、入力を残す',
            actor: ACTOR,
            variant,
          },
          (page) => prepareSyncedEvent(page, title, '13:00', '14:00'),
          async ({ page, step, check }, eventId) => {
            try {
              await openDay(page, date)
              const event = okadaEvent(page, title)
              await expect(event).toBeVisible()
              await event.scrollIntoViewIfNeeded()
              await step(
                `予定のカレンダーを日の表示で開いている。${OKADA.staff.name} の列の 13:00〜14:00 に「${title}」が出ている`,
              )

              await step(`予定を押して詳細を開き、「編集」を押して、メモに「${memo}」を入れる`)
              await event.click()
              await page.getByTestId('schedule-detail-edit').click()
              await page.getByTestId('schedule-field-description').click()
              await page.getByTestId('schedule-form-description').fill(memo)

              await step(
                `（撮影のため、職員が Google カレンダーで予定を変える代わりに、calendarpit の管理の API で「${title}」を 14:00〜15:00 に遅らせる）`,
              )
              await shiftGoogleEvent(request, OKADA.calendarId, eventId)

              await step('「保存」を押す')
              await page.getByTestId('schedule-edit-submit').click()
              const latest = page.getByTestId('schedule-edit-latest')
              await expect(latest).toBeVisible()
              await expect(scheduleFormSubmitError(page)).toContainText(
                'Google カレンダーで予定が変更されていました。',
              )
              await expect(latest.getByTestId('schedule-edit-latest-datetime')).toContainText(
                '14:00',
              )
              await expect(page.getByTestId('schedule-form-description')).toHaveValue(memo)
              await check(
                `「Google カレンダーで予定が変更されていました。」と、フォームの上に最新の 14:00〜15:00 の予定が出て、メモの「${memo}」が残る`,
              )
            } finally {
              await deleteGoogleEvent(request, OKADA.calendarId, eventId)
            }
          },
        )
      })
    }
  })
})
