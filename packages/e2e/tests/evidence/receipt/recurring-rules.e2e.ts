import { writeFile } from 'node:fs/promises'

import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'

import { issueAccessToken } from '../../fixtures/apiReference'
import { check, intro, step } from '../../fixtures/caption'
import { CALENDARPIT_URL, LEADER, LOGIN_EMAIL, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { registerPatient } from '../../fixtures/patient'
import { dayLabel } from '../../fixtures/date'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { STAFF_FORM } from '../../fixtures/staff'
import { linkStaffCalendar, unlinkStaffCalendar } from '../../setup/calendar'
import { showAllReceiptRows } from '../../screens/receipt'
import { calendarpitEvent } from '../../selectors/calendarpit'
import { receiptCategoryRowCells, receiptResultRow } from '../../selectors/receipt'
import { calendarTimeLabel } from '../../selectors/scheduleCalendar'

// 照合の API は、compose/receipt-calendars.json の森のカレンダーを calendarpit から読む。
// buddy を正本にする 1 つ目の事業所で森に Google カレンダーを結び付けると、予定の API が森の繰り返しの予定を RRULE で書き出す。
// 書き出しの RRULE は、Google カレンダーを正本にする事業所の書き込みと同じ処理で作る（ADR-0039）。
const MORI = LEADER.staff
const MORI_CALENDAR = 'kenta.mori@example.com'
const END_DATE = '2027-01-31'
const MONTHS = ['2026-12', '2027-01'] as const

/** 確認する繰り返しの規則。最初の日付は規則の回に当たる日にし、終了日は END_DATE にする。 */
const RULES = [
  {
    key: 'weekly-mon-thu',
    label: '毎週の月曜と木曜',
    patient: '毎週月木',
    start: '2026-12-03',
    time: '09:00',
    interval: 1,
    days: [1, 4],
    dates: [
      '2026-12-03',
      '2026-12-07',
      '2026-12-10',
      '2026-12-14',
      '2026-12-17',
      '2026-12-21',
      '2026-12-24',
      '2026-12-28',
      '2026-12-31',
      '2027-01-04',
      '2027-01-07',
      '2027-01-11',
      '2027-01-14',
      '2027-01-18',
      '2027-01-21',
      '2027-01-25',
      '2027-01-28',
    ],
  },
  {
    key: 'biweekly-tue',
    label: '隔週の火曜',
    patient: '隔週火',
    start: '2026-12-01',
    time: '11:00',
    interval: 2,
    days: [2],
    dates: ['2026-12-01', '2026-12-15', '2026-12-29', '2027-01-12', '2027-01-26'],
  },
  {
    key: 'biweekly-mon-thu',
    label: '隔週の月曜と木曜',
    patient: '隔週月木',
    start: '2026-12-03',
    time: '14:00',
    interval: 2,
    days: [1, 4],
    dates: [
      '2026-12-03',
      '2026-12-14',
      '2026-12-17',
      '2026-12-28',
      '2026-12-31',
      '2027-01-11',
      '2027-01-14',
      '2027-01-25',
      '2027-01-28',
    ],
  },
  {
    // 日曜を含む隔週は、WKST が日曜か月曜かで回が変わる。月曜始まりなら、12-06 の次の回が 12-16 になる
    key: 'biweekly-sun-wed',
    label: '隔週の日曜と水曜',
    patient: '隔週日水',
    start: '2026-12-06',
    time: '16:00',
    interval: 2,
    days: [3, 7],
    dates: [
      '2026-12-06',
      '2026-12-09',
      '2026-12-20',
      '2026-12-23',
      '2027-01-03',
      '2027-01-06',
      '2027-01-17',
      '2027-01-20',
      '2027-01-31',
    ],
  },
] as const

type Rule = (typeof RULES)[number]

/** 予定のカレンダーの週の表示を、2026-11-29 の週から END_DATE の週まで 1 週ずつ開くための日曜の日付。 */
const WEEK_STARTS = Array.from({ length: 10 }, (_, i) =>
  new Date(Date.UTC(2026, 10, 29 + i * 7)).toISOString().slice(0, 10),
)

/** YYYY-MM-DD を `12/03` の形にする。字幕を短くするのに使う。 */
const short = (date: string) => date.slice(5).replace('-', '/')

const datesText = (dates: readonly string[]) => dates.map(short).join(' ')

/** 走らせるたびに違う利用者の名前。照合の結果の行を、利用者名で前の撮影の予定と分ける。 */
const patientNames = () => {
  const stamp = String(Date.now()).slice(-6)
  return Object.fromEntries(RULES.map((rule) => [rule.key, `${rule.patient} ${stamp}`])) as Record<
    Rule['key'],
    string
  >
}

/** 照合の結果の表の利用者名。照合は利用者名の空白を全て除く。 */
const receiptName = (name: string) => name.replaceAll(' ', '')

/** 規則ごとの利用者を登録し、森に Google カレンダーを結び付ける。利用者の ID を規則の key で返す。 */
const prepare = async (page: Page, names: Record<Rule['key'], string>) => {
  const token = await issueAccessToken(page.request, LOGIN_EMAIL)
  const ids = {} as Record<Rule['key'], string>
  for (const rule of RULES) {
    const res = await registerPatient(page.request, token, STAFF_FORM.facilityId, {
      name: names[rule.key],
      assignedStaffId: MORI.id,
    })
    expect(res.status()).toBe(201)
    ids[rule.key] = ((await res.json()) as { id: string }).id
  }
  await linkStaffCalendar(page, MORI.id)
  return ids
}

/** 予定の作成から、森の rule の繰り返しの訪問の予定（訪看I3、45 分）を、利用者 patientId で作る。 */
const createVisitRule = async (page: Page, rule: Rule, patientId: string) => {
  await page.goto(`/schedule?view=week&date=${rule.start}`)
  await expect(calendarTimeLabel(page, '06:00:00')).toBeVisible()
  await page.getByTestId('schedule-create-open').click()
  await expect(page.getByTestId('schedule-form-modal')).toBeVisible()
  await page.getByTestId('schedule-kind-tab-visit').check()
  await page.getByTestId('schedule-field-patient').click()
  await page.getByTestId(`patient-select-option-${patientId}`).check()
  await page.getByTestId('schedule-field-staff').click()
  await page.getByTestId(`staff-select-option-${MORI.id}`).check()
  await page.getByTestId('schedule-field-date-time').click()
  // 利用者を選ぶと、サービスコードが利用者の値に変わるので、選んだ後に訪看I3 にする
  await page.getByTestId('service-code-訪看I3').check()
  await page.getByTestId('schedule-form-date').fill(rule.start)
  await page.getByTestId('schedule-form-start-time').fill(rule.time)
  await page.getByTestId('schedule-form-service-time').fill('45')
  await page.getByTestId('schedule-field-recurrence').click()
  await page.getByTestId('schedule-form-repeats').check()
  await page.getByTestId('recurring-rule-preset').selectOption('custom')
  for (const day of [1, 2, 3, 4, 5, 6, 7]) {
    const box = page.getByTestId(`recurring-rule-day-of-week-${day}`)
    if ((rule.days as readonly number[]).includes(day)) await box.check()
    else await box.uncheck()
  }
  await page.getByTestId('recurring-rule-interval').fill(String(rule.interval))
  await page.getByTestId('recurring-rule-ends-on').check()
  await page.getByTestId('recurring-rule-end-date').fill(END_DATE)
  await page.getByTestId('schedule-create-submit').click()
  await expect(page.getByTestId('schedule-form-modal')).toBeHidden()
}

/**
 * 規則ごとの利用者の繰り返しの回が、予定のカレンダーで rule.dates の日だけに出ることを確認する。
 * WEEK_STARTS の週ごとに週の表示で回の数を数え、rule.dates の日ごとに日の表示で森の列に回が 1 つ出ることを見る。
 */
const expectBuddyOccurrences = async (page: Page, names: Record<Rule['key'], string>) => {
  const visits = (scope: Locator, rule: Rule) =>
    scope.getByTestId(/^schedule-event-/).filter({ hasText: names[rule.key] })
  for (const week of WEEK_STARTS) {
    await page.goto(`/schedule?view=week&date=${week}`)
    await expect(calendarTimeLabel(page, '06:00:00')).toBeVisible()
    const weekEnd = new Date(Date.parse(`${week}T00:00:00Z`) + 6 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    for (const rule of RULES) {
      const count = rule.dates.filter((date) => date >= week && date <= weekEnd).length
      await expect(visits(page.getByTestId('schedule-calendar'), rule)).toHaveCount(count)
    }
  }
  for (const rule of RULES) {
    for (const date of rule.dates) {
      await page.goto(`/schedule?view=day&date=${date}`)
      const column = page.getByTestId(`day-grid-staff-${MORI.id}`)
      await expect(visits(column, rule)).toHaveCount(1)
    }
  }
}

/** calendarpit の Calendar API（events.list の singleEvents）が返す、森のカレンダーの summary の回の日付。 */
const googleDates = async (request: APIRequestContext, summary: string) => {
  const res = await request.get(
    `${CALENDARPIT_URL}/__calendarpit/calendars/${encodeURIComponent(MORI_CALENDAR)}/events`,
    {
      params: {
        singleEvents: true,
        maxResults: 2500,
        timeMin: '2026-11-29T00:00:00+09:00',
        timeMax: '2027-02-07T00:00:00+09:00',
      },
    },
  )
  expect(res.ok()).toBe(true)
  const { items = [] } = (await res.json()) as {
    items?: { summary?: string; start?: { dateTime?: string } }[]
  }
  return items
    .filter((item) => item.summary === summary)
    .map((item) => item.start?.dateTime?.slice(0, 10) ?? '')
    .sort()
}

/** 予定の API が書き出す訪問の予定のタイトル。 */
const visitSummary = (name: string) => `【訪看I3】${name}`

/**
 * month（YYYY-MM）の全ての規則の回に合う実績の CSV を書き、パスを返す。
 * 照合は、訪看I３ の予定の終了時間と提供時間を 1 分減らして比べるので、実績は 44 分にする。
 */
const writeVisits = async (month: string, names: Record<Rule['key'], string>) => {
  const lines = [
    '訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者,加算①,加算②,加算③,加算④,加算⑤',
  ]
  for (const rule of RULES) {
    const [h, m] = rule.time.split(':').map(Number) as [number, number]
    const end = `${h}:${String(m + 44).padStart(2, '0')}`
    for (const date of rule.dates.filter((d) => d.startsWith(month))) {
      lines.push(
        `${date.replaceAll('-', '/')},${names[rule.key]},${h}:${String(m).padStart(2, '0')},${end},44,訪看I３,${MORI.name},通常,,,,`,
      )
    }
  }
  const file = test.info().outputPath(`visits-${month}.csv`)
  await writeFile(file, `${lines.join('\r\n')}\r\n`)
  return file
}

/** 森のカレンダーに、全ての規則の回が書き出されるまで待つ。書き出しは予定の作成と別の処理が行う。 */
const waitForExport = async (request: APIRequestContext, names: Record<Rule['key'], string>) => {
  for (const rule of RULES) {
    await expect.poll(() => googleDates(request, visitSummary(names[rule.key]))).toEqual(rule.dates)
  }
}

test.describe('照合の結果', () => {
  test.describe(`複数の曜日と隔週の繰り返しの予定（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('receipt-recurring-rule-occurrences 複数の曜日と隔週の繰り返しの訪問の予定を画面から作った場合、calendarpit の回が予定のカレンダーの回と同じ日に出ること', async ({
      browser,
      context,
      request,
    }) => {
      const names = patientNames()
      const ids = await prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, (prep) =>
        prepare(prep, names),
      )

      const page = await context.newPage()
      try {
        await page.goto(`/schedule?view=week&date=${RULES[0].start}`)
        await expect(calendarTimeLabel(page, '06:00:00')).toBeVisible()
        await intro(
          page,
          `森 健太に毎週の月曜と木曜、隔週の火曜、隔週の月曜と木曜、隔週の日曜と水曜の訪問の予定を画面から作ると、calendarpit の回が、予定のカレンダーの回と、2026 年 12 月と 2027 年 1 月の全ての日で一致する\n前提 ${MORI.name} の Google カレンダーを結び付け、規則ごとの利用者を登録してある`,
        )
        for (const rule of RULES) {
          await step(
            page,
            [
              `「予定を作成」で、訪問の予定（訪看I3）を ${names[rule.key]} と ${MORI.name} で作る`,
              `日付 ${rule.start}、${rule.time} から 45 分、「カスタム…」で${rule.label}（間隔 ${rule.interval}）、終了日 ${END_DATE}`,
            ].join('\n'),
            () => createVisitRule(page, rule, ids[rule.key]),
          )
        }

        await step(
          page,
          '予定のカレンダーの週の表示を、2026-11-29 の週から 2027-01-31 の週まで開き、規則ごとの回の日を読む',
          async () => {
            await expectBuddyOccurrences(page, names)
            await waitForExport(request, names)
          },
        )
        await step(
          page,
          '（撮影のため、4 つの規則の回が並ぶ 2026-12-06 の週を開き直す）',
          async () => {
            await page.goto(`/schedule?view=week&date=${RULES[3].start}`)
            await expect(calendarTimeLabel(page, '06:00:00')).toBeVisible()
          },
        )
        const lines = RULES.map(
          (rule) => `${rule.label}（${rule.dates.length} 回）: ${datesText(rule.dates)}`,
        )
        await check(
          page,
          [
            '（撮影のため、週の表示と Calendar API で読んだ回の日を出す）予定のカレンダーと calendarpit の回の日が、規則ごとに全て同じ',
            ...lines,
          ].join('\n'),
          async () => {
            for (const rule of RULES) {
              const google = await googleDates(request, visitSummary(names[rule.key]))
              expect(google).toEqual(rule.dates)
            }
          },
        )

        const sunday = RULES[3]
        await step(
          page,
          `Google カレンダーの代わりの calendarpit の管理の画面で、${MORI_CALENDAR} の ${sunday.start}（日曜、${sunday.label}の最初の回）を開く`,
          async () => {
            await page.goto(
              `${CALENDARPIT_URL}/?calendar=${encodeURIComponent(MORI_CALENDAR)}&date=${sunday.start}`,
            )
          },
        )
        await check(
          page,
          `calendarpit の ${sunday.start}（日曜）に「${visitSummary(names[sunday.key])}」が出る`,
          () => expect(calendarpitEvent(page, visitSummary(names[sunday.key]))).toBeVisible(),
        )
      } finally {
        await step(page, '（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）', () =>
          unlinkStaffCalendar(page, MORI.id),
        )
      }
    })

    test('receipt-recurring-rule-check 複数の曜日と隔週の繰り返しの予定の回に合う実績で照合した場合、全ての回が整合の行に出て、ほかの区分に出ないこと', async ({
      browser,
      context,
      request,
    }) => {
      const names = patientNames()
      const files = await prepareOutsideRecording(
        browser,
        { storageState: LOGIN_STATE },
        async (prep) => {
          const ids = await prepare(prep, names)
          for (const rule of RULES) await createVisitRule(prep, rule, ids[rule.key])
          await waitForExport(request, names)
          const written = { '2026-12': '', '2027-01': '' } as Record<
            (typeof MONTHS)[number],
            string
          >
          for (const month of MONTHS) written[month] = await writeVisits(month, names)
          return written
        },
      )

      const page = await context.newPage()
      try {
        await page.goto('/receipt')
        await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
        await intro(
          page,
          `毎週の月曜と木曜、隔週の火曜、隔週の月曜と木曜、隔週の日曜と水曜の訪問の予定の回に合う実績で、2026 年 12 月と 2027 年 1 月を照合すると、全ての回が整合の行に出て、ほかの区分に出ない\n前提 ${MORI.name} に、4 つの規則の訪問の予定（訪看I3、45 分、${END_DATE} まで）を画面から作り、calendarpit の森のカレンダーに書き出されてある`,
        )
        for (const month of MONTHS) {
          const expected = RULES.flatMap((rule) =>
            rule.dates.filter((date) => date.startsWith(month)).map((date) => ({ rule, date })),
          )
          await step(
            page,
            [
              `予定の取り方に「Google カレンダー」を選び、対象の月に ${month} を入れる`,
              `実績の CSV に、${month} の全ての回（${expected.length} 件）の実績を選び、「照合する」を押す`,
            ].join('\n'),
            async () => {
              await page.goto('/receipt')
              await page.getByTestId('receipt-source-calendar').check()
              await page.getByTestId('receipt-month').fill(month)
              await page.getByTestId('receipt-visits-file').setInputFiles(files[month])
              await page.getByTestId('receipt-check-submit').click()
              await expect(page).toHaveURL(/\/receipt\/result$/)
              await showAllReceiptRows(page)
            },
          )

          const lines = RULES.map(
            (rule) => `${rule.label}: ${expected.filter((item) => item.rule === rule).length} 件`,
          )
          await check(
            page,
            [
              `${month} の 4 つの規則の回が全て「整合データ」に出て、不整合、予定のみ、実績のみに 4 つの規則の利用者の行が無い（ほかの行は、calendarpit の森のカレンダーに元からある予定）`,
              ...lines,
            ].join('\n'),
            async () => {
              for (const { rule, date } of expected) {
                await expect(
                  receiptCategoryRowCells(
                    page,
                    'match',
                    `${date.slice(0, 4)}年${dayLabel(date)}`,
                    receiptName(names[rule.key]),
                  ),
                ).not.toHaveCount(0)
              }
              for (const rule of RULES) {
                const count = expected.filter((item) => item.rule === rule).length
                await expect(receiptResultRow(page, receiptName(names[rule.key]))).toHaveCount(
                  count,
                )
              }
              await page.getByTestId('receipt-category-match').scrollIntoViewIfNeeded()
            },
          )
        }
      } finally {
        await step(page, '（撮影のため、ほかの撮影の前提に戻すよう、結び付けを外す）', () =>
          unlinkStaffCalendar(page, MORI.id),
        )
      }
    })
  })
})
