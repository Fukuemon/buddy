import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { CALENDARPIT_URL, OKADA } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import {
  createGoogleEvent,
  deleteGoogleEvent,
  listGoogleEvents,
} from '../../fixtures/googleCalendar'
import { endPatientService, registerPatient } from '../../fixtures/patient'
import { calendarpitEvent } from '../../selectors/calendarpit'
import { signInAtBroker } from '../../screens/login'

const ACTOR = `${OKADA.staff.name}（Google カレンダーを正本にする事業所のマネージャー）`

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
 * ログインし、利用者を登録し、Google カレンダーにタイトルから利用者を読み取れない予定を作って、同期で予定のカレンダーに出るまで待つ。
 * 利用者の名前と ID、Google の予定の ID、API のトークンを返す。
 */
const prepareNeedsReview = async (page: Page, title: string, start: string, end: string) => {
  await page.goto('/schedule')
  await signInAtBroker(page, OKADA.email)
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
}

/** 予定の詳細から編集を開き、予定の種類を訪問にして利用者を選び、保存する。 */
const addVisitInfo = async (page: Page, patientId: string) => {
  await page.getByTestId('schedule-detail-edit').click()
  await page.getByTestId('schedule-kind-tab-visit').check()
  await page.getByTestId('schedule-field-patient').click()
  await page.getByTestId(`patient-select-option-${patientId}`).check()
  await page.getByTestId('schedule-edit-submit').click()
  await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
}

test.describe('予定の編集', () => {
  test.describe('Google カレンダーで作った確認が必要な予定への訪問の情報の追加', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const label = variant.label ? `${variant.label}: ` : ''
      const isBefore = variant.name === 'before'

      test(`${label}確認が必要な予定を編集し、訪問の情報を入れて保存した場合、確認が必要な予定から外れ、訪問の予定として出ること`, async ({
        browser,
        request,
      }) => {
        const title = unknownTitle('次郎')
        let prepared: Awaited<ReturnType<typeof prepareNeedsReview>> | undefined
        try {
          await recordPrEvidence(
            browser,
            {
              name: 'google-primary-visit-info',
              title: isBefore
                ? '改修前は、確認が必要な Google カレンダーの予定の編集に予定の種類が無く、訪問の情報を足せない'
                : '確認が必要な Google カレンダーの予定に、予定の編集で訪問の情報を足すと、訪問の予定になる',
              actor: ACTOR,
              variant,
            },
            async (page) => {
              prepared = await prepareNeedsReview(page, title, '15:00', '15:29')
              return prepared
            },
            async ({ page, step, check }, { patientName, patientId }) => {
              await openDay(page)
              const event = okadaEvent(page, title)
              await event.scrollIntoViewIfNeeded()
              await step(
                `予定のカレンダーを日の表示で開いている。Google カレンダーで作った「${title}」は、利用者が見つからず確認が必要な予定である。利用者の ${patientName} を API で登録してある`,
              )

              await step('予定を押して詳細を開く')
              await event.click()
              await expect(page.getByTestId('schedule-detail-review-reason')).toBeVisible()
              await check('詳細に、確認が必要な理由と直し方が出る')

              if (isBefore) {
                await step('「編集」を押す')
                await page.getByTestId('schedule-detail-edit').click()
                await expect(page.getByTestId('schedule-edit-submit')).toBeVisible()
                await expect(page.getByTestId('schedule-kind-tab')).toHaveCount(0)
                await check(
                  '編集は通常の予定のフォームだけで、予定の種類を選べず、利用者を入れられない',
                )
                return
              }

              await step(
                `「編集」を押し、予定の種類で「訪問」を選び、利用者に ${patientName} を選んで保存する`,
              )
              await addVisitInfo(page, patientId)
              const detail = page.getByTestId('schedule-detail-modal')
              await expect(detail).toContainText(patientName)
              await expect(page.getByTestId('schedule-detail-review-reason')).toHaveCount(0)
              await check('保存すると予定の詳細に戻り、利用者が出て、確認が必要な理由が出ない')

              await step('予定の詳細を閉じる')
              await page.getByTestId('schedule-detail-close').click()
              await expect(detail).toBeHidden()
              const visit = okadaEvent(page, patientName)
              await expect(visit).toBeVisible()
              await expect(okadaEvent(page, title)).toHaveCount(0)
              await visit.scrollIntoViewIfNeeded()
              await check(`日の表示の ${OKADA.staff.name} の列に、${patientName} の訪問として出る`)
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

      test(`${label}確認が必要な予定に訪問の情報を入れて保存した場合、calendarpit の予定のタイトルが訪問の情報に合わせて書き直されていること`, async ({
        browser,
        request,
      }) => {
        test.skip(isBefore, '改修前は訪問の情報を入れられないので、タイトルを書き直す操作が無い')
        const title = unknownTitle('三郎')
        let prepared: Awaited<ReturnType<typeof prepareNeedsReview>> | undefined
        try {
          await recordPrEvidence(
            browser,
            {
              name: 'google-primary-visit-info-title',
              title:
                '確認が必要な Google カレンダーの予定に訪問の情報を足すと、calendarpit のタイトルが訪問の情報に合わせて書き直される',
              actor: ACTOR,
              variant,
            },
            async (page) => {
              prepared = await prepareNeedsReview(page, title, '16:00', '16:29')
              return prepared
            },
            async ({ page, step, check }, { patientName, patientId }) => {
              const date = todayInTokyo()
              const calendarpit = `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(OKADA.calendarId)}&date=${date}`
              await page.goto(calendarpit)
              await expect(calendarpitEvent(page, title)).toBeVisible()
              await step(
                `Google カレンダーの代わりの calendarpit の管理の画面で、${OKADA.calendarId} の ${date} を開いている。「${title}」がある`,
              )

              await step(
                `予定のカレンダーで「${title}」の詳細から「編集」を押し、「訪問」を選び、利用者に ${patientName} を選んで保存する`,
              )
              await openDay(page)
              await okadaEvent(page, title).click()
              await addVisitInfo(page, patientId)
              await expect(okadaEvent(page, patientName)).toBeVisible()

              await step(`calendarpit の管理の画面で、${OKADA.calendarId} の ${date} を開き直す`)
              // サービスコードは、利用者を選んだときに選ぶ利用者のサービスコードになる
              const summary = (await findOkadaGoogleEvent(request, patientName))?.summary ?? ''
              expect(summary).toMatch(new RegExp(`^【.+】${patientName}$`))
              await page.goto(calendarpit)
              await expect(calendarpitEvent(page, summary)).toBeVisible()
              await expect(calendarpitEvent(page, title)).toHaveCount(0)
              await check(
                `タイトルが「【サービス内容】${patientName}」の形の「${summary}」に書き直され、「${title}」が無い`,
              )
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
    }
  })
})
