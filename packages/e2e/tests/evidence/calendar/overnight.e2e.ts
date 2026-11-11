import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import {
  CALENDARPIT_URL,
  HAYASHI,
  LEADER,
  LOGIN_EMAIL,
  LOGIN_STAFF,
  LOGIN_STATE,
  SATO,
  SCHEDULE_URL,
  SEED_PATIENT,
} from '../../fixtures/env'
import { storyUrl } from '../../fixtures/evidence'
import { createGoogleEvent, findGoogleEvent } from '../../fixtures/googleCalendar'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { detailDateTimeText } from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../setup/calendar'
import { calendarpitEvent } from '../../selectors/calendarpit'

// 観点ごとに日付を分け、前の撮影が作った予定と重ならないようにする。
const MORI = LEADER.staff
// 森のカレンダーの ID は、森のメールと同じである（compose/calendarpit/fixture.json）。
const MORI_CALENDAR = LEADER.email
const VISIT_TITLE = `【訪看I2】${SEED_PATIENT.name}`

type OvernightEvent = { summary: string; date: string; start: string; end: string }

/** 開始の日の翌日の日付（YYYY-MM-DD）を返す。 */
const nextDate = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * 録画の外で、職員にカレンダーを結び付け、職員の Google カレンダー（calendarpit）に翌日に終わる予定を作る。
 * withToken のときは、予定の API を呼ぶトークンを返す。ブローカーはメールごとにログインの試行の回数を数えるので、
 * トークンは要る観点だけで取る。
 */
const prepareLinked = (
  browser: Parameters<typeof prepareOutsideRecording>[0],
  staffId: string,
  calendarId: string,
  event?: OvernightEvent,
  withToken = false,
) =>
  prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, async (page) => {
    await linkStaffCalendar(page, staffId)
    if (event)
      await createGoogleEvent(page.request, calendarId, {
        ...event,
        endDate: nextDate(event.date),
      })
    return withToken ? await issueAccessToken(page.request, LOGIN_EMAIL) : ''
  })

/** 取り込みの画面で、職員の date の 1 日をプレビューする。 */
const previewDay = async (page: Page, staffId: string, date: string) => {
  await page.goto(`/schedule/import?staff=${staffId}`)
  await expect(page.getByTestId('calendar-import-staff')).toHaveValue(staffId)
  await page.getByTestId('calendar-import-start').fill(date)
  await page.getByTestId('calendar-import-end').fill(date)
  await page.getByTestId('calendar-import-preview').click()
  await expect(page.getByTestId('calendar-import-result-preview')).toBeVisible()
}

/** 予定の API の一覧から、事業所の date に始まる単発の予定のうち、タイトルか利用者名が text の予定を返す。 */
const findSchedule = async (
  request: APIRequestContext,
  token: string,
  date: string,
  text: string,
) => {
  const res = await request.get(
    `${SCHEDULE_URL}/v1/facilities/${STAFF_FORM.facilityId}/schedules`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { date_from: date, date_to: date },
    },
  )
  if (!res.ok()) throw new Error(`予定の一覧を取れない: ${res.status()}`)
  const { schedules } = (await res.json()) as {
    schedules: {
      id: string
      date: string
      start_time: string
      end_time: string
      ends_next_day: boolean
      title: string | null
      visit_info: { patient_name?: string } | null
    }[]
  }
  return schedules.find(
    (s) => s.date === date && (s.title === text || s.visit_info?.patient_name === text),
  )
}

const openCalendarpit = (page: Page, calendarId: string, date: string) =>
  page.goto(`${CALENDARPIT_URL}/?calendar=${encodeURIComponent(calendarId)}&date=${date}`)

/** ほかの撮影の前提に戻すため、職員の結び付けを外す。 */
const unlinkForOthers = (page: Page, staffId: string, text = '') =>
  step(page, `（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す${text}）`, () =>
    unlinkStaffCalendar(page, staffId),
  )

const ACTOR = `${LOGIN_STAFF.name}、マネージャー、職員の管理の権限あり`

test.describe('予定の取り込み', () => {
  test.describe(`翌日に終わる予定の取り込み（${ACTOR}）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('calendar-import-overnight-preview Google カレンダーに 22 時から翌日の 1 時までの訪問の予定がある日をプレビューした場合、取り込む予定に入ること', async ({
      browser,
      context,
    }) => {
      const date = '2026-12-01'
      await prepareLinked(browser, SATO.id, SATO.calendarId, {
        summary: VISIT_TITLE,
        date,
        start: '22:00',
        end: '01:00',
      })

      const page = await context.newPage()
      try {
        await openCalendarpit(page, SATO.calendarId, date)
        await expect(calendarpitEvent(page, VISIT_TITLE)).toBeVisible()
        await intro(
          page,
          `${SATO.name} の Google カレンダーの ${date} 22:00〜翌 01:00 の訪問の予定は、プレビューで取り込む予定に入る\n前提 ${SATO.name} の Google カレンダー（calendarpit）に、「${VISIT_TITLE}」${date} 22:00〜翌日 01:00 がある`,
        )

        await step(
          page,
          `予定の取り込みの画面で ${SATO.name} を選び、期間を ${date} の 1 日にしてプレビューする`,
          () => previewDay(page, SATO.id, date),
        )
        await check(
          page,
          '「プレビューの結果」の取り込む予定が 1 件になり、取り込まない予定は出ない',
          async () => {
            await expect(page.getByTestId('calendar-import-count-import')).toContainText('1 件')
            await expect(page.getByTestId('calendar-import-skipped-heading')).toBeHidden()
          },
        )
      } finally {
        await unlinkForOthers(page, SATO.id)
      }
    })

    test('calendar-import-overnight-confirm 22 時から翌日の 1 時までの訪問の予定を取り込んだ場合、開始の日の予定になること', async ({
      browser,
      context,
    }) => {
      const date = '2026-12-02'
      const token = await prepareLinked(
        browser,
        SATO.id,
        SATO.calendarId,
        { summary: VISIT_TITLE, date, start: '22:00', end: '01:00' },
        true,
      )

      const page = await context.newPage()
      try {
        await previewDay(page, SATO.id, date)
        await expect(page.getByTestId('calendar-import-count-import')).toContainText('1 件')
        await intro(
          page,
          `${date} 22:00〜翌 01:00 の訪問の予定を取り込むと、開始の日（${date}）の予定になる\n前提 ${SATO.name} の ${date} をプレビューした。Google カレンダーの「${VISIT_TITLE}」${date} 22:00〜翌日 01:00 が、取り込む予定に入っている`,
        )

        await step(page, '「確定して取り込む」を押す', () =>
          page.getByTestId('calendar-import-submit').click(),
        )
        await check(page, '取り込んだ件数（1 件）が出る', () =>
          expect(page.getByTestId('calendar-import-result-counts')).toContainText('1 件'),
        )

        const event = page
          .getByTestId(`day-grid-staff-${SATO.id}`)
          .getByTestId(/^schedule-event-/)
          .filter({ hasText: SEED_PATIENT.name })
        await step(page, `予定のカレンダーの日の表示で ${date} を開く`, async () => {
          await page.goto(`/schedule?view=day&date=${date}`)
          await expect(event).toBeVisible()
        })
        await step(page, '（撮影のため、日の表示を 22 時の位置までスクロールする）', () =>
          event.scrollIntoViewIfNeeded(),
        )
        await check(
          page,
          `${date} の ${SATO.name} の列に、${SEED_PATIENT.name} の訪問の予定が出る`,
          () => expect(event).toBeVisible(),
        )

        await step(page, '予定を開く', () => event.click())
        await check(
          page,
          `予定の詳細の日付が ${date}（開始の日）になる。予定の API の取得でも date は ${date}、ends_next_day は true（翌日の表示は #411、#412 で直す）`,
          async () => {
            await expect(page.getByTestId('schedule-detail-datetime')).toContainText(
              detailDateTimeText(date, '22:00', '01:00').split(' ')[0] ?? '',
            )
            const saved = await findSchedule(page.request, token, date, SEED_PATIENT.name)
            expect(saved?.ends_next_day).toBe(true)
          },
        )
      } finally {
        await unlinkForOthers(page, SATO.id, '。取り込んだ予定は残る')
      }
    })

    test('calendar-import-multi-day Google カレンダーに 2 日にわたる予定がある日をプレビューした場合、取り込まない予定に日時と理由が出ること', async ({
      browser,
      context,
    }) => {
      const date = '2026-11-13'
      await prepareLinked(browser, MORI.id, MORI_CALENDAR)

      const page = await context.newPage()
      try {
        await openCalendarpit(page, MORI_CALENDAR, date)
        await expect(calendarpitEvent(page, '合宿研修')).toBeVisible()
        await intro(
          page,
          `${MORI.name} の Google カレンダーの 11-13 17:00〜11-15 09:00 の予定は、今どおり取り込まない予定に日時と「日をまたぐ予定」で出る\n前提 ${MORI.name} の Google カレンダー（calendarpit）に、「合宿研修」2026-11-13 17:00〜2026-11-15 09:00 がある`,
        )

        await step(
          page,
          `予定の取り込みの画面で ${MORI.name} を選び、期間を ${date} の 1 日にしてプレビューする`,
          () => previewDay(page, MORI.id, date),
        )
        const skipped = page.getByTestId('calendar-import-skipped')
        await check(
          page,
          '取り込まない予定（1 件）に「2026年11月13日（金） 17:00〜翌 09:00」と「日をまたぐ予定」が出る',
          async () => {
            await expect(page.getByTestId('calendar-import-skipped-heading')).toHaveText(
              '取り込まない予定（1 件）',
            )
            await expect(skipped).toContainText('2026年11月13日（金） 17:00〜翌 09:00')
            await expect(skipped).toContainText('日をまたぐ予定')
          },
        )
      } finally {
        await unlinkForOthers(page, MORI.id)
      }
    })

    test('calendar-import-overnight-review 利用者のいない 22 時から翌日の 1 時までの訪問の予定をプレビューした場合、確認が必要な予定の日時の終了に「翌」が付くこと', async ({
      browser,
      context,
    }) => {
      const date = '2026-12-07'
      const title = '【訪看I2】架空 四郎'
      await prepareLinked(browser, SATO.id, SATO.calendarId, {
        summary: title,
        date,
        start: '22:00',
        end: '01:00',
      })

      const page = await context.newPage()
      try {
        await page.goto(`/schedule/import?staff=${SATO.id}`)
        await expect(page.getByTestId('calendar-import-staff')).toHaveValue(SATO.id)
        await intro(
          page,
          `利用者のいない「${title}」${date} 22:00〜翌 01:00 は、確認が必要な予定に「2026年12月7日（月） 22:00〜翌 01:00」で出る\n前提 ${SATO.name} の Google カレンダーに、利用者のいない「${title}」${date} 22:00〜翌日 01:00 がある`,
        )

        await step(page, `期間を ${date} の 1 日にしてプレビューする`, () =>
          previewDay(page, SATO.id, date),
        )
        await check(
          page,
          '確認が必要な予定に、日時「2026年12月7日（月） 22:00〜翌 01:00」が出る',
          async () => {
            await expect(page.getByTestId('calendar-import-count-needs_review')).toContainText(
              '1 件',
            )
            await expect(page.getByTestId('calendar-import-result-preview')).toContainText(
              '2026年12月7日（月） 22:00〜翌 01:00',
            )
          },
        )
      } finally {
        await unlinkForOthers(page, SATO.id)
      }
    })
  })
})

test.describe('確認が必要な予定', () => {
  test.describe(`翌日に終わる予定の書き出し（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('calendar-export-overnight buddy で 22 時から翌日の 1 時までの予定を作った場合、Google カレンダーの予定が開始の日の 22 時から翌日の 1 時になること', async ({
      browser,
      context,
    }) => {
      const date = '2026-12-03'
      const title = `夜勤 ${Date.now()}`
      const token = await prepareLinked(browser, HAYASHI.id, HAYASHI.calendarId, undefined, true)

      const page = await context.newPage()
      const request = page.request
      try {
        await page.goto('/schedule/link')
        await expect(page.getByTestId(`calendar-link-menu-${HAYASHI.id}`)).toBeVisible()
        await intro(
          page,
          `buddy で ${HAYASHI.name} の ${date} 22:00〜翌 01:00 の予定を作ると、Google カレンダーの予定が ${date} 22:00〜翌日 01:00 になる\n前提 ${HAYASHI.name} に Google カレンダー（${HAYASHI.calendarId}、calendarpit）を結び付けてある`,
        )

        await step(
          page,
          `${HAYASHI.name} の「${title}」${date} 22:00〜翌 01:00 を作る\n（撮影のため、翌日に終わる予定の入力は #412 で画面に足すので、予定の API で ends_next_day を true にして作る）`,
          async () => {
            const types = (await (
              await request.get(`${SCHEDULE_URL}/v1/schedule_types`, {
                headers: { Authorization: `Bearer ${token}` },
              })
            ).json()) as { id: string; name: string }[]
            const created = await request.post(
              `${SCHEDULE_URL}/v1/facilities/${STAFF_FORM.facilityId}/schedules`,
              {
                headers: { Authorization: `Bearer ${token}` },
                data: {
                  schedule_type_id: types.find(({ name }) => name === '通常')?.id,
                  date,
                  start_time: '22:00',
                  end_time: '01:00',
                  ends_next_day: true,
                  staff_id: HAYASHI.id,
                  title,
                },
              },
            )
            expect(created.status()).toBe(201)
          },
        )

        await step(
          page,
          `Google カレンダーの代わりの calendarpit の管理の画面で、${HAYASHI.calendarId} の ${date} を開く`,
          async () => {
            // 書き出しは別の処理が行うので、calendarpit に出るまで待ってから管理の画面を開く
            await expect
              .poll(async () => (await findGoogleEvent(request, HAYASHI.calendarId, title))?.status)
              .toBe('confirmed')
            await openCalendarpit(page, HAYASHI.calendarId, date)
          },
        )
        await check(
          page,
          `${HAYASHI.calendarId} に「${title}」が出る。予定の開始は ${date} 22:00、終了は ${nextDate(date)} 01:00`,
          async () => {
            await expect(calendarpitEvent(page, title)).toBeVisible()
            const event = await findGoogleEvent(request, HAYASHI.calendarId, title)
            expect(event?.start?.dateTime?.slice(0, 16)).toBe(`${date}T22:00`)
            expect(event?.end?.dateTime?.slice(0, 16)).toBe(`${nextDate(date)}T01:00`)
          },
        )
      } finally {
        await unlinkForOthers(page, HAYASHI.id)
      }
    })
  })

  test.describe('翌日に終わる予定の書き出し（ログインなし、Storybook の story）', () => {
    test('calendar-review-overnight 確認が必要な予定に終了が翌日の予定がある場合、日時の終了の時刻に「翌」が付くこと', async ({
      page,
    }) => {
      await page.goto(storyUrl('画面-calendar-calendarreviewview--overnight-issue'))
      const datetime = page.getByTestId('calendar-review-datetime-export-1')
      await expect(datetime).toBeVisible()
      await intro(
        page,
        '確認が必要な予定の一覧で、終了が翌日の予定の日時が「2026年11月13日（金） 22:00〜翌 01:00」で出る\n前提 確認が必要な予定の画面（Storybook の CalendarReviewView の OvernightIssue）を開いている。行は、2026-11-13 22:00 に始まり翌日の 01:00 に終わる単発の予定である（架空のデータ）',
      )

      await check(page, '行の日時が「2026年11月13日（金） 22:00〜翌 01:00」で出る', () =>
        expect(datetime).toHaveText('2026年11月13日（金） 22:00〜翌 01:00'),
      )
    })
  })
})
