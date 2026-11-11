import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { CALENDARPIT_URL, LOGIN_STAFF, LOGIN_STATE, OKADA, OKADA_STATE } from '../../fixtures/env'
import { deleteGoogleEvent, listGoogleEvents } from '../../fixtures/googleCalendar'
import { calendarpitEvent } from '../../selectors/calendarpit'
import { acceptBrowserDialog } from '../../widgets/browserDialog/actions/browserDialog'

const DAY = 24 * 60 * 60 * 1000

/** Asia/Tokyo の今日から days 日後の日付（YYYY-MM-DD）。 */
const daysFromToday = (days: number) =>
  new Date(Date.now() + 9 * 60 * 60 * 1000 + days * DAY).toISOString().slice(0, 10)

/** 明日以降で最初の月曜の日付から、days 日後の日付（YYYY-MM-DD）。 */
const fromNextMonday = (days: number) => {
  const today = new Date(`${daysFromToday(0)}T00:00:00Z`).getUTCDay()
  return daysFromToday(((8 - today) % 7 || 7) + days)
}

/** year 年 month 月（1 始まり）の第 2 火曜の日付（YYYY-MM-DD）。 */
const secondTuesdayOf = (year: number, month: number) => {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const firstTuesday = 1 + ((2 - first.getUTCDay() + 7) % 7)
  return new Date(Date.UTC(year, month - 1, firstTuesday + 7)).toISOString().slice(0, 10)
}

/** 明日以降で最初の第 2 火曜から、続く count か月の第 2 火曜の日付。 */
const nextSecondTuesdays = (count: number) => {
  const tomorrow = daysFromToday(1)
  const [year, month] = tomorrow.split('-').map(Number) as [number, number]
  const dates = Array.from({ length: count + 1 }, (_, i) => {
    const m = month - 1 + i
    return secondTuesdayOf(year + Math.floor(m / 12), (m % 12) + 1)
  })
  return dates.filter((date) => date >= tomorrow).slice(0, count)
}

/** YYYY-MM-DD の曜日の文言（「月曜」の形）。 */
const weekdayOf = (date: string) =>
  `${'日月火水木金土'[new Date(`${date}T00:00:00Z`).getUTCDay()]}曜`

/** 日の表示の staffId の列の、title の予定。 */
const dayEvent = (page: Page, staffId: string, title: string) =>
  page
    .getByTestId(`day-grid-staff-${staffId}`)
    .getByTestId(/^schedule-event-/)
    .filter({ hasText: title })

const openDay = async (page: Page, staffId: string, date: string) => {
  await page.goto(`/schedule?view=day&date=${date}`)
  await expect(page.getByTestId(`day-grid-staff-${staffId}`)).toBeVisible()
}

/** date の日の表示を開き、staffId の列に title の予定が出るか（shown）を判定の字幕で確認する。 */
const checkDay = async (
  page: Page,
  staffId: string,
  date: string,
  title: string,
  shown: boolean,
) => {
  await step(page, `${date}（${weekdayOf(date)}）の日の表示を開く`, () =>
    openDay(page, staffId, date),
  )
  const event = dayEvent(page, staffId, title)
  await check(
    page,
    `${date}（${weekdayOf(date)}）に「${title}」が${shown ? '出る' : '出ない'}`,
    async () => {
      if (shown) {
        await expect(event).toBeVisible()
        await event.scrollIntoViewIfNeeded()
      } else {
        await expect(event).toHaveCount(0)
      }
    },
  )
}

/** 予定のカレンダーを staffId の職員の date の日の表示で開き、intro を出す。 */
const openFirstDay = async (
  page: Page,
  staffId: string,
  date: string,
  title: string,
  dayLabel: string,
) => {
  await openDay(page, staffId, date)
  await intro(
    page,
    `${title}\n前提 予定のカレンダーを ${date}（${dayLabel}）の日の表示で開いている`,
  )
}

/** 予定の作成を開いて、通常の予定にし、タイトルに title を入れ、予定者に staffId の職員を選ぶ。 */
const fillNormal = async (page: Page, title: string, staffId: string) => {
  await page.getByTestId('schedule-create-open').click()
  await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
  await page.getByTestId('schedule-kind-tab-normal').check()
  await page.getByTestId('schedule-field-title').click()
  await page.getByTestId('schedule-form-title').fill(title)
  await page.getByTestId('schedule-field-staff').click()
  await page.getByTestId(`staff-select-option-${staffId}`).check()
}

/** 「繰り返し」を押して「繰り返しの予定にする」を選び、「カスタム…」で曜日に「木」を足し、終了日を endDate にする。 */
const chooseMondayThursdayUntil = async (page: Page, endDate: string) => {
  await page.getByTestId('schedule-field-recurrence').click()
  await page.getByTestId('schedule-form-repeats').check()
  await page.getByTestId('recurring-rule-preset').selectOption('custom')
  await page.getByTestId('recurring-rule-day-of-week-4').check()
  await page.getByTestId('recurring-rule-ends-on').check()
  await page.getByTestId('recurring-rule-end-date').fill(endDate)
}

/** YYYY-MM-DD を `2026年11月19日（木）` の形にする。 */
const japaneseDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return `${year}年${month}月${day}日（${weekdayOf(date).slice(0, 1)}）`
}

/**
 * calendarpit の Calendar API（events.list の singleEvents）が返す、calendarId の title の予定の回の日付（YYYY-MM-DD）。
 * from の 0 時から to の 0 時（Asia/Tokyo）までの回を読む。
 */
const googleInstanceDates = async (
  request: APIRequestContext,
  calendarId: string,
  title: string,
  from: string,
  to: string,
) => {
  const res = await request.get(
    `${CALENDARPIT_URL}/__calendarpit/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      params: {
        singleEvents: true,
        maxResults: 2500,
        timeMin: `${from}T00:00:00+09:00`,
        timeMax: `${to}T00:00:00+09:00`,
      },
    },
  )
  expect(res.ok()).toBe(true)
  const { items = [] } = (await res.json()) as {
    items?: { summary?: string; start?: { dateTime?: string } }[]
  }
  return items
    .filter((item) => item.summary === title)
    .map((item) => item.start?.dateTime?.slice(0, 10) ?? '')
    .sort()
}

test.describe('予定のカレンダー', () => {
  test.describe(`予定の作成の繰り返し（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    // 改修前は予定の作成に繰り返しが無いので、改修前と比べない
    test('schedule-create-recurring-weekly 毎週の月曜と木曜と終了日で作った場合、終了日までの月曜と木曜に回が出ること', async ({
      page,
    }) => {
      const title = `週 2 回の定例 ${Date.now()}`
      const start = fromNextMonday(0)
      const endDate = fromNextMonday(10)
      await openFirstDay(
        page,
        LOGIN_STAFF.id,
        start,
        '予定の作成で、毎週の月曜と木曜を選び、終了日を入れて作ると、終了日までの月曜と木曜に回が出て、終了日の後には出ない',
        '月曜',
      )

      await step(
        page,
        `「予定を作成」を押し、通常の予定で、タイトルに「${title}」、予定者に ${LOGIN_STAFF.name} を入れる`,
        () => fillNormal(page, title, LOGIN_STAFF.id),
      )
      await step(
        page,
        `「繰り返し」を押して「繰り返しの予定にする」を選び、「カスタム…」で曜日の「木」を足し、終了日を「あり」の ${endDate} にする`,
        () => chooseMondayThursdayUntil(page, endDate),
      )
      await check(
        page,
        `項目の一覧の「繰り返し」が「毎週 月曜日、木曜日（${japaneseDate(endDate)}まで）」になる`,
        () =>
          expect(page.getByTestId('schedule-field-recurrence')).toContainText(
            `毎週 月曜日、木曜日（${japaneseDate(endDate)}まで）`,
          ),
      )
      await step(page, '「作成」を押す', async () => {
        await page.getByTestId('schedule-create-submit').click()
        await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
      })

      await checkDay(page, LOGIN_STAFF.id, start, title, true)
      await checkDay(page, LOGIN_STAFF.id, fromNextMonday(3), title, true)
      await checkDay(page, LOGIN_STAFF.id, fromNextMonday(7), title, true)
      await checkDay(page, LOGIN_STAFF.id, endDate, title, true)
      await checkDay(page, LOGIN_STAFF.id, fromNextMonday(14), title, false)
    })

    // 改修前は予定の作成に繰り返しが無いので、改修前と比べない
    test('schedule-create-recurring-monthly 毎月の第 2 火曜で作った場合、各月の第 2 火曜に回が出ること', async ({
      page,
    }) => {
      const title = `月例の会議 ${Date.now()}`
      const [start, second, third] = nextSecondTuesdays(3) as [string, string, string]
      const thirdTuesday = new Date(new Date(`${start}T00:00:00Z`).getTime() + 7 * DAY)
        .toISOString()
        .slice(0, 10)
      await openFirstDay(
        page,
        LOGIN_STAFF.id,
        start,
        '予定の作成で、毎月の第 2 火曜を選んで作ると、各月の第 2 火曜に回が出て、第 3 火曜には出ない',
        '第 2 火曜',
      )

      await step(
        page,
        `「予定を作成」を押し、通常の予定で、タイトルに「${title}」、予定者に ${LOGIN_STAFF.name} を入れる`,
        () => fillNormal(page, title, LOGIN_STAFF.id),
      )
      await step(
        page,
        '「繰り返し」を押して「繰り返しの予定にする」を選び、繰り返しで「毎月 第 2 火曜日」を選ぶ',
        async () => {
          await page.getByTestId('schedule-field-recurrence').click()
          await page.getByTestId('schedule-form-repeats').check()
          await page.getByTestId('recurring-rule-preset').selectOption('monthly-weekday')
        },
      )
      await check(page, '項目の一覧の「繰り返し」が「毎月 第 2 火曜日」になる', () =>
        expect(page.getByTestId('schedule-field-recurrence')).toContainText('毎月 第 2 火曜日'),
      )
      await step(page, '「作成」を押す', async () => {
        await page.getByTestId('schedule-create-submit').click()
        await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
      })

      await checkDay(page, LOGIN_STAFF.id, start, title, true)
      await checkDay(page, LOGIN_STAFF.id, thirdTuesday, title, false)
      await checkDay(page, LOGIN_STAFF.id, second, title, true)
      await checkDay(page, LOGIN_STAFF.id, third, title, true)
    })

    // 改修前は予定の作成に繰り返しが無いので、改修前と比べない
    test('schedule-create-recurring-not-occurring 日付が繰り返しの回に当たらない規則で作成を押した場合、保存できず、理由が出ること', async ({
      page,
    }) => {
      const title = `当たらない定例 ${Date.now()}`
      const start = fromNextMonday(2)
      await openFirstDay(
        page,
        LOGIN_STAFF.id,
        start,
        '予定の作成で、日付（水曜）の曜日を外して火曜と木曜だけの毎週にして作成を押すと、日付が繰り返しの回に当たらないことが出て、予定は作られない',
        '水曜',
      )

      await step(
        page,
        `「予定を作成」を押し、通常の予定で、タイトルに「${title}」、予定者に ${LOGIN_STAFF.name} を入れる`,
        () => fillNormal(page, title, LOGIN_STAFF.id),
      )
      await step(
        page,
        '「繰り返し」を押して「繰り返しの予定にする」を選び、「カスタム…」で曜日の「水」を外して「火」と「木」を選ぶ',
        async () => {
          await page.getByTestId('schedule-field-recurrence').click()
          await page.getByTestId('schedule-form-repeats').check()
          await page.getByTestId('recurring-rule-preset').selectOption('custom')
          await page.getByTestId('recurring-rule-day-of-week-2').check()
          await page.getByTestId('recurring-rule-day-of-week-4').check()
          await page.getByTestId('recurring-rule-day-of-week-3').uncheck()
        },
      )
      await step(page, '「作成」を押す', () => page.getByTestId('schedule-create-submit').click())
      const message = '日付が繰り返しの回に当たりません。日付か繰り返しを変えてください'
      await check(
        page,
        `項目の一覧の「繰り返し」と、繰り返しの欄の下に「${message}」が出て、ダイアログが開いたまま`,
        async () => {
          await expect(page.getByTestId('schedule-field-recurrence')).toContainText(message)
          await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
        },
      )
      await step(page, '「キャンセル」を押し、変更を破棄して閉じる', async () => {
        const discard = '変更が破棄されますがよろしいですか？'
        const confirm = await acceptBrowserDialog(page, discard, () =>
          page.getByTestId('schedule-new-cancel').click(),
        )
        expect(confirm).toBe(discard)
        await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
      })
      await checkDay(page, LOGIN_STAFF.id, start, title, false)
      await checkDay(page, LOGIN_STAFF.id, fromNextMonday(3), title, false)
    })

    // 「繰り返し」の項目の有無は、改修前と改修後の判定のスクリーンショットを並べて比べる。確認する関数は、両方の版で通る形にする
    test(
      'schedule-create-single 「繰り返さない」のまま作った場合、単発の予定ができること',
      { tag: '@compare' },
      async ({ page }) => {
        const title = `単発の面談 ${Date.now()}`
        const start = fromNextMonday(0)
        await openFirstDay(
          page,
          LOGIN_STAFF.id,
          start,
          '予定の作成で「繰り返し」を「繰り返さない」のまま作ると、改修前と同じく単発の予定ができ、次の週の同じ曜日には出ない',
          '月曜',
        )

        await step(
          page,
          `「予定を作成」を押し、通常の予定で、タイトルに「${title}」、予定者に ${LOGIN_STAFF.name} を入れる`,
          () => fillNormal(page, title, LOGIN_STAFF.id),
        )
        await check(
          page,
          '項目の一覧の日時の下の「繰り返し」が「繰り返さない」のまま',
          async () => {
            await expect(page.getByTestId('schedule-field-date-time')).toBeVisible()
            // 改修前は「繰り返し」の項目が無い。項目があれば「繰り返さない」であることを見る
            await expect(
              page.getByTestId('schedule-field-recurrence').filter({ hasNotText: '繰り返さない' }),
            ).toHaveCount(0)
          },
        )
        await step(page, '「作成」を押す', async () => {
          await page.getByTestId('schedule-create-submit').click()
          await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
        })
        await checkDay(page, LOGIN_STAFF.id, start, title, true)
        await checkDay(page, LOGIN_STAFF.id, fromNextMonday(7), title, false)
      },
    )
  })

  test.describe(`予定の作成の繰り返し（${OKADA.staff.name}、予定を Google カレンダーで管理している事業所のマネージャー）`, () => {
    test.use({ storageState: OKADA_STATE })

    // 改修前は予定の作成に繰り返しが無いので、改修前と比べない
    test('schedule-create-recurring-google-primary 予定を Google カレンダーで管理している事業所で繰り返しの予定を作った場合、Google カレンダーに繰り返しの予定ができること', async ({
      page,
      request,
    }) => {
      const title = `週 2 回の打ち合わせ ${Date.now()}`
      const start = fromNextMonday(0)
      const endDate = fromNextMonday(10)
      const expected = [start, fromNextMonday(3), fromNextMonday(7), endDate]
      // 撮った予定は、録画する画面を開き直さずに API で消すので、消える様子は映らない
      try {
        await openFirstDay(
          page,
          OKADA.staff.id,
          start,
          '予定を Google カレンダーで管理している事業所で、予定の作成から毎週の月曜と木曜の繰り返しの予定を作ると、Google カレンダー（calendarpit）に繰り返しの予定ができ、回が buddy と同じ日に出る',
          '月曜',
        )

        await step(
          page,
          `「予定を作成」を押し、通常の予定で、タイトルに「${title}」、予定者に ${OKADA.staff.name} を入れる`,
          () => fillNormal(page, title, OKADA.staff.id),
        )
        await step(
          page,
          `「繰り返し」を押して「繰り返しの予定にする」を選び、「カスタム…」で曜日の「木」を足し、終了日を「あり」の ${endDate} にして、「作成」を押す`,
          async () => {
            await chooseMondayThursdayUntil(page, endDate)
            await page.getByTestId('schedule-create-submit').click()
            await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
          },
        )

        await checkDay(page, OKADA.staff.id, start, title, true)
        await checkDay(page, OKADA.staff.id, fromNextMonday(3), title, true)

        let rrule: string | undefined
        await step(
          page,
          `Google カレンダーの代わりの calendarpit の管理の画面で、${OKADA.calendarId} の ${start}（最初の回の月曜）を開く`,
          async () => {
            await expect
              .poll(() =>
                googleInstanceDates(request, OKADA.calendarId, title, start, fromNextMonday(21)),
              )
              .toEqual(expected)
            const written = (await listGoogleEvents(request, OKADA.calendarId)).filter(
              (event) => event.summary === title,
            )
            expect(written).toHaveLength(1)
            rrule = written[0]?.recurrence?.find((line) => line.startsWith('RRULE:'))
            expect(rrule).toContain('FREQ=WEEKLY')
            expect(rrule).toContain('BYDAY=MO,TH')
            await page.goto(
              `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(OKADA.calendarId)}&date=${start}`,
            )
          },
        )
        await check(
          page,
          [
            `calendarpit に「${title}」が出る`,
            `（撮影のため、録画に映らない Calendar API の値を出す）予定は 1 件で、繰り返しは ${rrule}`,
            `${start} から 3 週の回は ${expected.join('、')} で、buddy と同じ`,
          ].join('\n'),
          () => expect(calendarpitEvent(page, title)).toBeVisible(),
        )
      } finally {
        for (const event of await listGoogleEvents(request, OKADA.calendarId)) {
          if (event.summary === title) await deleteGoogleEvent(request, OKADA.calendarId, event.id)
        }
      }
    })
  })
})
