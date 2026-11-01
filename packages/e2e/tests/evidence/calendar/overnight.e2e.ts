import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import {
  CALENDARPIT_URL,
  HAYASHI,
  LEADER,
  LOGIN_EMAIL,
  LOGIN_STAFF,
  SATO,
  SCHEDULE_URL,
  SEED_PATIENT,
} from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'
import { createGoogleEvent, findGoogleEvent, moveGoogleEvent } from '../../fixtures/googleCalendar'
import { detailDateTimeText } from '../../fixtures/schedule'
import { STAFF_FORM } from '../../fixtures/staff'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../screens/calendar'
import { signInAtBroker } from '../../screens/login'
import { calendarpitEvent } from '../../selectors/calendarpit'

// 観点ごとに日付を分け、前の撮影が作った予定と重ならないようにする。
const ACTOR = `${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`
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
 * ログインして職員にカレンダーを結び付け、職員の Google カレンダー（calendarpit）に翌日に終わる予定を作る。
 * 作った予定の ID と、withToken のときは予定の API を呼ぶトークンを返す。ブローカーはメールごとにログインの試行の回数を数えるので、
 * トークンは要る観点だけで取る。
 */
const prepareLinked =
  (staffId: string, calendarId: string, event?: OvernightEvent, withToken = false) =>
  async (page: Page) => {
    await page.goto('/schedule/link')
    await signInAtBroker(page, LOGIN_EMAIL)
    await linkStaffCalendar(page, staffId)
    const created = event
      ? await createGoogleEvent(page.request, calendarId, {
          ...event,
          endDate: nextDate(event.date),
        })
      : undefined
    return {
      token: withToken ? await issueAccessToken(page.request, LOGIN_EMAIL) : '',
      eventId: created?.id ?? '',
    }
  }

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

test.describe('予定の取り込み', () => {
  test.describe('翌日に終わる予定の取り込み', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}Google カレンダーに 22 時から翌日の 1 時までの訪問の予定がある日をプレビューした場合、取り込む予定に入ること`, async ({
        browser,
      }) => {
        const date = '2026-12-01'
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-import-overnight-preview',
            title: `${SATO.name} の Google カレンダーの ${date} 22:00〜翌 01:00 の訪問の予定は、プレビューで取り込む予定に入る`,
            actor: ACTOR,
            variant,
          },
          prepareLinked(SATO.id, SATO.calendarId, {
            summary: VISIT_TITLE,
            date,
            start: '22:00',
            end: '01:00',
          }),
          async ({ page, step, check }) => {
            try {
              await page.goto(
                `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(SATO.calendarId)}&date=${date}`,
              )
              await expect(calendarpitEvent(page, VISIT_TITLE)).toBeVisible()
              await step(
                `${SATO.name} の Google カレンダー（calendarpit）に、「${VISIT_TITLE}」${date} 22:00〜翌日 01:00 がある`,
              )

              await step(
                `予定の取り込みの画面で ${SATO.name} を選び、期間を ${date} の 1 日にしてプレビューする`,
              )
              await previewDay(page, SATO.id, date)
              await expect(page.getByTestId('calendar-import-count-import')).toContainText('1 件')
              await expect(page.getByTestId('calendar-import-skipped-heading')).toBeHidden()
              await check(
                '「プレビューの結果」の取り込む予定が 1 件になり、取り込まない予定は出ない',
              )
            } finally {
              await step('（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）')
              await unlinkStaffCalendar(page, SATO.id)
            }
          },
        )
      })

      test(`${prefix}22 時から翌日の 1 時までの訪問の予定を取り込んだ場合、開始の日の予定になること`, async ({
        browser,
      }) => {
        const date = '2026-12-02'
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-import-overnight-confirm',
            title: `${date} 22:00〜翌 01:00 の訪問の予定を取り込むと、開始の日（${date}）の予定になる`,
            actor: ACTOR,
            variant,
          },
          prepareLinked(
            SATO.id,
            SATO.calendarId,
            {
              summary: VISIT_TITLE,
              date,
              start: '22:00',
              end: '01:00',
            },
            true,
          ),
          async ({ page, step, check }, { token }) => {
            try {
              await previewDay(page, SATO.id, date)
              await expect(page.getByTestId('calendar-import-count-import')).toContainText('1 件')
              await step(
                `${SATO.name} の ${date} をプレビューした。Google カレンダーの「${VISIT_TITLE}」${date} 22:00〜翌日 01:00 が、取り込む予定に入っている`,
              )

              await step('「確定して取り込む」を押す')
              await page.getByTestId('calendar-import-submit').click()
              await expect(page.getByTestId('calendar-import-result-counts')).toContainText('1 件')
              await check('取り込んだ件数（1 件）が出る')

              await step(`予定のカレンダーの日の表示で ${date} を開く`)
              await page.goto(`/schedule?view=day&date=${date}`)
              const event = page
                .getByTestId(`day-grid-staff-${SATO.id}`)
                .getByTestId(/^schedule-event-/)
                .filter({ hasText: SEED_PATIENT.name })
              await expect(event).toBeVisible()
              await step('（撮影のため、日の表示を 22 時の位置までスクロールする）')
              await event.scrollIntoViewIfNeeded()
              await check(`${date} の ${SATO.name} の列に、${SEED_PATIENT.name} の訪問の予定が出る`)

              await step('予定を開く')
              await event.click()
              await expect(page.getByTestId('schedule-detail-datetime')).toContainText(
                detailDateTimeText(date, '22:00', '01:00').split(' ')[0] ?? '',
              )
              const saved = await findSchedule(page.request, token, date, SEED_PATIENT.name)
              expect(saved?.ends_next_day).toBe(true)
              await check(
                `予定の詳細の日付が ${date}（開始の日）になる。予定の API の取得でも date は ${date}、ends_next_day は true（翌日の表示は #411、#412 で直す）`,
              )
            } finally {
              await step(
                '（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す。取り込んだ予定は残る）',
              )
              await unlinkStaffCalendar(page, SATO.id)
            }
          },
        )
      })

      test(`${prefix}Google カレンダーに 2 日にわたる予定がある日をプレビューした場合、取り込まない予定に日時と理由が出ること`, async ({
        browser,
      }) => {
        const date = '2026-11-13'
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-import-multi-day',
            title: `${MORI.name} の Google カレンダーの 11-13 17:00〜11-15 09:00 の予定は、今どおり取り込まない予定に日時と「日をまたぐ予定」で出る`,
            actor: ACTOR,
            variant,
          },
          prepareLinked(MORI.id, MORI_CALENDAR),
          async ({ page, step, check }) => {
            try {
              await page.goto(
                `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(MORI_CALENDAR)}&date=${date}`,
              )
              await expect(calendarpitEvent(page, '合宿研修')).toBeVisible()
              await step(
                `${MORI.name} の Google カレンダー（calendarpit）に、「合宿研修」2026-11-13 17:00〜2026-11-15 09:00 がある`,
              )

              await step(
                `予定の取り込みの画面で ${MORI.name} を選び、期間を ${date} の 1 日にしてプレビューする`,
              )
              await previewDay(page, MORI.id, date)
              await expect(page.getByTestId('calendar-import-skipped-heading')).toHaveText(
                '取り込まない予定（1 件）',
              )
              const skipped = page.getByTestId('calendar-import-skipped')
              await expect(skipped).toContainText('2026/11/13（金）17:00〜翌 09:00')
              await expect(skipped).toContainText('日をまたぐ予定')
              await check(
                '取り込まない予定（1 件）に「2026/11/13（金）17:00〜翌 09:00」と「日をまたぐ予定」が出る',
              )
            } finally {
              await step('（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）')
              await unlinkStaffCalendar(page, MORI.id)
            }
          },
        )
      })

      test(`${prefix}利用者のいない 22 時から翌日の 1 時までの訪問の予定をプレビューした場合、確認が必要な予定の日時の終了に「翌」が付くこと`, async ({
        browser,
      }) => {
        const date = '2026-12-07'
        const title = '【訪看I2】架空 四郎'
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-import-overnight-review',
            title: `利用者のいない「${title}」${date} 22:00〜翌 01:00 は、確認が必要な予定に「2026/12/07（月）22:00〜翌 01:00」で出る`,
            actor: ACTOR,
            variant,
          },
          prepareLinked(SATO.id, SATO.calendarId, {
            summary: title,
            date,
            start: '22:00',
            end: '01:00',
          }),
          async ({ page, step, check }) => {
            try {
              await page.goto(`/schedule/import?staff=${SATO.id}`)
              await expect(page.getByTestId('calendar-import-staff')).toHaveValue(SATO.id)
              await step(
                `${SATO.name} の Google カレンダーに、利用者のいない「${title}」${date} 22:00〜翌日 01:00 がある`,
              )

              await step(`期間を ${date} の 1 日にしてプレビューする`)
              await previewDay(page, SATO.id, date)
              await expect(page.getByTestId('calendar-import-count-needs_review')).toContainText(
                '1 件',
              )
              await expect(page.getByTestId('calendar-import-result-preview')).toContainText(
                '2026/12/07（月）22:00〜翌 01:00',
              )
              await check('確認が必要な予定に、日時「2026/12/07（月）22:00〜翌 01:00」が出る')
            } finally {
              await step('（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）')
              await unlinkStaffCalendar(page, SATO.id)
            }
          },
        )
      })
    }
  })
})

test.describe('確認が必要な予定', () => {
  test.describe('翌日に終わる予定の書き出しと同期', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}buddy で 22 時から翌日の 1 時までの予定を作った場合、Google カレンダーの予定が開始の日の 22 時から翌日の 1 時になること`, async ({
        browser,
      }) => {
        const date = '2026-12-03'
        const title = `夜勤 ${Date.now()}`
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-export-overnight',
            title: `buddy で ${HAYASHI.name} の ${date} 22:00〜翌 01:00 の予定を作ると、Google カレンダーの予定が ${date} 22:00〜翌日 01:00 になる`,
            actor: `${LOGIN_STAFF.name}（マネージャー）`,
            variant,
          },
          prepareLinked(HAYASHI.id, HAYASHI.calendarId, undefined, true),
          async ({ page, step, check }, { token }) => {
            const request = page.request
            try {
              await page.goto('/schedule/link')
              await expect(page.getByTestId(`calendar-link-menu-${HAYASHI.id}`)).toBeVisible()
              await step(
                `${HAYASHI.name} に Google カレンダー（${HAYASHI.calendarId}、calendarpit）を結び付けてある`,
              )

              await step(
                `${HAYASHI.name} の「${title}」${date} 22:00〜翌 01:00 を作る\n（撮影のため、翌日に終わる予定の入力は #412 で画面に足すので、予定の API で ends_next_day を true にして作る）`,
              )
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

              // 書き出しは別の処理が行うので、calendarpit に出るまで待ってから管理の画面を開く
              await expect
                .poll(
                  async () => (await findGoogleEvent(request, HAYASHI.calendarId, title))?.status,
                )
                .toBe('confirmed')
              const event = await findGoogleEvent(request, HAYASHI.calendarId, title)
              await step(
                `Google カレンダーの代わりの calendarpit の管理の画面で、${HAYASHI.calendarId} の ${date} を開く`,
              )
              await page.goto(
                `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(HAYASHI.calendarId)}&date=${date}`,
              )
              await expect(calendarpitEvent(page, title)).toBeVisible()
              expect(event?.start?.dateTime?.slice(0, 16)).toBe(`${date}T22:00`)
              expect(event?.end?.dateTime?.slice(0, 16)).toBe(`${nextDate(date)}T01:00`)
              await check(
                `${HAYASHI.calendarId} に「${title}」が出る。予定の開始は ${date} 22:00、終了は ${nextDate(date)} 01:00`,
              )
            } finally {
              await step('（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）')
              await unlinkStaffCalendar(page, HAYASHI.id)
            }
          },
        )
      })

      test(`${prefix}取り込んだ予定を Google カレンダーで 23 時から翌日の 2 時に変えた場合、buddy の予定も 23 時から翌日の 2 時になること`, async ({
        browser,
      }) => {
        const date = '2026-12-05'
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-sync-overnight',
            title: `取り込んだ ${date} 22:00〜翌 01:00 の予定を Google カレンダーで 23:00〜翌 02:00 に変えると、buddy の予定も 23:00〜翌 02:00 になる`,
            actor: ACTOR,
            variant,
          },
          async (page) => {
            const prepared = await prepareLinked(
              SATO.id,
              SATO.calendarId,
              {
                summary: VISIT_TITLE,
                date,
                start: '22:00',
                end: '01:00',
              },
              true,
            )(page)
            await previewDay(page, SATO.id, date)
            await page.getByTestId('calendar-import-submit').click()
            await expect(page.getByTestId('calendar-import-result-counts')).toContainText('1 件')
            const saved = await findSchedule(page.request, prepared.token, date, SEED_PATIENT.name)
            return { ...prepared, scheduleId: saved?.id ?? '' }
          },
          async ({ page, step, check }, { token, eventId, scheduleId }) => {
            const request = page.request
            try {
              await page.goto(`/schedule/${scheduleId}`)
              await expect(page.getByTestId('schedule-detail-datetime')).toContainText(
                '22:00〜01:00',
              )
              await step(
                `${SATO.name} の Google カレンダーから取り込んだ ${SEED_PATIENT.name} の ${date} 22:00〜翌 01:00 の予定を開いている`,
              )

              await step(
                '（撮影のため、職員が Google カレンダーで予定を直す代わりに、calendarpit の管理の API で 23:00〜翌日 02:00 に変える）',
              )
              await moveGoogleEvent(
                request,
                SATO.calendarId,
                eventId,
                `${date}T23:00:00+09:00`,
                `${nextDate(date)}T02:00:00+09:00`,
              )
              await page.goto(
                `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(SATO.calendarId)}&date=${date}`,
              )
              await expect(calendarpitEvent(page, VISIT_TITLE)).toBeVisible()
              await check(
                `calendarpit の ${SATO.calendarId} の予定が ${date} 23:00〜${nextDate(date)} 02:00 になる`,
              )

              await step('buddy で同じ予定を開き直す（buddy は数秒ごとに Google の変更を読む）')
              await expect
                .poll(
                  async () =>
                    (await findSchedule(request, token, date, SEED_PATIENT.name))?.start_time,
                )
                .toBe('23:00')
              await page.goto(`/schedule/${scheduleId}`)
              await expect(page.getByTestId('schedule-detail-datetime')).toContainText(
                '23:00〜02:00',
              )
              const synced = await findSchedule(request, token, date, SEED_PATIENT.name)
              expect(synced?.end_time).toBe('02:00')
              expect(synced?.ends_next_day).toBe(true)
              await check(
                `buddy の予定が ${date} の 23:00〜02:00 になる。予定の API の取得でも end_time は 02:00、ends_next_day は true（翌日の表示は #411、#412 で直す）`,
              )
            } finally {
              await step(
                '（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す。取り込んだ予定は残る）',
              )
              await unlinkStaffCalendar(page, SATO.id)
            }
          },
        )
      })

      test(`${prefix}確認が必要な予定に終了が翌日の予定がある場合、日時の終了の時刻に「翌」が付くこと`, async ({
        browser,
      }) => {
        const url = storyUrl('画面-calendar-calendarreviewview--overnight-issue')
        await recordPrEvidence(
          browser,
          {
            name: 'calendar-review-overnight',
            title:
              '確認が必要な予定の一覧で、終了が翌日の予定の日時が「2026/11/13（金）22:00〜翌 01:00」で出る',
            actor: 'ログインなし（Storybook の story）',
            variant,
          },
          async (page) => {
            await page.goto(url)
          },
          async ({ page, step, check }) => {
            await page.goto(url)
            const datetime = page.getByTestId('calendar-review-datetime-export-overnight')
            await expect(datetime).toBeVisible()
            await step(
              '確認が必要な予定の画面（Storybook の CalendarReviewView の OvernightIssue）を開いている\n行は、2026-11-13 22:00 に始まり翌日の 01:00 に終わる単発の予定である（架空のデータ）',
            )
            await expect(datetime).toHaveText('2026/11/13（金）22:00〜翌 01:00')
            await check('行の日時が「2026/11/13（金）22:00〜翌 01:00」で出る')
          },
        )
      })
    }
  })
})
