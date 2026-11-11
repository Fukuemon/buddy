import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import { CALENDARPIT_URL, OKADA, OKADA_STATE } from '../../fixtures/env'
import {
  createGoogleEvent,
  deleteGoogleEvent,
  listGoogleEvents,
  moveGoogleEvent,
} from '../../fixtures/googleCalendar'
import { endPatientService, registerPatient } from '../../fixtures/patient'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { detailDateTimeText } from '../../fixtures/schedule'
import { calendarpitEvent } from '../../selectors/calendarpit'

/** 今日から days 日後の Asia/Tokyo の日付（YYYY-MM-DD）。Projection は今日の前後の予定を持つので、今日と明日に予定を置く。 */
const dateInTokyo = (days = 0) =>
  new Date(Date.now() + (9 + days * 24) * 60 * 60 * 1000).toISOString().slice(0, 10)

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

/** 録画の外で、Google カレンダーに今日の予定を作り、同期で予定のカレンダーに出るまで待つ。Google の予定の ID を返す。 */
const prepareSyncedEvent = (browser: Browser, title: string, start: string, end: string) =>
  prepareOutsideRecording(browser, { storageState: OKADA_STATE }, async (page) => {
    const { id } = await createGoogleEvent(page.request, OKADA.calendarId, {
      summary: title,
      date: dateInTokyo(),
      start,
      end,
    })
    await openDay(page, dateInTokyo())
    await expect(async () => {
      await page.reload()
      await expect(okadaEvent(page, title)).toBeVisible()
    }).toPass()
    return id
  })

/**
 * 録画の外で、利用者を登録して、予定の作成の画面で今日の訪問の予定を「訪看I3」で作る。
 * 利用者の名前と ID、API のトークンを返す。
 */
const prepareVisit = (browser: Browser) =>
  prepareOutsideRecording(browser, { storageState: OKADA_STATE }, async (page) => {
    const patientName = `日時 花子${Date.now() % 100000}`
    const token = await issueAccessToken(page.request, OKADA.email)
    const registered = await registerPatient(page.request, token, OKADA.facilityId, {
      name: patientName,
      assignedStaffId: OKADA.staff.id,
    })
    expect(registered.status()).toBe(201)
    const { id: patientId } = (await registered.json()) as { id: string }
    await openDay(page, dateInTokyo())
    await page.getByTestId('schedule-create-open').click()
    await page.getByTestId('schedule-kind-tab-visit').check()
    await page.getByTestId('service-code-訪看I3').check()
    await page.getByTestId('schedule-field-patient').click()
    await page.getByTestId(`patient-select-option-${patientId}`).check()
    await page.getByTestId('schedule-field-staff').click()
    await page.getByTestId(`staff-select-option-${OKADA.staff.id}`).check()
    await page.getByTestId('schedule-create-submit').click()
    await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
    await expect(okadaEvent(page, patientName)).toBeVisible()
    return { patientName, patientId, token }
  })

test.describe('予定のカレンダー', () => {
  test.describe(`予定を Google カレンダーで管理している事業所の予定の日時の変更（${OKADA.staff.name}、予定を Google カレンダーで管理している事業所のマネージャー）`, () => {
    test.use({ storageState: OKADA_STATE })

    test('google-primary-reschedule-from-buddy 予定の編集の画面で単発の予定の日時を変えて保存した場合、予定のカレンダーと calendarpit の両方で新しい日時になること', async ({
      browser,
      context,
      request,
    }) => {
      const today = dateInTokyo()
      const tomorrow = dateInTokyo(1)
      const title = `打ち合わせ ${Date.now()}`
      const eventId = await prepareSyncedEvent(browser, title, '10:00', '11:00')
      try {
        const page = await context.newPage()
        await openDay(page, today)
        const event = okadaEvent(page, title)
        await expect(event).toBeVisible()
        await event.scrollIntoViewIfNeeded()
        await intro(
          page,
          `予定を Google カレンダーで管理している事業所で buddy から予定の日時を変えると、予定のカレンダーと calendarpit で新しい日時になる\n前提 予定のカレンダーを ${today} の日の表示で開いている。${OKADA.staff.name} の列の 10:00〜11:00 に、Google カレンダーで作った「${title}」が出ている`,
        )

        await step(page, '予定を押して詳細を開き、「編集」を押す', async () => {
          await event.click()
          await page.getByTestId('schedule-detail-edit').click()
        })

        await step(
          page,
          `予定日時で、日付を ${tomorrow}、開始時間を 15:00、終了時間を 16:00 にして「保存」を押す`,
          async () => {
            await page.getByTestId('schedule-field-date-time').click()
            await page.getByTestId('schedule-form-date').fill(tomorrow)
            await page.getByTestId('schedule-form-start-time').fill('15:00')
            await page.getByTestId('schedule-form-end-time').fill('16:00')
            await page.getByTestId('schedule-edit-submit').click()
          },
        )
        await check(page, '予定の詳細に戻り、日時が明日の 15:00〜16:00 になっている', async () => {
          await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
          await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(
            detailDateTimeText(tomorrow, '15:00', '16:00'),
          )
        })

        const moved = okadaEvent(page, title)
        await step(page, `予定の詳細を閉じ、${tomorrow} の日の表示を開く`, async () => {
          await page.getByTestId('schedule-detail-close').click()
          await openDay(page, tomorrow)
          await expect(moved).toBeVisible()
          await moved.scrollIntoViewIfNeeded()
        })
        await check(
          page,
          `${tomorrow} の ${OKADA.staff.name} の列の 15:00〜16:00 に「${title}」が出る`,
          () => expect(moved).toBeVisible(),
        )

        await step(page, `${today} の日の表示を開く`, () => openDay(page, today))
        await check(page, `${today} の ${OKADA.staff.name} の列から「${title}」が消える`, () =>
          expect(okadaEvent(page, title)).toHaveCount(0),
        )

        let written: Awaited<ReturnType<typeof findOkadaGoogleEvent>>
        await step(
          page,
          `Google カレンダーの代わりの calendarpit の管理の画面で、${OKADA.calendarId} の ${tomorrow} を開く`,
          async () => {
            written = await findOkadaGoogleEvent(request, title)
            await openCalendarpit(page, tomorrow)
          },
        )
        await check(
          page,
          `${OKADA.calendarId} の ${tomorrow} に「${title}」が出て、日時が ${tomorrow} の 15:00〜16:00 になっている`,
          async () => {
            expect(written?.start?.dateTime).toBe(`${tomorrow}T15:00:00+09:00`)
            expect(written?.end?.dateTime).toBe(`${tomorrow}T16:00:00+09:00`)
            await expect(calendarpitEvent(page, title)).toBeVisible()
          },
        )
      } finally {
        await deleteGoogleEvent(request, OKADA.calendarId, eventId)
      }
    })

    test('google-primary-reschedule-from-google calendarpit で単発の訪問の予定の日時を変えた場合、同期の後に予定のカレンダーで新しい日時になり、訪問の情報が残ること', async ({
      browser,
      context,
      request,
    }) => {
      const today = dateInTokyo()
      const tomorrow = dateInTokyo(1)
      let prepared: Awaited<ReturnType<typeof prepareVisit>> | undefined
      try {
        prepared = await prepareVisit(browser)
        const { patientName } = prepared

        const page = await context.newPage()
        await openDay(page, today)
        const event = okadaEvent(page, patientName)
        await expect(event).toBeVisible()
        await event.scrollIntoViewIfNeeded()
        await intro(
          page,
          `予定を Google カレンダーで管理している事業所で Google カレンダーから訪問の予定の日時を変えると、同期の後に予定のカレンダーで新しい日時になり、訪問の情報が残る\n前提 予定のカレンダーを ${today} の日の表示で開いている。buddy で作った ${patientName} の「訪看I3」の訪問が、${OKADA.staff.name} の列に出ている`,
        )

        const written = await findOkadaGoogleEvent(request, patientName)
        if (written?.start?.dateTime === undefined || written.end?.dateTime === undefined)
          throw new Error('calendarpit に訪問の予定が無い')
        const minutes =
          (new Date(written.end.dateTime).getTime() - new Date(written.start.dateTime).getTime()) /
          60_000
        const end = new Date(Date.parse(`${tomorrow}T14:00:00+09:00`) + minutes * 60_000)
        const endTime = new Date(end.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(11, 16)
        await step(
          page,
          `（撮影のため、職員が Google カレンダーで予定を動かす代わりに、calendarpit の管理の API で訪問の予定を ${tomorrow} の 14:00〜${endTime} に動かす）`,
          () =>
            moveGoogleEvent(
              request,
              OKADA.calendarId,
              written.id,
              `${tomorrow}T14:00:00+09:00`,
              `${tomorrow}T${endTime}:00+09:00`,
            ),
        )

        const moved = okadaEvent(page, patientName)
        await step(page, `${tomorrow} の日の表示を開き、同期で予定が移るまで読み直す`, async () => {
          await openDay(page, tomorrow)
          await expect(async () => {
            await page.reload()
            await expect(moved).toBeVisible()
          }).toPass()
          await moved.scrollIntoViewIfNeeded()
        })
        await check(
          page,
          `${tomorrow} の ${OKADA.staff.name} の列の 14:00〜${endTime} に、${patientName} の訪問が出る`,
          () => expect(moved).toBeVisible(),
        )

        await step(page, '予定を押して詳細を開く', () => moved.click())
        const detail = page.getByTestId('schedule-detail-modal')
        await check(
          page,
          `詳細の日時が ${tomorrow} の 14:00〜${endTime} で、訪問の情報に利用者の ${patientName} とサービスコードの「訪看I3」が残る`,
          async () => {
            await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(
              detailDateTimeText(tomorrow, '14:00', endTime),
            )
            const visit = detail.getByTestId('schedule-detail-visit-fields')
            await expect(visit).toContainText(patientName)
            await expect(visit).toContainText('訪看I3')
          },
        )

        await step(page, `予定の詳細を閉じ、${today} の日の表示を開く`, async () => {
          await page.getByTestId('schedule-detail-close').click()
          await expect(detail).toBeHidden()
          await openDay(page, today)
        })
        await check(
          page,
          `${today} の ${OKADA.staff.name} の列から ${patientName} の訪問が消える`,
          () => expect(okadaEvent(page, patientName)).toHaveCount(0),
        )
      } finally {
        if (prepared !== undefined) {
          const written = await findOkadaGoogleEvent(request, prepared.patientName)
          if (written !== undefined) await deleteGoogleEvent(request, OKADA.calendarId, written.id)
          await endPatientService(request, prepared.token, prepared.patientId)
        }
      }
    })
  })
})
