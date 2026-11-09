import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { HAYASHI, LEADER, LOGIN_EMAIL, LOGIN_STAFF, OKADA, SCHEDULE_URL } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { createGoogleEvent } from '../../fixtures/googleCalendar'
import {
  createNormalSchedule,
  createWeeklyNormalSchedule,
  detailDateTimeText,
} from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { signInAtBroker } from '../../screens/login'
import { scheduleDetailDeleteButton, scheduleDetailError } from '../../selectors/scheduleDetail'

/** 今日の Asia/Tokyo の日付から days 日後の日付（YYYY-MM-DD）。 */
const daysFromToday = (days: number) =>
  new Date(Date.now() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

/** 明日以降で最初の月曜の日付から、days 日後の日付（YYYY-MM-DD）。 */
const fromNextMonday = (days: number) => {
  const today = new Date(`${daysFromToday(0)}T00:00:00Z`).getUTCDay()
  return daysFromToday(((8 - today) % 7 || 7) + days)
}

const ACTOR = `${LOGIN_STAFF.name}（マネージャー）`

/** 削除の確認のダイアログの、単発の予定の説明。 */
const SINGLE_DESCRIPTION =
  '誤って入れた予定を消します。削除した予定はカレンダーに出ず、元に戻せません。予定を取りやめたときは、削除せずにキャンセルしてください。'

/** 削除の確認のダイアログの、繰り返しの予定の回の説明の書き出し。 */
const OCCURRENCE_DESCRIPTION =
  '繰り返しの予定のうち、この日の回だけを消します。ほかの回は残ります。'

/** 削除を予定の API に 409 で拒まれたときに、ダイアログに出す文。 */
const CONFLICT_MESSAGE =
  '予定がキャンセルか変更されていたので、削除できませんでした。予定を開き直してください。'

/** 通常の予定の値。時刻を省くと 10:00〜11:00 にする。 */
type Slot = { staffId: string; title: string; date: string; start?: string; end?: string }

/** 青木 陽菜のトークン token で通常の予定を作り、予定の ID を返す。青木はマネージャーで、事業所のどの職員の予定も作れる。 */
const createSlot = async (request: APIRequestContext, token: string, slot: Slot) => {
  const res = await createNormalSchedule(request, token, STAFF_FORM.facilityId, slot)
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: string }).id
}

/** 青木 陽菜のトークン token で、毎週の通常の予定を作る。 */
const createWeekly = async (request: APIRequestContext, token: string, slot: Slot) => {
  const res = await createWeeklyNormalSchedule(request, token, STAFF_FORM.facilityId, slot)
  expect(res.status()).toBe(201)
}

/** 予定の API で、予定 scheduleId をキャンセルする（cancelSchedule）。 */
const cancelByApi = async (request: APIRequestContext, token: string, scheduleId: string) => {
  const res = await request.post(`${SCHEDULE_URL}/v1/schedules/${scheduleId}/cancel`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { reason: '利用者の都合' },
  })
  expect(res.status()).toBe(201)
}

/**
 * 録画の外で、web に青木 陽菜でログインし、青木のトークンを取ってから、setup で前提の予定を作る。
 * ブローカーはメールごとにログインの試行の回数を制限するので、ログインとトークンの発行を 1 回ずつにする。
 */
const prepareAsAoki =
  <T>(setup: (request: APIRequestContext, token: string) => Promise<T>) =>
  async (page: Page) => {
    await page.goto('/schedule')
    await signInAtBroker(page, LOGIN_EMAIL)
    const token = await issueAccessToken(page.request, LOGIN_EMAIL)
    return { token, data: await setup(page.request, token) }
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

/** a が b より左にあるか。並びの順は要素の状態で表せないので、位置を読んで比べる。 */
const isLeftOf = async (a: Locator, b: Locator) => {
  const [left, right] = await Promise.all([a.boundingBox(), b.boundingBox()])
  return left !== null && right !== null && left.x + left.width <= right.x
}

test.describe('予定の詳細', () => {
  test.describe('予定の削除', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      const isBefore = variant.name === 'before'

      test(`${prefix}青木 陽菜が自分の今日の予定の詳細で「予定を削除」から削除した場合、確認の後に今日の日の表示から予定が消えること`, async ({
        browser,
      }) => {
        const title = `今日の誤入力の予定 ${Date.now()}`
        const today = daysFromToday(0)
        await recordPrEvidence(
          browser,
          { name: 'detail-delete-today', title: '今日の予定を削除する', actor: ACTOR, variant },
          prepareAsAoki((request, token) =>
            createSlot(request, token, { staffId: LOGIN_STAFF.id, title, date: today }),
          ),
          async ({ page, step, check }, { data: scheduleId }) => {
            await openDay(page, LOGIN_STAFF.id, today)
            const event = page.getByTestId(`schedule-event-${scheduleId}`)
            await expect(event).toBeVisible()
            await step(
              `${LOGIN_STAFF.name} の今日（${today}）の 10:00〜11:00 に、通常の予定「${title}」を API で作ってある。今日の日の表示を開いている`,
            )

            await step('予定を押して詳細を開く')
            await openDetail(page, event)
            const cancel = page.getByTestId('schedule-detail-cancel-schedule')
            await expect(cancel).toBeVisible()
            const remove = scheduleDetailDeleteButton(page)
            if (isBefore) {
              await expect(page.getByTestId('schedule-detail-edit')).toBeVisible()
              await expect(remove).toHaveCount(0)
              await check(
                '下端の左には「予定をキャンセル」だけが出て、「予定を削除」のボタンが無い',
              )
              return
            }
            await expect(remove).toBeVisible()
            expect(await isLeftOf(cancel, remove)).toBe(true)
            expect(await isLeftOf(remove, page.getByTestId('schedule-detail-close'))).toBe(true)
            await check('下端の左の「予定をキャンセル」の右に「予定を削除」が出る')

            await step('「予定を削除」を押す')
            await remove.click()
            const dateTime = detailDateTimeText(today, '10:00', '11:00')
            await expect(page.getByTestId('schedule-delete-dialog')).toContainText(
              'この予定を削除しますか',
            )
            await expect(page.getByTestId('schedule-delete-datetime')).toHaveText(dateTime)
            await expect(page.getByTestId('schedule-delete-description')).toHaveText(
              SINGLE_DESCRIPTION,
            )
            await expect(page.getByTestId('schedule-delete-cancel')).toHaveText('戻る')
            await expect(page.getByTestId('schedule-delete-submit')).toHaveText('予定を削除する')
            await check(
              `ダイアログに「この予定を削除しますか」、予定の日時（${dateTime}）、「誤って入れた予定を消します。…」の説明、「戻る」と「予定を削除する」が出る`,
            )

            await step('「予定を削除する」を押す')
            await page.getByTestId('schedule-delete-submit').click()
            await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()
            await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
            await expect(event).toHaveCount(0)
            await check(
              `詳細が閉じ、今日の日の表示の ${LOGIN_STAFF.name} の列から「${title}」が消える`,
            )
          },
        )
      })
    }

    // 改修前は「予定を削除」が無く、削除の操作ができないので、ほかの観点は改修後だけを撮る
    for (const variant of EVIDENCE_VARIANTS.filter(({ name }) => name !== 'before')) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}削除の確認のダイアログで「戻る」を押した場合、詳細に「予定を削除」が残り、閉じた後も予定が出ること`, async ({
        browser,
      }) => {
        const title = `残す予定 ${Date.now()}`
        const date = daysFromToday(1)
        await recordPrEvidence(
          browser,
          { name: 'detail-delete-back', title: '確認でやめる', actor: ACTOR, variant },
          prepareAsAoki((request, token) =>
            createSlot(request, token, {
              staffId: LOGIN_STAFF.id,
              title,
              date,
              start: '09:00',
              end: '10:00',
            }),
          ),
          async ({ page, step, check }, { data: scheduleId }) => {
            await openDay(page, LOGIN_STAFF.id, date)
            const event = page.getByTestId(`schedule-event-${scheduleId}`)
            await expect(event).toBeVisible()
            await step(
              `${LOGIN_STAFF.name} の明日（${date}）の 09:00〜10:00 に「${title}」を API で作ってある。明日の日の表示を開いている`,
            )

            await step('予定を押して詳細を開き、「予定を削除」を押す')
            await openDetail(page, event)
            await scheduleDetailDeleteButton(page).click()
            await expect(page.getByTestId('schedule-delete-dialog')).toBeVisible()

            await step('削除の確認のダイアログで「戻る」を押す')
            await page.getByTestId('schedule-delete-cancel').click()
            await expect(page.getByTestId('schedule-delete-dialog')).toBeHidden()
            await expect(page.getByTestId('schedule-detail-modal')).toBeVisible()
            await expect(scheduleDetailDeleteButton(page)).toBeVisible()
            await check('ダイアログが閉じ、詳細の下端に「予定を削除」が出たまま残る')

            await step('詳細の「閉じる」を押す')
            await page.getByTestId('schedule-detail-close').click()
            await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()
            await event.scrollIntoViewIfNeeded()
            await expect(event).toBeVisible()
            await check(`閉じた後の明日の日の表示に「${title}」が出る`)
          },
        )
      })

      test(`${prefix}予定を削除した後にキャンセルした予定を出した場合、同じ日のキャンセルした予定は出て、削除した予定は出ないこと`, async ({
        browser,
      }) => {
        const cancelled = `キャンセルした予定 ${Date.now()}`
        const deleted = `削除する予定 ${Date.now()}`
        const date = daysFromToday(2)
        await recordPrEvidence(
          browser,
          {
            name: 'detail-delete-hidden-cancelled',
            title: '削除した予定はキャンセルした予定を出しても出ない',
            actor: ACTOR,
            variant,
          },
          prepareAsAoki(async (request, token) => {
            const cancelledId = await createSlot(request, token, {
              staffId: LOGIN_STAFF.id,
              title: cancelled,
              date,
            })
            await cancelByApi(request, token, cancelledId)
            const deletedId = await createSlot(request, token, {
              staffId: LOGIN_STAFF.id,
              title: deleted,
              date,
              start: '11:00',
              end: '12:00',
            })
            return { cancelledId, deletedId }
          }),
          async ({ page, step, check }, { data }) => {
            await openDay(page, LOGIN_STAFF.id, date)
            const event = page.getByTestId(`schedule-event-${data.deletedId}`)
            await expect(event).toBeVisible()
            await step(
              `${date} に、10:00〜11:00 の「${cancelled}」と 11:00〜12:00 の「${deleted}」を API で作り、「${cancelled}」をキャンセルしてある`,
            )

            await step(`「${deleted}」の詳細を開き、「予定を削除」から削除する`)
            await openDetail(page, event)
            await scheduleDetailDeleteButton(page).click()
            await page.getByTestId('schedule-delete-submit').click()
            await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()

            await step('左のサイドバーの「キャンセルした予定を出す」を入れる')
            await page.getByTestId('calendar-show-cancelled').check()
            const cancelledEvent = page.getByTestId(`schedule-event-${data.cancelledId}-cancelled`)
            await expect(cancelledEvent).toBeVisible()
            await expect(event).toHaveCount(0)
            await cancelledEvent.scrollIntoViewIfNeeded()
            await check(
              `キャンセルした「${cancelled}」は取り消し線で出て、削除した「${deleted}」は出ない`,
            )
          },
        )
      })

      test(`${prefix}毎週の繰り返しの予定の 2 回目を詳細から削除した場合、その回だけが消え、1 回目と 3 回目は残ること`, async ({
        browser,
      }) => {
        const title = `回を削除する定例 ${Date.now()}`
        const [first, second, third] = [fromNextMonday(0), fromNextMonday(7), fromNextMonday(14)]
        await recordPrEvidence(
          browser,
          {
            name: 'detail-delete-occurrence',
            title: '繰り返しの予定の回を削除する',
            actor: ACTOR,
            variant,
          },
          prepareAsAoki((request, token) =>
            createWeekly(request, token, { staffId: LOGIN_STAFF.id, title, date: first }),
          ),
          async ({ page, step, check }) => {
            await openDay(page, LOGIN_STAFF.id, second)
            const event = dayEvent(page, LOGIN_STAFF.id, title)
            await expect(event).toBeVisible()
            await step(
              `${first} から毎週月曜 10:00〜11:00 の「${title}」を API で作ってある。2 回目の ${second} の日の表示を開いている`,
            )

            await step('2 回目の回を押して詳細を開き、「予定を削除」を押す')
            await openDetail(page, event)
            await scheduleDetailDeleteButton(page).click()
            await expect(page.getByTestId('schedule-delete-description')).toContainText(
              OCCURRENCE_DESCRIPTION,
            )
            await check(`ダイアログの説明が「${OCCURRENCE_DESCRIPTION}…」になる`)

            await step('「予定を削除する」を押す')
            await page.getByTestId('schedule-delete-submit').click()
            await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()
            await expect(page.getByTestId(`day-grid-staff-${LOGIN_STAFF.id}`)).toBeVisible()
            await expect(event).toHaveCount(0)
            await check(`2 回目の ${second} の日の表示に「${title}」が出ない`)

            await step(`1 回目の ${first} の日の表示を開く`)
            await openDay(page, LOGIN_STAFF.id, first)
            await event.scrollIntoViewIfNeeded()
            await expect(event).toBeVisible()
            await check(`1 回目の ${first} の日の表示には「${title}」が出る`)

            await step(`3 回目の ${third} の日の表示を開く`)
            await openDay(page, LOGIN_STAFF.id, third)
            await event.scrollIntoViewIfNeeded()
            await expect(event).toBeVisible()
            await check(`3 回目の ${third} の日の表示には「${title}」が出る`)
          },
        )
      })

      test(`${prefix}今日より前の自分の予定の詳細を開いた場合、「予定を削除」が出ず、今日の予定には出ること`, async ({
        browser,
      }) => {
        const past = `昨日の予定 ${Date.now()}`
        const current = `今日の予定 ${Date.now()}`
        const [yesterday, today] = [daysFromToday(-1), daysFromToday(0)]
        await recordPrEvidence(
          browser,
          {
            name: 'detail-delete-hidden-past',
            title: '今日より前の予定には削除が出ない',
            actor: ACTOR,
            variant,
          },
          prepareAsAoki(async (request, token) => ({
            pastId: await createSlot(request, token, {
              staffId: LOGIN_STAFF.id,
              title: past,
              date: yesterday,
            }),
            currentId: await createSlot(request, token, {
              staffId: LOGIN_STAFF.id,
              title: current,
              date: today,
              start: '12:00',
              end: '13:00',
            }),
          })),
          async ({ page, step, check }, { data }) => {
            await openDay(page, LOGIN_STAFF.id, yesterday)
            const pastEvent = page.getByTestId(`schedule-event-${data.pastId}`)
            await expect(pastEvent).toBeVisible()
            await step(
              `${LOGIN_STAFF.name} の昨日（${yesterday}）の 10:00〜11:00 に「${past}」、今日（${today}）の 12:00〜13:00 に「${current}」を API で作ってある。昨日の日の表示を開いている`,
            )

            await step(`昨日の「${past}」を押して詳細を開く`)
            await openDetail(page, pastEvent)
            await expect(page.getByTestId('schedule-detail-cancel-schedule')).toBeVisible()
            await expect(page.getByTestId('schedule-detail-edit')).toBeVisible()
            await expect(scheduleDetailDeleteButton(page)).toHaveCount(0)
            await check(
              '昨日の予定は「予定をキャンセル」と「編集」だけが出て、「予定を削除」が出ない',
            )

            await step(`詳細を閉じ、今日の日の表示で「${current}」を押して詳細を開く`)
            await page.getByTestId('schedule-detail-close').click()
            await openDay(page, LOGIN_STAFF.id, today)
            await openDetail(page, page.getByTestId(`schedule-event-${data.currentId}`))
            await expect(scheduleDetailDeleteButton(page)).toBeVisible()
            await check('今日の予定には「予定を削除」が出る')
          },
        )
      })

      test(`${prefix}キャンセルした予定とキャンセルしていない予定の詳細を順に開いた場合、キャンセルした予定にだけ「予定を削除」が出ないこと`, async ({
        browser,
      }) => {
        const cancelled = `キャンセルした予定 ${Date.now()}`
        const active = `キャンセルしていない予定 ${Date.now()}`
        const date = daysFromToday(1)
        await recordPrEvidence(
          browser,
          {
            name: 'detail-delete-hidden-cancelled-schedule',
            title: 'キャンセルした予定には削除が出ない',
            actor: ACTOR,
            variant,
          },
          prepareAsAoki(async (request, token) => {
            const cancelledId = await createSlot(request, token, {
              staffId: LOGIN_STAFF.id,
              title: cancelled,
              date,
              start: '11:00',
              end: '12:00',
            })
            await cancelByApi(request, token, cancelledId)
            const activeId = await createSlot(request, token, {
              staffId: LOGIN_STAFF.id,
              title: active,
              date,
              start: '12:00',
              end: '13:00',
            })
            return { cancelledId, activeId }
          }),
          async ({ page, step, check }, { data }) => {
            await openDay(page, LOGIN_STAFF.id, date, { cancelled: true })
            const cancelledEvent = page.getByTestId(`schedule-event-${data.cancelledId}`)
            await expect(cancelledEvent).toBeVisible()
            await step(
              `明日（${date}）の 11:00〜12:00 に「${cancelled}」、12:00〜13:00 に「${active}」を API で作り、前者をキャンセルしてある。キャンセルした予定を出した明日の日の表示を開いている`,
            )

            await step(`キャンセルした「${cancelled}」を押して詳細を開く`)
            await openDetail(page, cancelledEvent)
            const modal = page.getByTestId('schedule-detail-modal')
            await expect(page.getByTestId('schedule-detail-cancel')).toBeVisible()
            await expect(page.getByTestId('schedule-detail-close')).toHaveCount(0)
            await expect(scheduleDetailDeleteButton(page)).toHaveCount(0)
            await check('キャンセルした予定は下端が無く、「予定を削除」が出ない')

            await step(`右上の × で閉じ、キャンセルしていない「${active}」を押して詳細を開く`)
            await modal.getByTestId('modal-close').click()
            await expect(modal).toBeHidden()
            await openDetail(page, page.getByTestId(`schedule-event-${data.activeId}`))
            await expect(scheduleDetailDeleteButton(page)).toBeVisible()
            await check('キャンセルしていない予定には「予定を削除」が出る')
          },
        )
      })

      test(`${prefix}Google カレンダーで管理する事業所の職員が明日の予定の詳細を開いた場合、「予定をキャンセル」と「編集」は出て「予定を削除」は出ないこと`, async ({
        browser,
      }) => {
        const title = `担当者会議 ${Date.now()}`
        const date = daysFromToday(1)
        await recordPrEvidence(
          browser,
          {
            name: 'detail-delete-hidden-google',
            title: 'Google カレンダーで管理する事業所の予定には削除が出ない',
            actor: `${OKADA.staff.name}（Google カレンダーを正本にする事業所のマネージャー）`,
            variant,
          },
          prepareOkada(title, date, '13:00', '14:00'),
          async ({ page, step, check }) => {
            await openDay(page, OKADA.staff.id, date)
            const event = dayEvent(page, OKADA.staff.id, title)
            await expect(event).toBeVisible()
            await step(
              `${OKADA.staff.name}（google_primary の事業所）で入っている。calendarpit に作った明日（${date}）の 13:00〜14:00 の「${title}」が、同期の後に明日の日の表示に出ている`,
            )

            await step('予定を押して詳細を開く')
            await openDetail(page, event)
            await expect(page.getByTestId('schedule-detail-google-calendar')).toBeVisible()
            await expect(page.getByTestId('schedule-detail-cancel-schedule')).toBeVisible()
            await expect(page.getByTestId('schedule-detail-edit')).toBeVisible()
            await expect(scheduleDetailDeleteButton(page)).toHaveCount(0)
            await check(
              '「予定をキャンセル」と「編集」は出て、「予定を削除」は出ない（出る側の対照は detail-delete-back の動画）',
            )
          },
        )
      })

      test(`${prefix}Google カレンダーで管理する事業所の職員が date の無い予定のカレンダーから明日の予定を押した場合、詳細が開くこと`, async ({
        browser,
      }) => {
        const title = `カンファレンス ${Date.now()}`
        const date = daysFromToday(1)
        await recordPrEvidence(
          browser,
          {
            name: 'detail-google-opens',
            title: 'Google カレンダーで管理する事業所の予定の詳細を開ける',
            actor: `${OKADA.staff.name}（Google カレンダーを正本にする事業所のマネージャー）`,
            variant,
          },
          prepareOkada(title, date, '15:00', '16:00'),
          async ({ page, step, check }) => {
            await page.goto('/schedule?view=week')
            const event = page
              .getByTestId('schedule-calendar')
              .getByTestId(/^schedule-event-/)
              .filter({ hasText: title })
              .first()
            await expect(event).toBeVisible()
            expect(new URL(page.url()).searchParams.has('date')).toBe(false)
            await step(
              `${OKADA.staff.name} で入り、search params に date の無い予定のカレンダー（/schedule?view=week）を開いている。明日（${date}）の 15:00〜16:00 に、calendarpit に作った「${title}」が出ている`,
            )

            await step('明日の予定を押して詳細を開く')
            await event.scrollIntoViewIfNeeded()
            await event.click()
            const dateTime = detailDateTimeText(date, '15:00', '16:00')
            await expect(page.getByTestId('schedule-detail-datetime')).toHaveText(dateTime)
            await expect(page.getByTestId('schedule-detail-google-calendar')).toBeVisible()
            await expect(scheduleDetailError(page)).toHaveCount(0)
            await check(
              `詳細に予定の日時（${dateTime}）と「Google カレンダー」の印が出て、「予定が見つかりません。」は出ない`,
            )
          },
        )
      })

      test(`${prefix}自分の予定だけを編集できる職員がほかの職員の予定と自分の予定の詳細を順に開いた場合、自分の予定にだけ「予定を削除」が出ること`, async ({
        browser,
      }) => {
        const others = `森の予定 ${Date.now()}`
        const own = `林の予定 ${Date.now()}`
        const date = daysFromToday(1)
        await recordPrEvidence(
          browser,
          {
            name: 'detail-delete-hidden-readonly',
            title: '編集の権限が無い予定には削除が出ない',
            actor: `${HAYASHI.name}（メンバー、自分の予定の編集と、${LEADER.staff.name}の予定の閲覧の権限あり）`,
            variant,
          },
          async (page) => {
            // 林のログインの cookie を持つ前に、別の context で青木のトークンを取り、予定を作る
            const context = await browser.newContext({ ignoreHTTPSErrors: true })
            const data = await (async () => {
              try {
                const token = await issueAccessToken(context.request, LOGIN_EMAIL)
                return {
                  othersId: await createSlot(context.request, token, {
                    staffId: LEADER.staff.id,
                    title: others,
                    date,
                    start: '13:00',
                    end: '14:00',
                  }),
                  ownId: await createSlot(context.request, token, {
                    staffId: HAYASHI.id,
                    title: own,
                    date,
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
            await openDay(page, HAYASHI.id, date)
            const othersEvent = page.getByTestId(`schedule-event-${data.othersId}`)
            await expect(othersEvent).toBeVisible()
            await step(
              `${HAYASHI.name} で入り、明日（${date}）の日の表示を開いている。${LEADER.staff.name} の 13:00〜14:00 に「${others}」、${HAYASHI.name} の 14:00〜15:00 に「${own}」を API で作ってある`,
            )

            await step(`ほかの職員（${LEADER.staff.name}）の「${others}」を押して詳細を開く`)
            await openDetail(page, othersEvent)
            await expect(page.getByTestId('schedule-detail-close')).toBeVisible()
            await expect(page.getByTestId('schedule-detail-cancel-schedule')).toHaveCount(0)
            await expect(page.getByTestId('schedule-detail-edit')).toHaveCount(0)
            await expect(scheduleDetailDeleteButton(page)).toHaveCount(0)
            await check('ほかの職員の予定は「閉じる」だけが出る')

            await step(`詳細を閉じ、自分の「${own}」を押して詳細を開く`)
            await page.getByTestId('schedule-detail-close').click()
            await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()
            await openDetail(page, page.getByTestId(`schedule-event-${data.ownId}`))
            await expect(scheduleDetailDeleteButton(page)).toBeVisible()
            await check('自分の予定には「予定を削除」が出る')
          },
        )
      })

      test(`${prefix}削除の確認のダイアログを開いた後に予定がキャンセルされた場合、拒まれた理由がダイアログに出て、開き直すと消えること`, async ({
        browser,
      }) => {
        const title = `拒まれる予定 ${Date.now()}`
        const date = daysFromToday(1)
        await recordPrEvidence(
          browser,
          {
            name: 'detail-delete-failed',
            title: '削除を拒まれたときに理由を出す',
            actor: ACTOR,
            variant,
          },
          prepareAsAoki((request, token) =>
            createSlot(request, token, {
              staffId: LOGIN_STAFF.id,
              title,
              date,
              start: '13:00',
              end: '14:00',
            }),
          ),
          async ({ page, step, check }, { token, data: scheduleId }) => {
            await openDay(page, LOGIN_STAFF.id, date)
            const event = page.getByTestId(`schedule-event-${scheduleId}`)
            await expect(event).toBeVisible()
            await step(
              `${LOGIN_STAFF.name} の明日（${date}）の 13:00〜14:00 に「${title}」を API で作ってある。明日の日の表示を開いている`,
            )

            await step('予定を押して詳細を開き、「予定を削除」を押す')
            await openDetail(page, event)
            await scheduleDetailDeleteButton(page).click()
            await expect(page.getByTestId('schedule-delete-dialog')).toBeVisible()

            await step(
              '（撮影のため、ダイアログを開いた後にほかの職員がキャンセルした代わりに、API で予定をキャンセルする）',
            )
            await cancelByApi(page.request, token, scheduleId)

            await step('「予定を削除する」を押す')
            await page.getByTestId('schedule-delete-submit').click()
            await expect(page.getByTestId('schedule-delete-error')).toHaveText(CONFLICT_MESSAGE)
            await expect(page.getByTestId('schedule-delete-dialog')).toBeVisible()
            await check(`ダイアログが開いたまま「${CONFLICT_MESSAGE}」が出る`)

            await step('「戻る」で閉じ、もう一度「予定を削除」を押す')
            await page.getByTestId('schedule-delete-cancel').click()
            await expect(page.getByTestId('schedule-delete-dialog')).toBeHidden()
            await scheduleDetailDeleteButton(page).click()
            await expect(page.getByTestId('schedule-delete-datetime')).toBeVisible()
            await expect(page.getByTestId('schedule-delete-error')).toHaveCount(0)
            await check('開き直したダイアログには文が出ない')
          },
        )
      })

      test(`${prefix}削除できる予定の詳細で「予定をキャンセル」から理由を入れてキャンセルした場合、キャンセルした予定を出すと予定が出ること`, async ({
        browser,
      }) => {
        const title = `キャンセルする予定 ${Date.now()}`
        const date = daysFromToday(1)
        await recordPrEvidence(
          browser,
          {
            name: 'detail-cancel-still-works',
            title: 'キャンセルは今までどおり動く',
            actor: ACTOR,
            variant,
          },
          prepareAsAoki((request, token) =>
            createSlot(request, token, {
              staffId: LOGIN_STAFF.id,
              title,
              date,
              start: '14:00',
              end: '15:00',
            }),
          ),
          async ({ page, step, check }, { data: scheduleId }) => {
            await openDay(page, LOGIN_STAFF.id, date)
            const event = page.getByTestId(`schedule-event-${scheduleId}`)
            await expect(event).toBeVisible()
            await step(
              `${LOGIN_STAFF.name} の明日（${date}）の 14:00〜15:00 に「${title}」を API で作ってある。明日の日の表示を開いている`,
            )

            await step('予定を押して詳細を開き、「予定をキャンセル」を押す')
            await openDetail(page, event)
            await expect(scheduleDetailDeleteButton(page)).toBeVisible()
            await page.getByTestId('schedule-detail-cancel-schedule').click()
            const dialog = page.getByTestId('schedule-cancel-dialog')
            await expect(dialog).toBeVisible()
            await check('キャンセルのダイアログが開く')

            await step('理由に「利用者の入院」を入れて「予定をキャンセルする」を押す')
            await dialog.getByTestId('schedule-cancel-reason').fill('利用者の入院')
            await dialog.getByTestId('schedule-cancel-submit').click()
            await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()

            await step('左のサイドバーの「キャンセルした予定を出す」を入れる')
            await page.getByTestId('calendar-show-cancelled').check()
            const cancelledEvent = page.getByTestId(`schedule-event-${scheduleId}-cancelled`)
            await expect(cancelledEvent).toBeVisible()
            await cancelledEvent.scrollIntoViewIfNeeded()
            await check(`キャンセルした予定として「${title}」が出る`)
          },
        )
      })

      test(`${prefix}削除できる単発の予定の詳細で「編集」を押した場合、予定の編集のフォームが開くこと`, async ({
        browser,
      }) => {
        const title = `編集する予定 ${Date.now()}`
        const date = daysFromToday(1)
        await recordPrEvidence(
          browser,
          {
            name: 'detail-footer-edit-single',
            title: '単発の予定の編集は今までどおり動く',
            actor: ACTOR,
            variant,
          },
          prepareAsAoki((request, token) =>
            createSlot(request, token, {
              staffId: LOGIN_STAFF.id,
              title,
              date,
              start: '15:00',
              end: '16:00',
            }),
          ),
          async ({ page, step, check }, { data: scheduleId }) => {
            await openDay(page, LOGIN_STAFF.id, date)
            const event = page.getByTestId(`schedule-event-${scheduleId}`)
            await expect(event).toBeVisible()
            await step(
              `${LOGIN_STAFF.name} の明日（${date}）の 15:00〜16:00 に「${title}」を API で作ってある。明日の日の表示を開いている`,
            )

            await step('予定を押して詳細を開き、「編集」を押す')
            await openDetail(page, event)
            await expect(scheduleDetailDeleteButton(page)).toBeVisible()
            await page.getByTestId('schedule-detail-edit').click()
            await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
            await expect(page.getByTestId('schedule-field-title')).toContainText(title)
            await check(`予定の編集のフォームが開き、タイトルに「${title}」が出る`)
          },
        )
      })

      test(`${prefix}削除できる繰り返しの予定の回の詳細で「編集」のメニューを開いて閉じ、「閉じる」を押した場合、メニューが出て、予定のカレンダーに戻ること`, async ({
        browser,
      }) => {
        const title = `編集のメニューの定例 ${Date.now()}`
        const first = fromNextMonday(0)
        await recordPrEvidence(
          browser,
          {
            name: 'detail-footer-edit-close',
            title: '閉じると編集は今までどおり動く',
            actor: ACTOR,
            variant,
          },
          prepareAsAoki((request, token) =>
            createWeekly(request, token, {
              staffId: LOGIN_STAFF.id,
              title,
              date: first,
              start: '12:00',
              end: '13:00',
            }),
          ),
          async ({ page, step, check }) => {
            await openDay(page, LOGIN_STAFF.id, first)
            const event = dayEvent(page, LOGIN_STAFF.id, title)
            await expect(event).toBeVisible()
            await step(
              `${first} から毎週月曜 12:00〜13:00 の「${title}」を API で作ってある。${first} の日の表示を開いている`,
            )

            await step('回を押して詳細を開き、「編集」を押す')
            await openDetail(page, event)
            await expect(scheduleDetailDeleteButton(page)).toBeVisible()
            await page.getByTestId('schedule-detail-edit').click()
            await expect(page.getByTestId('schedule-detail-edit-occurrence')).toHaveText(
              'この予定を編集',
            )
            await expect(page.getByTestId('schedule-detail-edit-recurrence')).toHaveText(
              '繰り返しを変更',
            )
            await check('編集のメニューに「この予定を編集」と「繰り返しを変更」が出る')

            await step('もう一度「編集」を押してメニューを閉じ、「閉じる」を押す')
            await page.getByTestId('schedule-detail-edit').click()
            await expect(page.getByTestId('schedule-detail-edit-occurrence')).toBeHidden()
            await page.getByTestId('schedule-detail-close').click()
            await expect(page.getByTestId('schedule-detail-modal')).toBeHidden()
            await expect(page).toHaveURL(/\/schedule\?(.+&)?view=day/)
            await expect(event).toBeVisible()
            await check('詳細が閉じ、予定のカレンダーの日の表示に戻る')
          },
        )
      })
    }
  })
})

/**
 * 録画の外で、google_primary の事業所の岡田 葵でログインし、calendarpit の岡田のカレンダーに date の start〜end の予定 title を作り、
 * 同期の後に日の表示に出るまで待つ。トークンは取らない。
 */
function prepareOkada(title: string, date: string, start: string, end: string) {
  return async (page: Page) => {
    await page.goto('/schedule')
    await signInAtBroker(page, OKADA.email)
    await createGoogleEvent(page.request, OKADA.calendarId, { summary: title, date, start, end })
    await openDay(page, OKADA.staff.id, date)
    await expect(async () => {
      await page.reload()
      await expect(dayEvent(page, OKADA.staff.id, title)).toBeVisible()
    }).toPass()
  }
}
