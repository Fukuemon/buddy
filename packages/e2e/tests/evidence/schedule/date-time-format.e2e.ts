import { expect, test, type Locator, type Page } from '@playwright/test'

import type { Recording } from '@fukuemon/e2e-kit/recording'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'

const ACTOR = 'ログインなし（Storybook の story）'

/** 字幕の帯に隠れないように、story の中身を下へずらす。撮影のための操作である。 */
const shiftStory = (page: Page) =>
  page.addStyleTag({ content: '#storybook-root { padding-top: 72px; }' })

/** 1 つの story で撮る場面。testid の要素が見えるのを待ち、画面の中ほどに送ってから撮る。 */
type Shot = {
  /** story の ID。stay が true なら、前の場面の story を開いたまま撮る */
  story: string
  /** 前の場面の story を開き直さずに撮る */
  stay?: boolean
  /** 開いた画面の字幕 */
  opened: string
  /** 見えるのを待ち、画面に入れる要素 */
  target: (page: Page) => Locator
  /** 撮る前に選ぶ絞り込みの欄と値 */
  select?: { field: (page: Page) => Locator; value: string }
  /** 撮る前に押す要素 */
  click?: (page: Page) => Locator
  /** 撮る場面の字幕。改修前と改修後で出る文言の例を入れる */
  check: { before: string; after: string }
}

/** 場面を順に開いて撮る。改修前と改修後で、同じ順に同じ数だけ check を呼ぶ。 */
const shoot = async (
  { page, step, check }: Recording,
  shots: readonly Shot[],
  isBefore: boolean,
) => {
  for (const shot of shots) {
    if (shot.stay !== true) {
      await page.goto(storyUrl(shot.story))
      await shiftStory(page)
    }
    if (shot.select !== undefined) {
      await expect(shot.select.field(page)).toBeVisible()
      await step(shot.opened)
      await shot.select.field(page).selectOption(shot.select.value)
    } else if (shot.click !== undefined) {
      await expect(shot.click(page)).toBeVisible()
      await step(shot.opened)
      await shot.click(page).check()
    } else {
      await expect(shot.target(page).first()).toBeVisible()
      await step(shot.opened)
    }
    const target = shot.target(page).first()
    await expect(target).toBeVisible()
    // 字幕の帯に隠れないように、画面の中ほどに送る。カレンダーの格子のように中で送る箱にも効く
    await target.evaluate((element) => element.scrollIntoView({ block: 'center' }))
    await check(isBefore ? `改修前: ${shot.check.before}` : shot.check.after)
  }
}

const SCHEDULE_SCREENS: readonly Shot[] = [
  {
    story: '画面-schedule-scheduleformmodal--visit',
    opened: '予定の作成のダイアログ（Storybook の ScheduleFormModal の Visit）を開いている',
    target: (page) => page.getByTestId('schedule-field-date-time'),
    check: {
      before: '左の要約の「訪問日時」が「2026-10-20 09:00 - 09:29」の形で出る',
      after: '左の要約の「訪問日時」が「2026年10月20日（火） 09:00〜09:29」の形で出る',
    },
  },
  {
    story: '画面-schedule-scheduleformmodal--normal',
    opened:
      '通常の予定の作成のダイアログ（Storybook の ScheduleFormModal の Normal）を開き、「終了は翌日」を選ぶ',
    target: (page) => page.getByTestId('schedule-field-date-time'),
    click: (page) => page.getByTestId('schedule-form-ends-next-day'),
    check: {
      before:
        '左の要約の「予定日時」が、翌日に終わる予定を「2026-10-20 09:00 - 翌 10:00」の形で出す',
      after:
        '左の要約の「予定日時」が、翌日に終わる予定を「2026年10月20日（火） 09:00〜翌 10:00」の形で出す',
    },
  },
  {
    story: '画面-schedule-scheduledetailmodal--visit',
    opened: '予定の詳細（Storybook の ScheduleDetailModal の Visit）を開いている',
    target: (page) => page.getByTestId('schedule-detail-datetime'),
    check: {
      before: '詳細の日時が「2026年10月20日（火） 09:00〜09:29」の形で出る',
      after: '詳細の日時が「2026年10月20日（火） 09:00〜09:29」の形で出る',
    },
  },
  {
    story: '画面-calendar-calendarreviewcontainer--default',
    opened: '確認が必要な予定（Storybook の CalendarReviewContainer の Default）を開いている',
    target: (page) => page.getByTestId('calendar-review-datetime-export-1'),
    check: {
      before:
        '予定の日時が「2026/11/04（水）09:00〜09:29」、確認の日時が「2026/10/22 10:00」の形で出る',
      after:
        '予定の日時が「2026年11月4日（水） 09:00〜09:29」、確認の日時が「2026年10月22日（木） 10:00」の形で出る',
    },
  },
]

const CALENDAR: readonly Shot[] = [
  {
    story: '画面-schedule-schedulecalendarcontainer--week',
    opened:
      '予定のカレンダーの週の表示（Storybook の ScheduleCalendarContainer の Week）を開いている。(撮影のため、9 時の予定まで送る)',
    target: (page) => page.getByTestId('schedule-event-schedule-1'),
    check: {
      before: '週の表示の予定の時刻が「9:00 - 9:29」の形で出る',
      after: '週の表示の予定の時刻が「09:00〜09:29」の形で出る',
    },
  },
  {
    story: '画面-schedule-schedulecalendarcontainer--week',
    stay: true,
    opened: '(撮影のため、週の表示を翌日に終わる夜勤の予定まで送る)',
    target: (page) => page.getByTestId('schedule-event-schedule-7'),
    check: {
      before: '週の表示の翌日に終わる予定が「22:00 - 翌 1:00」の形で出る',
      after: '週の表示の翌日に終わる予定が「22:00〜翌 01:00」の形で出る',
    },
  },
  {
    story: '画面-schedule-schedulecalendarcontainer--day',
    opened:
      '予定のカレンダーの日の表示（Storybook の ScheduleCalendarContainer の Day）を開いている。(撮影のため、9 時の予定まで送る)',
    target: (page) => page.getByTestId('schedule-event-schedule-1'),
    check: {
      before: '日の表示の予定の時刻が「09:00-09:29」の形で出る',
      after: '日の表示の予定の時刻が「09:00〜09:29」の形で出る',
    },
  },
  {
    story: '画面-schedule-schedulecalendarcontainer--day',
    stay: true,
    opened: '(撮影のため、日の表示を翌日に終わる夜勤の予定まで送る)',
    target: (page) => page.getByTestId('schedule-event-schedule-7'),
    check: {
      before: '日の表示の翌日に終わる予定が「22:00-翌 01:00」の形で出る',
      after: '日の表示の翌日に終わる予定が「22:00〜翌 01:00」の形で出る',
    },
  },
  {
    story: '画面-schedule-scheduleweekagenda--default',
    opened: '幅の狭い週の一覧（Storybook の ScheduleWeekAgenda の Default）を開いている',
    target: (page) => page.getByTestId('schedule-agenda-day-2026-10-20'),
    check: {
      before: '予定の時刻が「9:00 - 9:29」、翌日に終わる予定が「22:00 - 翌 1:00」の形で出る',
      after: '予定の時刻が「09:00〜09:29」、翌日に終わる予定が「22:00〜翌 01:00」の形で出る',
    },
  },
]

const STAFF_PATIENT: readonly Shot[] = [
  {
    story: '画面-staff-stafflistcontainer--default',
    opened: '職員の一覧（Storybook の StaffListContainer の Default）を開き、状態を「休職」に絞る',
    target: (page) => page.getByTestId('staff-list-leave-return-staff-2'),
    select: { field: (page) => page.getByTestId('staff-list-filter-status'), value: 'on_leave' },
    check: {
      before: '戻る予定の日が「2027/04/01 に戻る予定」の形で出る',
      after: '戻る予定の日が「2027年4月1日（木）に戻る予定」の形で出る',
    },
  },
  {
    story: '画面-staff-stafflistcontainer--default',
    opened: '職員の一覧（Storybook の StaffListContainer の Default）を開き、状態を「退職」に絞る',
    target: (page) => page.getByTestId('staff-list-retired-on-staff-4'),
    select: { field: (page) => page.getByTestId('staff-list-filter-status'), value: 'retired' },
    check: {
      before: '退職した日が「2026/09/30 に退職」の形で出る',
      after: '退職した日が「2026年9月30日（水）に退職」の形で出る',
    },
  },
  {
    story: '画面-staff-staffdetailcontainer--on-leave',
    opened: '休職中の職員の詳細（Storybook の StaffDetailContainer の OnLeave）を開いている',
    target: (page) => page.getByTestId('staff-detail-status-text'),
    check: {
      before:
        '状態が「休職（2027/04/01 に戻る予定）」、休職の文が「2026/11/09 から休職です。」の形で出る',
      after:
        '状態が「休職（2027年4月1日（木）に戻る予定）」、休職の文が「2026年11月9日（月）から休職です。」の形で出る',
    },
  },
  {
    story: '画面-patient-patientlistcontainer--default',
    opened:
      '利用者の一覧（Storybook の PatientListContainer の Default）を開き、状態を「利用の終了」に絞る',
    target: (page) => page.getByTestId('patient-list-ended-on-patient-ended'),
    select: { field: (page) => page.getByTestId('patient-list-filter-status'), value: 'ended' },
    check: {
      before: '利用の終了にした日が「2026/10/01 に利用の終了」の形で出る',
      after: '利用の終了にした日が「2026年10月1日（木）に利用の終了」の形で出る',
    },
  },
]

const CALENDAR_IMPORT: readonly Shot[] = [
  {
    story: '画面-calendar-calendarimportpreview--preview',
    opened:
      '予定の取り込みのプレビュー（Storybook の CalendarImportPreview の Preview）を開いている',
    target: (page) => page.getByTestId('schedule-import-help'),
    check: {
      before:
        'プレビューの期間が「2026/11/01〜2026/11/30」、確認が必要な予定の日時が「2026/11/09（月）14:00〜14:30」の形で出る',
      after:
        'プレビューの期間が「2026年11月1日（日）〜2026年11月30日（月）」、確認が必要な予定の日時が「2026年11月9日（月） 14:00〜14:30」の形で出る',
    },
  },
  {
    story: '画面-calendar-calendarimportpreview--preview',
    stay: true,
    opened: '(撮影のため、取り込まない予定の表まで送る)',
    target: (page) => page.getByTestId('calendar-import-skipped'),
    check: {
      before: '取り込まない予定の日時が「2026/11/12（木）17:00〜翌 09:00」の形で出る',
      after: '取り込まない予定の日時が「2026年11月12日（木） 17:00〜翌 09:00」の形で出る',
    },
  },
  {
    story: '画面-calendar-calendarlinkcontainer--default',
    opened: 'カレンダーの連携（Storybook の CalendarLinkContainer の Default）を開いている',
    target: (page) => page.getByTestId('calendar-link-row-staff-1'),
    check: {
      before: '最後の取り込みが「2026/10/15 10:00（2026/10/01〜2026/10/31）」の形で出る',
      after:
        '最後の取り込みが「2026年10月15日（木） 10:00（2026年10月1日（木）〜2026年10月31日（土））」の形で出る',
    },
  },
  {
    story: '画面-calendar-calendarcutovercontainer--open',
    opened:
      '予定の正本の切り替え中の画面（Storybook の CalendarCutoverContainer の Open）を開いている',
    target: (page) => page.getByTestId('calendar-cutover-open'),
    check: {
      before: '取り込みの期間が「2026/11/01〜」、最後の同期が「2026/11/05 09:59」の形で出る',
      after:
        '取り込みの期間が「2026年11月1日（日）〜」、最後の同期が「2026年11月5日（木） 09:59」の形で出る',
    },
  },
]

const RECEIPT_RESULT: readonly Shot[] = [
  {
    story: '画面-receipt-receiptresultview--default',
    opened:
      '照合の結果（Storybook の ReceiptResultView の Default）を開き、(撮影のため、結果の表まで送る)',
    target: (page) => page.getByTestId('receipt-category-schedule_only'),
    check: {
      before: '表の訪問日の列が「2024-04-01」の形で出る',
      after: '表の訪問日の列が「2024年4月1日（月）」の形で出る',
    },
  },
]

const VIEWPOINTS = [
  {
    name: 'date-time-schedule-screens',
    test: '予定の作成と詳細と確認が必要な予定を開いた場合、日付と時刻の範囲が規則の形で出ること',
    title: '予定の作成の要約、予定の詳細、確認が必要な予定の、日付と時刻の範囲の書き方を見る',
    shots: SCHEDULE_SCREENS,
  },
  {
    name: 'date-time-calendar',
    test: '予定のカレンダーの週と日の表示と週の一覧を開いた場合、予定の時刻の範囲が規則の形で出ること',
    title: '予定のカレンダーの週の表示、日の表示、週の一覧の、予定の時刻の範囲の書き方を見る',
    shots: CALENDAR,
  },
  {
    name: 'date-time-staff-patient',
    test: '職員と利用者の一覧と職員の詳細を開いた場合、休職と退職と利用の終了の日付が規則の形で出ること',
    title: '職員の一覧と詳細、利用者の一覧の、休職、退職、利用の終了の日付の書き方を見る',
    shots: STAFF_PATIENT,
  },
  {
    name: 'date-time-calendar-import',
    test: '予定の取り込みとカレンダーの連携と正本の切り替えを開いた場合、期間と日時が規則の形で出ること',
    title: '予定の取り込み、カレンダーの連携、予定の正本の切り替えの、期間と日時の書き方を見る',
    shots: CALENDAR_IMPORT,
  },
  {
    name: 'date-time-receipt-result',
    test: '照合の結果を開いた場合、表の訪問日が規則の形で出ること',
    title: '照合の結果の表の、訪問日の書き方を見る',
    shots: RECEIPT_RESULT,
  },
] as const

test.describe('画面の日付と時刻', () => {
  test.describe('日付と時刻の範囲の書き方', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      const isBefore = variant.name === 'before'

      for (const viewpoint of VIEWPOINTS) {
        test(`${prefix}${viewpoint.test}`, async ({ browser }) => {
          const first = storyUrl(viewpoint.shots[0]!.story)
          await recordPrEvidence(
            browser,
            { name: viewpoint.name, title: viewpoint.title, actor: ACTOR, variant },
            async (page) => {
              await page.goto(first)
            },
            (recording) => shoot(recording, viewpoint.shots, isBefore),
          )
        })
      }
    }
  })
})
