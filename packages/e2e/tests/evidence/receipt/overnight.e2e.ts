import { writeFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LEADER, LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { createGoogleEvent } from '../../fixtures/googleCalendar'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { showAllReceiptRows } from '../../screens/receipt'
import { receiptCategoryRowCells } from '../../selectors/receipt'
import { scrollToRightEnd } from '../../widgets/scroll/actions/scroll'

const SCHEDULE_HEADER = '訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者'
const VISIT_HEADER =
  '訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者,加算①,加算②,加算③,加算④,加算⑤'

const csv = (...lines: string[]) => [...lines, ''].join('\n')

/** 23:00 に始まり翌日の 0:30 に終わる、利用者A の 医 の予定と実績。90 分は 医 の許容範囲（30〜90 分）に入る。 */
const OVERNIGHT_SCHEDULES = csv(SCHEDULE_HEADER, '2024/04/01,利用者A,23:00,00:30,90,医,職員B')
const OVERNIGHT_VISITS = csv(VISIT_HEADER, '2024/04/01,利用者A,23:00,0:30,90,医,職員B,深夜,,,,')

/** 利用者C の日をまたがない予定と実績に、22:00 に始まり翌日の 1:00 に終わる利用者D の実績を 1 行足す。 */
const VISIT_ONLY_SCHEDULES = csv(SCHEDULE_HEADER, '2024/04/01,利用者C,10:00,10:30,30,医,職員B')
const VISIT_ONLY_VISITS = csv(
  VISIT_HEADER,
  '2024/04/01,利用者C,10:00,10:30,30,医,職員B,通常,,,,',
  '2024/04/01,利用者D,22:00,1:00,180,医,職員B,深夜,,,,',
)

// 照合の API は、compose/receipt-calendars.json の森のカレンダーを calendarpit から読む。
const CALENDAR_MONTH = '2026-11'
/** 森のカレンダーに足す、23:00 に始まり翌日の 0:30 に終わる予定。compose の fixture の予定と日が重ならない。 */
const CALENDAR_EVENT = {
  summary: '【医】見本 一郎',
  date: '2026-11-20',
  start: '23:00',
  endDate: '2026-11-21',
  end: '00:30',
}
const CALENDAR_VISITS = csv(
  VISIT_HEADER,
  `2026/11/20,見本 一郎,23:00,0:30,90,医,${LEADER.staff.name},深夜,,,,`,
)

/** 照合の画面で、予定の CSV と実績の CSV を選んで照合し、結果の画面へ移る。 */
const checkWithCsv = async (page: Page, schedules: string, visits: string) => {
  await page.getByTestId('receipt-source-csv').check()
  await page.getByTestId('receipt-schedules-file').setInputFiles(schedules)
  await page.getByTestId('receipt-visits-file').setInputFiles(visits)
  await page.getByTestId('receipt-check-submit').click()
  await expect(page).toHaveURL(/\/receipt\/result$/)
}

/** 結果の表を右端まで送り、実績の側の列を見せる。 */
const scrollToVisitColumns = async (page: Page) => {
  await scrollToRightEnd(page.getByTestId('receipt-result-table'))
}

/** 照合の画面を開き、「照合する」が出るまで待つ。 */
const openReceipt = async (page: Page) => {
  await page.goto('/receipt')
  await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
}

test.describe('照合の結果', () => {
  test.describe(`日をまたぐ訪問（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('receipt-overnight-csv-match 予定と実績の両方に翌日に終わる行がある CSV で照合した場合、入力の誤りにならず開始の日の行が整合に入ること', async ({
      page,
    }, testInfo) => {
      const schedules = testInfo.outputPath('schedules.csv')
      const visits = testInfo.outputPath('visits.csv')
      await writeFile(schedules, OVERNIGHT_SCHEDULES)
      await writeFile(visits, OVERNIGHT_VISITS)

      await openReceipt(page)
      await intro(
        page,
        '予定と実績の両方に 23:00〜翌 0:30 の行がある CSV で照合すると、入力の誤りにならず、開始の日（4/1）の行として整合に入る\n前提 利用者A の予定と実績は、どちらも 4/1 の 23:00 に始まり翌日の 0:30 に終わる',
      )

      await step(page, '予定と実績のダミーの CSV を選び、照合する', async () => {
        await checkWithCsv(page, schedules, visits)
        await expect(page.getByTestId('receipt-check-error')).toHaveCount(0)
      })
      await step(page, '表示する行を「全ての行」に切り替える', () => showAllReceiptRows(page))
      const cells = receiptCategoryRowCells(page, 'match', '2024年4月1日（月）', '利用者A')
      const expected = [
        '2024年4月1日（月）',
        '利用者A',
        '職員B',
        '',
        '医',
        '23:00',
        '00:30',
        '90',
        '医',
        '23:00',
        '00:30',
        '90',
        '深夜',
      ]
      await check(
        page,
        '入力の誤りにならず、利用者A の 2024-04-01 の行が整合データに入り、予定の側は 23:00〜00:30 で印が無い',
        () => expect(cells).toHaveText(expected),
      )

      // 送る操作は止めが入らず、step の字幕が読めないので、次の判定の字幕に書く
      await scrollToVisitColumns(page)
      await check(
        page,
        '（撮影のため、結果の表を右端まで送り、実績の側の列を見せる）\n実績の側も 23:00〜00:30、90 分、加算は深夜で、印が無い',
        () => expect(cells).toHaveText(expected),
      )
    })

    test('receipt-overnight-visit-only 翌日に終わる行が実績にだけある CSV で照合した場合、照合の全体が止まらずその行が実績のみに入ること', async ({
      page,
    }, testInfo) => {
      const schedules = testInfo.outputPath('schedules.csv')
      const visits = testInfo.outputPath('visits.csv')
      await writeFile(schedules, VISIT_ONLY_SCHEDULES)
      await writeFile(visits, VISIT_ONLY_VISITS)

      await openReceipt(page)
      await intro(
        page,
        '22:00〜翌 1:00 の行が実績にだけある CSV で照合すると、照合の全体が止まらず、その行が実績のみに入る\n前提 実績の CSV にだけ、利用者D の 22:00 に始まり翌日の 1:00 に終わる行がある',
      )

      await step(page, '予定と実績のダミーの CSV を選び、照合する', async () => {
        await checkWithCsv(page, schedules, visits)
        await expect(page.getByTestId('receipt-check-error')).toHaveCount(0)
        await expect(page.getByTestId('receipt-category-visit_only')).toHaveText('実績のみ（1 件）')
      })
      await step(page, '表示する行を「全ての行」に切り替える', () => showAllReceiptRows(page))
      await check(
        page,
        '照合の全体が止まらずに結果の画面が開き、利用者C の日をまたがない行は整合データに入る',
        () =>
          expect(
            receiptCategoryRowCells(page, 'match', '2024年4月1日（月）', '利用者C'),
          ).toHaveCount(13),
      )

      const cells = receiptCategoryRowCells(page, 'visit_only', '2024年4月1日（月）', '利用者D')
      // 送る操作は止めが入らず、step の字幕が読めないので、次の判定の字幕に書く
      await scrollToVisitColumns(page)
      await check(
        page,
        '（撮影のため、結果の表を右端まで送り、実績の側の列を見せる）\n利用者D の 2024-04-01 の行が実績のみに入り、実績の側は 22:00〜01:00、180 分である',
        async () => {
          await expect(cells.nth(9)).toHaveText('22:00')
          await expect(cells.nth(10)).toHaveText('01:00')
          await expect(cells.nth(11)).toHaveText('180')
        },
      )
    })

    test('receipt-overnight-calendar Google カレンダーに翌日に終わる訪問の予定がある月で照合した場合、警告に出ず同じ訪問の実績と対になること', async ({
      browser,
      context,
    }, testInfo) => {
      const visits = testInfo.outputPath('visits.csv')
      await writeFile(visits, CALENDAR_VISITS)
      await prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, (prep) =>
        createGoogleEvent(prep.request, LEADER.email, CALENDAR_EVENT),
      )

      const page = await context.newPage()
      await openReceipt(page)
      await intro(
        page,
        `Google カレンダーの 11/20 23:00〜翌 0:30 の予定は、照合に使わなかった予定に出ず、同じ訪問の実績と整合の行で対になる\n前提 ${LEADER.staff.name}の Google カレンダーに、11/20 の 23:00 に始まり 11/21 の 0:30 に終わる「【医】見本 一郎」の予定がある`,
      )

      await step(
        page,
        '予定の取り方に「Google カレンダー」を選び、対象の月に 2026-11 を入れる',
        async () => {
          await page.getByTestId('receipt-source-calendar').check()
          await page.getByTestId('receipt-month').fill(CALENDAR_MONTH)
        },
      )
      await step(page, '同じ訪問の実績のダミーの CSV を選び、「照合する」を押す', async () => {
        await page.getByTestId('receipt-visits-file').setInputFiles(visits)
        await page.getByTestId('receipt-check-submit').click()
        await expect(page).toHaveURL(/\/receipt\/result$/)
        await expect(page.getByTestId('receipt-result')).toContainText(
          '2026 年 11 月の Google カレンダー',
        )
        await expect(page.getByTestId('receipt-warnings')).toHaveCount(0)
      })
      await step(page, '表示する行を「全ての行」に切り替える', () => showAllReceiptRows(page))
      const cells = receiptCategoryRowCells(page, 'match', '2026年11月20日（金）', '見本一郎')
      const expected = [
        '2026年11月20日（金）',
        '見本一郎',
        LEADER.staff.name,
        '',
        '医',
        '23:00',
        '00:30',
        '90',
        '医',
        '23:00',
        '00:30',
        '90',
        '深夜',
      ]
      await check(
        page,
        '照合に使わなかった予定は出ず、見本一郎の 2026-11-20 の行が整合データに入り、予定の側は 23:00〜00:30 である',
        () => expect(cells).toHaveText(expected),
      )

      // 送る操作は止めが入らず、step の字幕が読めないので、次の判定の字幕に書く
      await scrollToVisitColumns(page)
      await check(
        page,
        '（撮影のため、結果の表を右端まで送り、実績の側の列を見せる）\n実績の側も 23:00〜00:30、90 分、加算は深夜で、予定と対になっている',
        () => expect(cells).toHaveText(expected),
      )
    })
  })
})
