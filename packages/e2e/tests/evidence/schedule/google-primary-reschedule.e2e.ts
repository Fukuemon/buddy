import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { CALENDARPIT_URL, OKADA } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import {
  createGoogleEvent,
  deleteGoogleEvent,
  listGoogleEvents,
  moveGoogleEvent,
} from '../../fixtures/googleCalendar'
import { endPatientService, registerPatient } from '../../fixtures/patient'
import { detailDateTimeText } from '../../fixtures/schedule'
import { calendarpitEvent } from '../../selectors/calendarpit'
import { signInAtBroker } from '../../screens/login'

const ACTOR = `${OKADA.staff.name}（Google カレンダーを正本にする事業所のマネージャー）`

/** 今日から days 日後の Asia/Tokyo の日付（YYYY-MM-DD）。Projection は今日の前後の予定を持つので、今日と明日に予定を置く。 */
const dateInTokyo = (days = 0) =>
  new Date(Date.now() + (9 + days * 24) * 60 * 60 * 1000).toISOString().slice(0, 10)

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

/** Google カレンダーに今日の予定を作り、同期で予定のカレンダーに出るまで待つ。Google の予定の ID を返す。 */
const prepareSyncedEvent = async (page: Page, title: string, start: string, end: string) => {
  await signIn(page)
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
}

/**
 * ログインし、利用者を登録して、予定の作成の画面で今日の訪問の予定を「訪看I3」で作る。
 * 利用者の名前と ID、API のトークンを返す。
 */
const prepareVisit = async (page: Page) => {
  await signIn(page)
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
}

test.describe('予定のカレンダー', () => {
  test.describe('Google カレンダーを正本にする事業所の予定の日時の変更', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const label = variant.label ? `${variant.label}: ` : ''

      test(`${label}予定の編集の画面で単発の予定の日時を変えて保存した場合、予定のカレンダーと calendarpit の両方で新しい日時になること`, async ({
        browser,
        request,
      }) => {
        const today = dateInTokyo()
        const tomorrow = dateInTokyo(1)
        const title = `打ち合わせ ${Date.now()}`
        await recordPrEvidence(
          browser,
          {
            name: 'google-primary-reschedule-from-buddy',
            title:
              'Google カレンダーを正本にする事業所で buddy から予定の日時を変えると、予定のカレンダーと calendarpit で新しい日時になる',
            actor: ACTOR,
            variant,
          },
          (page) => prepareSyncedEvent(page, title, '10:00', '11:00'),
          async ({ page, step, check }, eventId) => {
            try {
              await openDay(page, today)
              const event = okadaEvent(page, title)
              await expect(event).toBeVisible()
              await event.scrollIntoViewIfNeeded()
              await step(
                `予定のカレンダーを ${today} の日の表示で開いている。${OKADA.staff.name} の列の 10:00〜11:00 に、Google カレンダーで作った「${title}」が出ている`,
              )

              await step('予定を押して詳細を開き、「編集」を押す')
              await event.click()
              await page.getByTestId('schedule-detail-edit').click()

              await step(
                `予定日時で、日付を ${tomorrow}、開始時間を 15:00、終了時間を 16:00 にして「保存」を押す`,
              )
              await page.getByTestId('schedule-field-date-time').click()
              await page.getByTestId('schedule-form-date').fill(tomorrow)
              await page.getByTestId('schedule-form-start-time').fill('15:00')
              await page.getByTestId('schedule-form-end-time').fill('16:00')
              await page.getByTestId('schedule-edit-submit').click()
              await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
              await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(
                detailDateTimeText(tomorrow, '15:00', '16:00'),
              )
              await check('予定の詳細に戻り、日時が明日の 15:00〜16:00 になっている')

              await step(`予定の詳細を閉じ、${tomorrow} の日の表示を開く`)
              await page.getByTestId('schedule-detail-close').click()
              await openDay(page, tomorrow)
              const moved = okadaEvent(page, title)
              await expect(moved).toBeVisible()
              await moved.scrollIntoViewIfNeeded()
              await check(
                `${tomorrow} の ${OKADA.staff.name} の列の 15:00〜16:00 に「${title}」が出る`,
              )

              await step(`${today} の日の表示を開く`)
              await openDay(page, today)
              await expect(okadaEvent(page, title)).toHaveCount(0)
              await check(`${today} の ${OKADA.staff.name} の列から「${title}」が消える`)

              await step(
                `Google カレンダーの代わりの calendarpit の管理の画面で、${OKADA.calendarId} の ${tomorrow} を開く`,
              )
              const written = await findOkadaGoogleEvent(request, title)
              expect(written?.start?.dateTime).toBe(`${tomorrow}T15:00:00+09:00`)
              expect(written?.end?.dateTime).toBe(`${tomorrow}T16:00:00+09:00`)
              await openCalendarpit(page, tomorrow)
              await expect(calendarpitEvent(page, title)).toBeVisible()
              await check(
                `${OKADA.calendarId} の ${tomorrow} に「${title}」が出て、日時が ${tomorrow} の 15:00〜16:00 になっている`,
              )
            } finally {
              await deleteGoogleEvent(request, OKADA.calendarId, eventId)
            }
          },
        )
      })

      test(`${label}calendarpit で単発の訪問の予定の日時を変えた場合、同期の後に予定のカレンダーで新しい日時になり、訪問の情報が残ること`, async ({
        browser,
        request,
      }) => {
        const today = dateInTokyo()
        const tomorrow = dateInTokyo(1)
        let prepared: Awaited<ReturnType<typeof prepareVisit>> | undefined
        try {
          await recordPrEvidence(
            browser,
            {
              name: 'google-primary-reschedule-from-google',
              title:
                'Google カレンダーを正本にする事業所で Google カレンダーから訪問の予定の日時を変えると、同期の後に予定のカレンダーで新しい日時になり、訪問の情報が残る',
              actor: ACTOR,
              variant,
            },
            async (page) => {
              prepared = await prepareVisit(page)
              return prepared
            },
            async ({ page, step, check }, { patientName }) => {
              await openDay(page, today)
              const event = okadaEvent(page, patientName)
              await expect(event).toBeVisible()
              await event.scrollIntoViewIfNeeded()
              await step(
                `予定のカレンダーを ${today} の日の表示で開いている。buddy で作った ${patientName} の「訪看I3」の訪問が、${OKADA.staff.name} の列に出ている`,
              )

              const written = await findOkadaGoogleEvent(request, patientName)
              if (written?.start?.dateTime === undefined || written.end?.dateTime === undefined)
                throw new Error('calendarpit に訪問の予定が無い')
              const minutes =
                (new Date(written.end.dateTime).getTime() -
                  new Date(written.start.dateTime).getTime()) /
                60_000
              const end = new Date(Date.parse(`${tomorrow}T14:00:00+09:00`) + minutes * 60_000)
              const endTime = new Date(end.getTime() + 9 * 60 * 60 * 1000)
                .toISOString()
                .slice(11, 16)
              await step(
                `（撮影のため、職員が Google カレンダーで予定を動かす代わりに、calendarpit の管理の API で訪問の予定を ${tomorrow} の 14:00〜${endTime} に動かす）`,
              )
              await moveGoogleEvent(
                request,
                OKADA.calendarId,
                written.id,
                `${tomorrow}T14:00:00+09:00`,
                `${tomorrow}T${endTime}:00+09:00`,
              )

              await step(`${tomorrow} の日の表示を開き、同期で予定が移るまで読み直す`)
              await openDay(page, tomorrow)
              const moved = okadaEvent(page, patientName)
              await expect(async () => {
                await page.reload()
                await expect(moved).toBeVisible()
              }).toPass()
              await moved.scrollIntoViewIfNeeded()
              await check(
                `${tomorrow} の ${OKADA.staff.name} の列の 14:00〜${endTime} に、${patientName} の訪問が出る`,
              )

              await step('予定を押して詳細を開く')
              await moved.click()
              const detail = page.getByTestId('schedule-detail-modal')
              await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(
                detailDateTimeText(tomorrow, '14:00', endTime),
              )
              const visit = detail.getByTestId('schedule-detail-visit-fields')
              await expect(visit).toContainText(patientName)
              await expect(visit).toContainText('訪看I3')
              await check(
                `詳細の日時が ${tomorrow} の 14:00〜${endTime} で、訪問の情報に利用者の ${patientName} とサービスコードの「訪看I3」が残る`,
              )

              await step(`予定の詳細を閉じ、${today} の日の表示を開く`)
              await page.getByTestId('schedule-detail-close').click()
              await expect(detail).toBeHidden()
              await openDay(page, today)
              await expect(okadaEvent(page, patientName)).toHaveCount(0)
              await check(`${today} の ${OKADA.staff.name} の列から ${patientName} の訪問が消える`)
            },
          )
        } finally {
          if (prepared !== undefined) {
            const written = await findOkadaGoogleEvent(request, prepared.patientName)
            if (written !== undefined)
              await deleteGoogleEvent(request, OKADA.calendarId, written.id)
            await endPatientService(request, prepared.token, prepared.patientId)
          }
        }
      })
    }
  })
})
