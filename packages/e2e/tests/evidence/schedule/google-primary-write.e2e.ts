import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import { CALENDARPIT_URL, OKADA, OKADA_STATE } from '../../fixtures/env'
import {
  createGoogleEvent,
  deleteGoogleEvent,
  listGoogleEvents,
  shiftGoogleEvent,
} from '../../fixtures/googleCalendar'
import { endPatientService, registerPatient } from '../../fixtures/patient'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { calendarpitEvent } from '../../selectors/calendarpit'
import { scheduleFormSubmitError } from '../../selectors/scheduleForm'

/** 今日の Asia/Tokyo の日付（YYYY-MM-DD）。Projection は今日の前後の予定を持つので、今日に予定を作る。 */
const todayInTokyo = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

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

/** 録画の外で、Google カレンダーに予定を作り、同期で予定のカレンダーに出るまで待つ。Google の予定の ID を返す。 */
const prepareSyncedEvent = (browser: Browser, title: string, start: string, end: string) =>
  prepareOutsideRecording(browser, { storageState: OKADA_STATE }, async (page) => {
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
  })

test.describe('予定のカレンダー', () => {
  test.describe(`予定を Google カレンダーで管理している事業所の buddy からの書き込み（${OKADA.staff.name}、予定を Google カレンダーで管理している事業所のマネージャー）`, () => {
    test.use({ storageState: OKADA_STATE })

    test('google-primary-write-create 予定の作成の画面で訪問の予定を保存した場合、予定のカレンダーに予定が出て、calendarpit にも同じ予定ができること', async ({
      context,
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
      const page = await context.newPage()
      try {
        await openDay(page, todayInTokyo())
        await intro(
          page,
          `予定を Google カレンダーで管理している事業所で buddy から訪問の予定を作ると、予定のカレンダーと calendarpit に出る\n前提 予定のカレンダーを日の表示で開いている。利用者の ${patientName} を API で登録してある`,
        )

        await step(page, '「予定を作成」を押し、訪問の予定で「訪看I3」を選ぶ', async () => {
          await page.getByTestId('schedule-create-open').click()
          await page.getByTestId('schedule-kind-tab-visit').check()
          await page.getByTestId('service-code-訪看I3').check()
        })

        const event = okadaEvent(page, patientName)
        await step(
          page,
          `利用者に ${patientName}、主訪問者に ${OKADA.staff.name} を選び、作成する`,
          async () => {
            await page.getByTestId('schedule-field-patient').click()
            await page.getByTestId(`patient-select-option-${patientId}`).check()
            await page.getByTestId('schedule-field-staff').click()
            await page.getByTestId(`staff-select-option-${OKADA.staff.id}`).check()
            await page.getByTestId('schedule-create-submit').click()
            await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
            await expect(event).toBeVisible()
            await event.scrollIntoViewIfNeeded()
          },
        )
        await check(
          page,
          `日の表示の ${OKADA.staff.name} の列に、${patientName} の訪問が出る`,
          () => expect(event).toBeVisible(),
        )

        const written = await findOkadaGoogleEvent(request, patientName)
        const date = written?.start?.dateTime?.slice(0, 10) ?? todayInTokyo()
        await step(
          page,
          `Google カレンダーの代わりの calendarpit の管理の画面で、${OKADA.calendarId} の ${date} を開く`,
          async () => {
            await openCalendarpit(page, date)
          },
        )
        await check(page, `${OKADA.calendarId} に、${patientName} の訪問の予定が出る`, () =>
          expect(calendarpitEvent(page, written?.summary ?? patientName)).toBeVisible(),
        )
      } finally {
        const written = await findOkadaGoogleEvent(request, patientName)
        if (written !== undefined) await deleteGoogleEvent(request, OKADA.calendarId, written.id)
        await endPatientService(request, token, patientId)
      }
    })

    test('google-primary-write-cancel 予定の詳細から予定を取り消した場合、予定のカレンダーから予定が消え、calendarpit からも消えること', async ({
      browser,
      context,
      request,
    }) => {
      const date = todayInTokyo()
      const title = `勉強会 ${Date.now()}`
      const eventId = await prepareSyncedEvent(browser, title, '16:00', '17:00')
      try {
        const page = await context.newPage()
        await openDay(page, date)
        const event = okadaEvent(page, title)
        await expect(event).toBeVisible()
        await event.scrollIntoViewIfNeeded()
        await intro(
          page,
          `予定を Google カレンダーで管理している事業所で buddy から予定を取り消すと、予定のカレンダーと calendarpit から消える\n前提 予定のカレンダーを日の表示で開いている。${OKADA.staff.name} の列の 16:00〜17:00 に「${title}」が出ている`,
        )

        await step(page, '予定を押して詳細を開き、「予定をキャンセル」を押す', async () => {
          await event.click()
          await page.getByTestId('schedule-detail-cancel-schedule').click()
        })
        const dialog = page.getByTestId('schedule-cancel-dialog')
        await check(
          page,
          'キャンセルのモーダルに、Google カレンダーから予定を消し、理由が残らないことが出る',
          () =>
            expect(dialog.getByTestId('schedule-cancel-description')).toContainText(
              'Google カレンダーから予定を消します',
            ),
        )

        await step(
          page,
          'キャンセルの理由に「講師の都合で中止」を入れ、「予定をキャンセルする」を押す',
          async () => {
            await dialog.getByTestId('schedule-cancel-reason').fill('講師の都合で中止')
            await dialog.getByTestId('schedule-cancel-submit').click()
          },
        )
        await check(
          page,
          `日の表示の ${OKADA.staff.name} の列から「${title}」が消える`,
          async () => {
            await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()
            await expect(okadaEvent(page, title)).toHaveCount(0)
          },
        )

        await step(
          page,
          `Google カレンダーの代わりの calendarpit の管理の画面で、${OKADA.calendarId} の ${date} を開く`,
          async () => {
            await openCalendarpit(page, date)
          },
        )
        await check(page, `${OKADA.calendarId} から「${title}」が消える`, () =>
          expect(calendarpitEvent(page, title)).toHaveCount(0),
        )
      } finally {
        const left = await findOkadaGoogleEvent(request, title)
        if (left !== undefined) await deleteGoogleEvent(request, OKADA.calendarId, eventId)
      }
    })

    test('google-primary-write-changed 予定を開いた後に calendarpit で同じ予定を変えてから保存した場合、Google カレンダーで変更されたことと最新の予定を示し、入力を残すこと', async ({
      browser,
      context,
      request,
    }) => {
      const date = todayInTokyo()
      const title = `面談 ${Date.now()}`
      const memo = '持ち物: 資料'
      const eventId = await prepareSyncedEvent(browser, title, '13:00', '14:00')
      try {
        const page = await context.newPage()
        await openDay(page, date)
        const event = okadaEvent(page, title)
        await expect(event).toBeVisible()
        await event.scrollIntoViewIfNeeded()
        await intro(
          page,
          `編集を開いた後に Google カレンダーで予定が変わると、保存で変更されたことと最新の予定を示し、入力を残す\n前提 予定のカレンダーを日の表示で開いている。${OKADA.staff.name} の列の 13:00〜14:00 に「${title}」が出ている`,
        )

        await step(
          page,
          `予定を押して詳細を開き、「編集」を押して、メモに「${memo}」を入れる`,
          async () => {
            await event.click()
            await page.getByTestId('schedule-detail-edit').click()
            await page.getByTestId('schedule-field-description').click()
            await page.getByTestId('schedule-form-description').fill(memo)
          },
        )

        await step(
          page,
          `（撮影のため、職員が Google カレンダーで予定を変える代わりに、calendarpit の管理の API で「${title}」を 14:00〜15:00 に遅らせる）`,
          () => shiftGoogleEvent(request, OKADA.calendarId, eventId),
        )

        await step(page, '「保存」を押す', () => page.getByTestId('schedule-edit-submit').click())
        const latest = page.getByTestId('schedule-edit-latest')
        await check(
          page,
          `「Google カレンダーで予定が変更されていました。」と、フォームの上に最新の 14:00〜15:00 の予定が出て、メモの「${memo}」が残る`,
          async () => {
            await expect(latest).toBeVisible()
            await expect(scheduleFormSubmitError(page)).toContainText(
              'Google カレンダーで予定が変更されていました。',
            )
            await expect(latest.getByTestId('schedule-edit-latest-datetime')).toContainText('14:00')
            await expect(page.getByTestId('schedule-form-description')).toHaveValue(memo)
          },
        )
      } finally {
        await deleteGoogleEvent(request, OKADA.calendarId, eventId)
      }
    })
  })
})
