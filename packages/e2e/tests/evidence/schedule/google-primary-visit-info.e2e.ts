import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import { CALENDARPIT_URL, OKADA, OKADA_STATE } from '../../fixtures/env'
import {
  createGoogleEvent,
  deleteGoogleEvent,
  listGoogleEvents,
} from '../../fixtures/googleCalendar'
import { endPatientService, registerPatient } from '../../fixtures/patient'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { calendarpitEvent } from '../../selectors/calendarpit'

/** Google カレンダーで作る予定のタイトル。利用者の名前がシードに無いので、確認が必要な予定（利用者が見つからない）になる。撮るたびに名前を変える。 */
const unknownTitle = (who: string) => `【訪看I2】未登録 ${who}${Date.now() % 100000}`

/** 今日の Asia/Tokyo の日付（YYYY-MM-DD）。Projection は今日の前後の予定を持つので、今日に予定を作る。 */
const todayInTokyo = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

const openDay = async (page: Page) => {
  await page.goto(`/schedule?view=day&date=${todayInTokyo()}`)
  await expect(page.getByTestId(`day-grid-staff-${OKADA.staff.id}`)).toBeVisible()
}

/** 日の表示の岡田の列の、text を含む予定。 */
const okadaEvent = (page: Page, text: string) =>
  page
    .getByTestId(`day-grid-staff-${OKADA.staff.id}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: text })

/** 岡田のカレンダー（calendarpit）の予定のうち、タイトルに text を含むもの。 */
const findOkadaGoogleEvent = async (request: APIRequestContext, text: string) =>
  (await listGoogleEvents(request, OKADA.calendarId)).find((event) => event.summary?.includes(text))

/**
 * 録画の外で、利用者を登録し、Google カレンダーにタイトルから利用者を読み取れない予定を作って、同期で予定のカレンダーに出るまで待つ。
 * 利用者の名前と ID、Google の予定の ID、API のトークンを返す。
 */
const prepareNeedsReview = (browser: Browser, title: string, start: string, end: string) =>
  prepareOutsideRecording(browser, { storageState: OKADA_STATE }, async (page) => {
    const patientName = `補足 花子${Date.now() % 100000}`
    const token = await issueAccessToken(page.request, OKADA.email)
    const registered = await registerPatient(page.request, token, OKADA.facilityId, {
      name: patientName,
      assignedStaffId: OKADA.staff.id,
    })
    expect(registered.status()).toBe(201)
    const { id: patientId } = (await registered.json()) as { id: string }
    const { id: eventId } = await createGoogleEvent(page.request, OKADA.calendarId, {
      summary: title,
      date: todayInTokyo(),
      start,
      end,
    })
    await openDay(page)
    await expect(async () => {
      await page.reload()
      await expect(okadaEvent(page, title)).toBeVisible()
    }).toPass()
    return { patientName, patientId, eventId, token }
  })

/** 予定の詳細から編集を開き、予定の種類を訪問にして利用者を選び、保存する。 */
const addVisitInfo = async (page: Page, patientId: string) => {
  await page.getByTestId('schedule-detail-edit').click()
  await page.getByTestId('schedule-kind-tab-visit').check()
  await page.getByTestId('schedule-field-patient').click()
  await page.getByTestId(`patient-select-option-${patientId}`).check()
  await page.getByTestId('schedule-edit-submit').click()
  await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
}

// 改修前は編集に予定の種類が無く、訪問の情報を足す操作が無いので、@compare を付けずに改修後の流れを撮る
test.describe('予定の編集', () => {
  test.describe(`Google カレンダーで作った確認が必要な予定への訪問の情報の追加（${OKADA.staff.name}、Google カレンダーを正本にする事業所のマネージャー）`, () => {
    test.use({ storageState: OKADA_STATE })

    test('google-primary-visit-info 確認が必要な予定を編集し、訪問の情報を入れて保存した場合、確認が必要な予定から外れ、訪問の予定として出ること', async ({
      browser,
      context,
      request,
    }) => {
      const title = unknownTitle('次郎')
      let prepared: Awaited<ReturnType<typeof prepareNeedsReview>> | undefined
      try {
        prepared = await prepareNeedsReview(browser, title, '15:00', '15:29')
        const { patientName, patientId } = prepared

        const page = await context.newPage()
        await openDay(page)
        const event = okadaEvent(page, title)
        await expect(event).toBeVisible()
        await event.scrollIntoViewIfNeeded()
        await intro(
          page,
          `確認が必要な Google カレンダーの予定に、予定の編集で訪問の情報を足すと、訪問の予定になる\n前提 予定のカレンダーを日の表示で開いている。Google カレンダーで作った「${title}」は、利用者が見つからず確認が必要な予定である。利用者の ${patientName} を API で登録してある`,
        )

        await step(page, '予定を押して詳細を開く', () => event.click())
        await check(page, '詳細に、確認が必要な理由と直し方が出る', () =>
          expect(page.getByTestId('schedule-detail-review-reason')).toBeVisible(),
        )

        await step(
          page,
          `「編集」を押し、予定の種類で「訪問」を選び、利用者に ${patientName} を選んで保存する`,
          () => addVisitInfo(page, patientId),
        )
        const detail = page.getByTestId('schedule-detail-modal')
        await check(
          page,
          '保存すると予定の詳細に戻り、利用者が出て、確認が必要な理由が出ない',
          async () => {
            await expect(detail).toContainText(patientName)
            await expect(page.getByTestId('schedule-detail-review-reason')).toHaveCount(0)
          },
        )

        const visit = okadaEvent(page, patientName)
        await step(page, '予定の詳細を閉じる', async () => {
          await page.getByTestId('schedule-detail-close').click()
          await expect(detail).toBeHidden()
          await expect(visit).toBeVisible()
          await visit.scrollIntoViewIfNeeded()
        })
        await check(
          page,
          `日の表示の ${OKADA.staff.name} の列に、${patientName} の訪問として出る`,
          async () => {
            await expect(visit).toBeVisible()
            await expect(okadaEvent(page, title)).toHaveCount(0)
          },
        )
      } finally {
        if (prepared !== undefined) {
          const written = await findOkadaGoogleEvent(request, prepared.patientName)
          await deleteGoogleEvent(request, OKADA.calendarId, written?.id ?? prepared.eventId)
          await endPatientService(request, prepared.token, prepared.patientId)
        }
      }
    })

    test('google-primary-visit-info-title 確認が必要な予定に訪問の情報を入れて保存した場合、calendarpit の予定のタイトルが訪問の情報に合わせて書き直されていること', async ({
      browser,
      context,
      request,
    }) => {
      const title = unknownTitle('三郎')
      let prepared: Awaited<ReturnType<typeof prepareNeedsReview>> | undefined
      try {
        prepared = await prepareNeedsReview(browser, title, '16:00', '16:29')
        const { patientName, patientId } = prepared

        const page = await context.newPage()
        const date = todayInTokyo()
        const calendarpit = `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(OKADA.calendarId)}&date=${date}`
        await page.goto(calendarpit)
        await expect(calendarpitEvent(page, title)).toBeVisible()
        await intro(
          page,
          `確認が必要な Google カレンダーの予定に訪問の情報を足すと、calendarpit のタイトルが訪問の情報に合わせて書き直される\n前提 Google カレンダーの代わりの calendarpit の管理の画面で、${OKADA.calendarId} の ${date} を開いている。「${title}」がある`,
        )

        await step(
          page,
          `予定のカレンダーで「${title}」の詳細から「編集」を押し、「訪問」を選び、利用者に ${patientName} を選んで保存する`,
          async () => {
            await openDay(page)
            await okadaEvent(page, title).click()
            await addVisitInfo(page, patientId)
            await expect(okadaEvent(page, patientName)).toBeVisible()
          },
        )

        let summary = ''
        await step(
          page,
          `calendarpit の管理の画面で、${OKADA.calendarId} の ${date} を開き直す`,
          async () => {
            // サービスコードは、利用者を選んだときに選ぶ利用者のサービスコードになる
            summary = (await findOkadaGoogleEvent(request, patientName))?.summary ?? ''
            await page.goto(calendarpit)
          },
        )
        await check(
          page,
          `タイトルが「【サービス内容】${patientName}」の形の「${summary}」に書き直され、「${title}」が無い`,
          async () => {
            expect(summary).toMatch(new RegExp(`^【.+】${patientName}$`))
            await expect(calendarpitEvent(page, summary)).toBeVisible()
            await expect(calendarpitEvent(page, title)).toHaveCount(0)
          },
        )
      } finally {
        if (prepared !== undefined) {
          const written = await findOkadaGoogleEvent(request, prepared.patientName)
          await deleteGoogleEvent(request, OKADA.calendarId, written?.id ?? prepared.eventId)
          await endPatientService(request, prepared.token, prepared.patientId)
        }
      }
    })
  })
})
