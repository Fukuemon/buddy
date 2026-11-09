import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import {
  CALENDARPIT_URL,
  HAYASHI,
  LEADER,
  LOGIN_EMAIL,
  LOGIN_STAFF,
  OKADA,
  SCHEDULE_URL,
} from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import {
  createGoogleEvent,
  deleteGoogleEvent,
  listGoogleEvents,
} from '../../fixtures/googleCalendar'
import {
  createNormalSchedule,
  createWeeklyNormalSchedule,
  detailDateTimeText,
} from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'
import { calendarpitEvent } from '../../selectors/calendarpit'
import { scheduleDetailDeleteButton } from '../../selectors/scheduleDetail'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../setup/calendar'

// #882 の受け入れの条件の検証のシナリオ（docs/verification/882-schedule-deletion/scenarios.md）を撮る。
// 字幕の文はシナリオの文を写し、「明日」のような言葉を撮った日付と予定のタイトルに置き換える

const AOKI = `${LOGIN_STAFF.name}（マネージャー）`

/** 今日の Asia/Tokyo の日付から days 日後の日付（YYYY-MM-DD）。 */
const daysFromToday = (days: number) =>
  new Date(Date.now() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

/** 明日以降で最初の月曜の日付から、days 日後の日付（YYYY-MM-DD）。 */
const fromNextMonday = (days: number) => {
  const today = new Date(`${daysFromToday(0)}T00:00:00Z`).getUTCDay()
  return daysFromToday(((8 - today) % 7 || 7) + days)
}

/** 通常の予定の値。時刻を省くと 10:00〜11:00 にする。 */
type Slot = { staffId: string; title: string; date: string; start?: string; end?: string }

/** 青木 陽菜のトークン token で通常の予定を作り、予定の ID を返す。 */
const createSlot = async (request: APIRequestContext, token: string, slot: Slot) => {
  const res = await createNormalSchedule(request, token, STAFF_FORM.facilityId, slot)
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: string }).id
}

/** 予定の API で、予定 scheduleId をキャンセルする（cancelSchedule）。 */
const cancelByApi = async (request: APIRequestContext, token: string, scheduleId: string) => {
  const res = await request.post(`${SCHEDULE_URL}/v1/schedules/${scheduleId}/cancel`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { reason: '利用者の都合' },
  })
  expect(res.status()).toBe(201)
}

/** 録画の外で、web に青木 陽菜でログインしてトークンを取り、setup で前提の予定を作る。 */
const prepareAsAoki =
  <T>(setup: (page: Page, token: string) => Promise<T>) =>
  async (page: Page) => {
    await page.goto('/schedule')
    await signInAtBroker(page, LOGIN_EMAIL)
    const token = await issueAccessToken(page.request, LOGIN_EMAIL)
    return { token, data: await setup(page, token) }
  }

const openDay = async (page: Page, staffId: string, date: string, { cancelled = false } = {}) => {
  await page.goto(`/schedule?view=day&date=${date}${cancelled ? '&cancelled=true' : ''}`)
  await expect(page.getByTestId(`day-grid-staff-${staffId}`)).toBeVisible()
}

/** 日の表示の staffId の職員の列の、title の予定。キャンセルした予定の取り消し線の要素（-cancelled）は数えない。 */
const dayEvent = (page: Page, staffId: string, title: string) =>
  page
    .getByTestId(`day-grid-staff-${staffId}`)
    .getByTestId(/^schedule-event-(?!.*-cancelled$)/)
    .filter({ hasText: title })

/** 日の表示の予定 event を押して、予定の詳細が開くまで待つ。 */
const openDetail = async (page: Page, event: Locator) => {
  await event.scrollIntoViewIfNeeded()
  await event.click()
  await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
}

/** 開いた予定の詳細で「予定を削除」を押し、確認のダイアログで「予定を削除する」を押して、詳細が閉じるまで待つ。 */
const deleteFromDetail = async (page: Page) => {
  await scheduleDetailDeleteButton(page).click()
  await page.getByTestId('schedule-delete-submit').click()
  await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()
}

const openCalendarpit = (page: Page, calendarId: string, date: string) =>
  page.goto(`${CALENDARPIT_URL}/?calendar=${encodeURIComponent(calendarId)}&date=${date}`)

test.describe('予定の詳細', () => {
  test.describe('誤って入れた予定の削除の受け入れ', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const label = variant.label ? `${variant.label}: ` : ''

      test(`${label}明日の単発の予定を詳細から削除した場合、確認の後に日の表示から消え、キャンセルした予定を出しても出ないこと`, async ({
        browser,
      }) => {
        const stamp = Date.now() % 1000
        const deleted = `誤入力の予定 ${stamp}`
        const cancelled = `キャンセルした予定 ${stamp}`
        const date = daysFromToday(1)
        await recordPrEvidence(
          browser,
          { name: 's1-single', title: '単発の予定の削除', actor: AOKI, variant },
          prepareAsAoki(async (page, token) => {
            const deletedId = await createSlot(page.request, token, {
              staffId: LOGIN_STAFF.id,
              title: deleted,
              date,
            })
            const cancelledId = await createSlot(page.request, token, {
              staffId: LOGIN_STAFF.id,
              title: cancelled,
              date,
              start: '11:00',
              end: '12:00',
            })
            await cancelByApi(page.request, token, cancelledId)
            return { deletedId, cancelledId }
          }),
          async ({ page, step, check }, { data }) => {
            await openDay(page, LOGIN_STAFF.id, date)
            const event = page.getByTestId(`schedule-event-${data.deletedId}`)
            await expect(event).toBeVisible()
            await step(
              `前提: ${LOGIN_STAFF.name} の明日（${date}）の 10:00〜11:00 に「${deleted}」があり、11:00〜12:00 の「${cancelled}」をキャンセルしてある`,
            )

            await step(`もし: 「${deleted}」の詳細で「予定を削除」を押す`)
            await openDetail(page, event)
            await scheduleDetailDeleteButton(page).click()
            const dateTime = detailDateTimeText(date, '10:00', '11:00')
            await expect(page.getByTestId('schedule-delete-dialog')).toContainText(
              'この予定を削除しますか',
            )
            await expect(page.getByTestId('schedule-delete-datetime')).toHaveText(dateTime)
            await expect(page.getByTestId('schedule-delete-description')).toContainText(
              '誤って入れた予定を消します',
            )
            await check(
              `ならば: ダイアログに「この予定を削除しますか」、予定の日時（${dateTime}）、誤って入れた予定を消すことの説明が出る`,
            )

            await step('もし: 「予定を削除する」を押す')
            await page.getByTestId('schedule-delete-submit').click()
            await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()
            await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
            await expect(event).toHaveCount(0)
            await check(`ならば: 詳細が閉じ、明日の日の表示から「${deleted}」が消える`)

            await step('もし: 左のサイドバーの「キャンセルした予定を出す」を入れる')
            await page.getByTestId('calendar-show-cancelled').check()
            const cancelledEvent = page.getByTestId(`schedule-event-${data.cancelledId}-cancelled`)
            await expect(cancelledEvent).toBeVisible()
            await expect(dayEvent(page, LOGIN_STAFF.id, deleted)).toHaveCount(0)
            await expect(
              page.getByTestId(`schedule-event-${data.deletedId}-cancelled`),
            ).toHaveCount(0)
            await cancelledEvent.scrollIntoViewIfNeeded()
            await check(
              `ならば: キャンセルした「${cancelled}」は取り消し線で出て、削除した「${deleted}」は出ない`,
            )
          },
        )
      })

      test(`${label}毎週の繰り返しの予定の 2 回目の回を詳細から削除した場合、その回だけが消え、キャンセルした予定を出しても出ず、1 回目と 3 回目は残ること`, async ({
        browser,
      }) => {
        const title = `誤入力の定例 ${Date.now() % 1000}`
        const [first, second, third] = [fromNextMonday(0), fromNextMonday(7), fromNextMonday(14)]
        await recordPrEvidence(
          browser,
          { name: 's2-occurrence', title: '繰り返しの予定の回の削除', actor: AOKI, variant },
          prepareAsAoki(async (page, token) => {
            const res = await createWeeklyNormalSchedule(
              page.request,
              token,
              STAFF_FORM.facilityId,
              {
                staffId: HAYASHI.id,
                title,
                date: first,
              },
            )
            expect(res.status()).toBe(201)
          }),
          async ({ page, step, check }) => {
            await openDay(page, HAYASHI.id, second)
            const event = dayEvent(page, HAYASHI.id, title)
            await expect(event).toBeVisible()
            await step(
              `前提: ${HAYASHI.name} に、${first} から毎週月曜 10:00〜11:00 の「${title}」がある。2 回目の ${second} の日の表示を開いている`,
            )

            await step('もし: 2 回目の回の詳細で「予定を削除」を押す')
            await openDetail(page, event)
            await scheduleDetailDeleteButton(page).click()
            await expect(page.getByTestId('schedule-delete-description')).toContainText(
              '繰り返しの予定のうち、この日の回だけを消します。ほかの回は残ります。',
            )
            await check(
              'ならば: ダイアログの説明に「繰り返しの予定のうち、この日の回だけを消します。ほかの回は残ります。」が出る',
            )

            await step('もし: 「予定を削除する」を押す')
            await page.getByTestId('schedule-delete-submit').click()
            await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()
            await page.getByTestId('calendar-show-cancelled').check()
            await expect(page.getByTestId(`day-grid-staff-${HAYASHI.id}`)).toBeVisible()
            await expect(
              page
                .getByTestId(`day-grid-staff-${HAYASHI.id}`)
                .getByTestId(/^schedule-event-/)
                .filter({ hasText: title }),
            ).toHaveCount(0)
            await check(
              `ならば: 「キャンセルした予定を出す」を入れた 2 回目の ${second} の日の表示に「${title}」が出ない`,
            )

            for (const [date, nth] of [
              [first, '1 回目'],
              [third, '3 回目'],
            ] as const) {
              await step(`${nth}の ${date} の日の表示を開く`)
              await openDay(page, HAYASHI.id, date)
              await event.scrollIntoViewIfNeeded()
              await expect(event).toBeVisible()
              await check(`かつ: ${nth}の ${date} の日の表示には「${title}」が出る`)
            }
          },
        )
      })

      test(`${label}自分の予定だけを編集できる職員が、昨日の予定、キャンセルした予定、ほかの職員の予定、明日の自分の予定の詳細を順に開いた場合、明日の自分の予定にだけ「予定を削除」が出ること`, async ({
        browser,
      }) => {
        const stamp = Date.now() % 1000
        const past = `昨日の予定 ${stamp}`
        const cancelled = `キャンセルした予定 ${stamp}`
        const others = `森の予定 ${stamp}`
        const own = `林の予定 ${stamp}`
        const [yesterday, tomorrow] = [daysFromToday(-1), daysFromToday(1)]
        await recordPrEvidence(
          browser,
          {
            name: 's3-hidden',
            title: '削除できない予定',
            actor: `${HAYASHI.name}（メンバー、自分の予定の編集と、${LEADER.staff.name}の予定の閲覧の権限あり）`,
            variant,
          },
          async (page) => {
            // 林のログインの cookie を持つ前に、別の context で青木のトークンを取り、予定を作る
            const context = await browser.newContext({ ignoreHTTPSErrors: true })
            const data = await (async () => {
              try {
                const request = context.request
                const token = await issueAccessToken(request, LOGIN_EMAIL)
                const cancelledId = await createSlot(request, token, {
                  staffId: HAYASHI.id,
                  title: cancelled,
                  date: tomorrow,
                  start: '09:00',
                  end: '10:00',
                })
                await cancelByApi(request, token, cancelledId)
                return {
                  pastId: await createSlot(request, token, {
                    staffId: HAYASHI.id,
                    title: past,
                    date: yesterday,
                  }),
                  cancelledId,
                  othersId: await createSlot(request, token, {
                    staffId: LEADER.staff.id,
                    title: others,
                    date: tomorrow,
                    start: '13:00',
                    end: '14:00',
                  }),
                  ownId: await createSlot(request, token, {
                    staffId: HAYASHI.id,
                    title: own,
                    date: tomorrow,
                    start: '14:00',
                    end: '15:00',
                  }),
                }
              } finally {
                await context.close()
              }
            })()
            await page.goto('/schedule')
            await signInAtBroker(page, HAYASHI.email)
            return data
          },
          async ({ page, step, check }, data) => {
            const close = page.getByTestId('schedule-detail-close')
            await openDay(page, HAYASHI.id, yesterday)
            const pastEvent = page.getByTestId(`schedule-event-${data.pastId}`)
            await expect(pastEvent).toBeVisible()
            await step(
              `前提: ${HAYASHI.name} の昨日（${yesterday}）の「${past}」、明日（${tomorrow}）のキャンセルした「${cancelled}」、${LEADER.staff.name} の明日の「${others}」、${HAYASHI.name} の明日の「${own}」がある`,
            )

            await step(`もし: 昨日の自分の「${past}」の詳細を開く`)
            await openDetail(page, pastEvent)
            await expect(page.getByTestId('schedule-detail-cancel-schedule')).toBeVisible()
            await expect(page.getByTestId('schedule-detail-edit')).toBeVisible()
            await expect(scheduleDetailDeleteButton(page)).toHaveCount(0)
            await check('ならば: 「予定をキャンセル」と「編集」は出て、「予定を削除」は出ない')

            await step(`もし: 明日の自分のキャンセルした「${cancelled}」の詳細を開く`)
            await close.click()
            await openDay(page, HAYASHI.id, tomorrow, { cancelled: true })
            await openDetail(page, page.getByTestId(`schedule-event-${data.cancelledId}`))
            await expect(page.getByTestId('schedule-detail-cancel')).toBeVisible()
            await expect(scheduleDetailDeleteButton(page)).toHaveCount(0)
            await check('ならば: キャンセルした予定には「予定を削除」が出ない')

            await step(`もし: 明日の ${LEADER.staff.name} の「${others}」の詳細を開く`)
            await page.getByTestId('schedule-detail-modal').getByTestId('modal-close').click()
            await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()
            await openDetail(page, page.getByTestId(`schedule-event-${data.othersId}`))
            await expect(close).toBeVisible()
            await expect(page.getByTestId('schedule-detail-cancel-schedule')).toHaveCount(0)
            await expect(page.getByTestId('schedule-detail-edit')).toHaveCount(0)
            await expect(scheduleDetailDeleteButton(page)).toHaveCount(0)
            await check('ならば: 「閉じる」だけが出て、「予定を削除」は出ない')

            await step(`もし: 明日の自分の「${own}」の詳細を開く`)
            await close.click()
            await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()
            await openDetail(page, page.getByTestId(`schedule-event-${data.ownId}`))
            await expect(scheduleDetailDeleteButton(page)).toBeVisible()
            await check('ならば: 明日の自分の予定には「予定を削除」が出る')
          },
        )
      })

      test(`${label}Google カレンダーで管理する事業所の職員が明日の予定の詳細を開いた場合、「予定を削除」が出ず、「予定をキャンセル」で取り消すと Google カレンダーからも消えること`, async ({
        browser,
        request,
      }) => {
        const title = `担当者会議 ${Date.now() % 1000}`
        const date = daysFromToday(1)
        await recordPrEvidence(
          browser,
          {
            name: 's4-google-primary',
            title: 'Google カレンダーで管理する事業所',
            actor: `${OKADA.staff.name}（Google カレンダーを正本にする事業所のマネージャー）`,
            variant,
          },
          async (page) => {
            await page.goto('/schedule')
            await signInAtBroker(page, OKADA.email)
            const { id } = await createGoogleEvent(page.request, OKADA.calendarId, {
              summary: title,
              date,
              start: '13:00',
              end: '14:00',
            })
            await openDay(page, OKADA.staff.id, date)
            await expect(async () => {
              await page.reload()
              await expect(dayEvent(page, OKADA.staff.id, title)).toBeVisible()
            }).toPass()
            return id
          },
          async ({ page, step, check }, eventId) => {
            try {
              await openDay(page, OKADA.staff.id, date)
              const event = dayEvent(page, OKADA.staff.id, title)
              await expect(event).toBeVisible()
              await step(
                `前提: ${OKADA.staff.name} の Google カレンダー（calendarpit）の明日（${date}）の 13:00〜14:00 に「${title}」があり、予定のカレンダーに出ている`,
              )

              await step('もし: 予定の詳細を開く')
              await openDetail(page, event)
              await expect(page.getByTestId('schedule-detail-google-calendar')).toBeVisible()
              await expect(page.getByTestId('schedule-detail-cancel-schedule')).toBeVisible()
              await expect(page.getByTestId('schedule-detail-edit')).toBeVisible()
              await expect(scheduleDetailDeleteButton(page)).toHaveCount(0)
              await check('ならば: 「予定をキャンセル」と「編集」は出て、「予定を削除」は出ない')

              await step('もし: 理由に「会議の中止」を入れて「予定をキャンセル」で取り消す')
              await page.getByTestId('schedule-detail-cancel-schedule').click()
              const dialog = page.getByTestId('schedule-cancel-dialog')
              await dialog.getByTestId('schedule-cancel-reason').fill('会議の中止')
              await dialog.getByTestId('schedule-cancel-submit').click()
              await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()
              await expect(dayEvent(page, OKADA.staff.id, title)).toHaveCount(0)
              await check(
                `ならば: 明日の日の表示の ${OKADA.staff.name} の列から「${title}」が消える`,
              )

              await step(`calendarpit の管理の画面で、${OKADA.calendarId} の ${date} を開く`)
              await openCalendarpit(page, OKADA.calendarId, date)
              await expect(calendarpitEvent(page, title)).toHaveCount(0)
              await check(`かつ: Google カレンダー（calendarpit）からも「${title}」が消える`)
            } finally {
              const left = (await listGoogleEvents(request, OKADA.calendarId)).some(
                (e) => e.summary === title,
              )
              if (left) await deleteGoogleEvent(request, OKADA.calendarId, eventId)
            }
          },
        )
      })

      test(`${label}Google カレンダーを結び付けた職員の、書き出した予定を詳細から削除した場合、予定のカレンダーと Google カレンダーから消えること`, async ({
        browser,
        request,
      }) => {
        const title = `書き出した予定 ${Date.now() % 1000}`
        const date = daysFromToday(1)
        const exported = async () =>
          (await listGoogleEvents(request, HAYASHI.calendarId)).some((e) => e.summary === title)
        await recordPrEvidence(
          browser,
          {
            name: 's5-export',
            title: 'Google カレンダーに書き出した予定の削除',
            actor: AOKI,
            variant,
          },
          prepareAsAoki(async (page, token) => {
            await linkStaffCalendar(page, HAYASHI.id)
            const id = await createSlot(page.request, token, {
              staffId: HAYASHI.id,
              title,
              date,
              start: '14:00',
              end: '15:00',
            })
            await expect.poll(exported).toBe(true)
            return id
          }),
          async ({ page, step, check }, { data: scheduleId }) => {
            try {
              await openCalendarpit(page, HAYASHI.calendarId, date)
              await expect(calendarpitEvent(page, title)).toBeVisible()
              await step(
                `前提: ${HAYASHI.name} に Google カレンダーを結び付けてあり、明日（${date}）の 14:00〜15:00 の「${title}」が calendarpit に書き出されている`,
              )
              await check(`calendarpit の ${HAYASHI.calendarId} の ${date} に「${title}」がある`)

              await step(`もし: 予定のカレンダーで「${title}」の詳細の「予定を削除」から削除する`)
              await openDay(page, HAYASHI.id, date)
              await openDetail(page, page.getByTestId(`schedule-event-${scheduleId}`))
              await deleteFromDetail(page)
              await expect(dayEvent(page, HAYASHI.id, title)).toHaveCount(0)
              await check(`ならば: 明日の日の表示の ${HAYASHI.name} の列から「${title}」が消える`)

              await step(`calendarpit の管理の画面で、${HAYASHI.calendarId} の ${date} を開く`)
              await expect.poll(exported).toBe(false)
              await openCalendarpit(page, HAYASHI.calendarId, date)
              await expect(calendarpitEvent(page, title)).toHaveCount(0)
              await check(
                `かつ: ${HAYASHI.name} の Google カレンダー（calendarpit）からも「${title}」が消える`,
              )
            } finally {
              await step('（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）')
              await unlinkStaffCalendar(page, HAYASHI.id)
            }
          },
        )
      })
    }
  })
})
