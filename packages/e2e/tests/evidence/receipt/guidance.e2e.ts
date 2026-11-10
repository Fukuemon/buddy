import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LEADER, LOGIN_STAFF, LOGIN_STATE, RECEIPT_TESTDATA } from '../../fixtures/env'
import { createGoogleEvent, deleteGoogleEvent } from '../../fixtures/googleCalendar'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { pageBody } from '../../selectors/page'
import { receiptCheckErrorItems, receiptWarningItems } from '../../selectors/receipt'

// 照合の API は、compose/receipt-calendars.json の森のカレンダーを calendarpit から読む
const MORI_CALENDAR = LEADER.email
const VISITS_HEADER =
  '訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者,加算①,加算②,加算③,加算④,加算⑤'

/** 提供時間の列を除いた実績の CSV。 */
const visitsWithoutDuration = {
  name: 'visits-no-duration.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from(
    `${VISITS_HEADER.replace('提供時間,', '')}\n2026/11/02,見本 一郎,10:00,10:30,訪看I２,森 健太,通常,,,,\n`,
  ),
}

/** UTF-8 としても CP932 としても読めないバイトを含む実績の CSV。 */
const visitsUnreadable = {
  name: 'visits-unreadable.csv',
  mimeType: 'text/csv',
  buffer: Buffer.concat([Buffer.from(`${VISITS_HEADER}\n`), Buffer.from([0x81, 0x20, 0xff, 0x0a])]),
}

/** 照合の画面で、予定の CSV と実績の CSV を選んで照合する。 */
const checkWithCsv = async (page: Page, visits: typeof visitsUnreadable) => {
  await page.getByTestId('receipt-source-csv').check()
  await page.getByTestId('receipt-schedules-file').setInputFiles(RECEIPT_TESTDATA.schedules)
  await page.getByTestId('receipt-visits-file').setInputFiles(visits)
  await page.getByTestId('receipt-check-submit').click()
}

test.describe('照合', () => {
  test.describe(`説明と誤りの文（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('receipt-lead-more 照合の画面を開いた場合、説明は 1 文で、「詳しく」で 4 つの区分の説明が開くこと', async ({
      page,
    }) => {
      await page.goto('/receipt')
      const more = page.getByTestId('receipt-more-text')
      await expect(page.getByTestId('receipt-more')).toBeVisible()
      await intro(
        page,
        '照合の画面を開くと、説明は 1 文で、「詳しく」を押すと 4 つの区分の説明が開く',
      )

      await check(
        page,
        '説明は「予定と、電子カルテから書き出した実績を比べ、食い違いを見つけます。」の 1 文で、4 つの区分の説明は閉じている',
        async () => {
          await expect(page.getByTestId('receipt-more')).toHaveAttribute('aria-expanded', 'false')
          await expect(more).toBeHidden()
          await expect(pageBody(page)).toContainText(
            '予定と、電子カルテから書き出した実績を比べ、食い違いを見つけます。',
          )
        },
      )

      await step(page, '説明の下の「詳しく」を押す', () => page.getByTestId('receipt-more').click())
      await check(page, '不整合データ、予定のみ、実績のみ、整合データの説明が開く', async () => {
        await expect(more).toBeVisible()
        await expect(more).toContainText('不整合データ')
        await expect(more).toContainText('予定のみ')
        await expect(more).toContainText('実績のみ')
        await expect(more).toContainText('整合データ')
      })
    })

    test('receipt-missing-column 列が足りない実績の CSV で照合した場合、足りない列の名前と書き出し直す案内が出ること', async ({
      page,
    }) => {
      await page.goto('/receipt')
      await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
      await intro(
        page,
        '提供時間の列の無い実績の CSV で照合すると、「実績の CSV に「提供時間」の列がありません。」と、電子カルテから書き出し直す案内が出る',
      )

      await step(
        page,
        '予定の取り方に「予定の CSV」を選び、予定の CSV と、提供時間の列の無い実績の CSV を選んで「照合する」を押す',
        () => checkWithCsv(page, visitsWithoutDuration),
      )
      await check(
        page,
        '「実績の CSV に「提供時間」の列がありません。電子カルテから書き出し直してください。」が出て、API の文（visits の CSV に列がない）は出ない',
        async () => {
          const error = page.getByTestId('receipt-check-error')
          await expect(error).toContainText(
            '入力の CSV に誤りがあります。次のところを直して、もう一度照合してください。',
          )
          await expect(receiptCheckErrorItems(page)).toHaveText([
            '実績の CSV に「提供時間」の列がありません。電子カルテから書き出し直してください。',
          ])
          await expect(error).not.toContainText('visits')
        },
      )
    })

    test('receipt-unreadable-encoding 文字コードを読めない実績の CSV で照合した場合、文字コードの名前を出さずに書き出し直す案内が出ること', async ({
      page,
    }) => {
      await page.goto('/receipt')
      await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
      await intro(
        page,
        '文字を読めない実績の CSV で照合すると、電子カルテから書き出し直す案内が出て、文字コードの名前とバイト列の語が出ない',
      )

      await check(
        page,
        '実績の CSV の補足は「電子カルテから書き出した CSV。10 MB まで。」で、文字コードの名前が無い',
        async () => {
          const hint = pageBody(page)
          await expect(hint).toContainText('電子カルテから書き出した CSV。10 MB まで。')
          await expect(hint).not.toContainText('Shift_JIS')
        },
      )

      await step(
        page,
        '予定の取り方に「予定の CSV」を選び、予定の CSV と、UTF-8 でも CP932 でもないバイトを含む実績の CSV を選んで「照合する」を押す',
        () => checkWithCsv(page, visitsUnreadable),
      )
      await check(
        page,
        '「実績の CSV の文字を読めません。電子カルテから書き出し直してください。」が出て、UTF-8、CP932、Shift_JIS、バイトの語は出ない',
        async () => {
          await expect(receiptCheckErrorItems(page)).toHaveText([
            '実績の CSV の文字を読めません。電子カルテから書き出し直してください。',
          ])
          await expect(page.getByTestId('receipt-check-error')).not.toContainText(
            /UTF-8|CP932|Shift_JIS|バイト/,
          )
        },
      )
    })

    test('receipt-warning-reason タイトルを読めない Google カレンダーの予定がある月で照合した場合、照合に使わなかった理由が職員の分かる文で出ること', async ({
      browser,
      context,
    }) => {
      const event = await prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, (page) =>
        createGoogleEvent(page.request, MORI_CALENDAR, {
          summary: '】訪看I2【見本 一郎',
          date: '2026-11-20',
          start: '10:00',
          end: '10:30',
        }),
      )

      const page = await context.newPage()
      try {
        await page.goto('/receipt')
        await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
        await intro(
          page,
          'タイトルが「】訪看I2【見本 一郎」の予定がある 2026-11 で照合すると、照合に使わなかった予定の理由が「タイトルが「【サービス内容】利用者名」の形になっていません。」と出る\n前提 森 健太のカレンダーの 2026-11-20 に、タイトルが「】訪看I2【見本 一郎」の予定を足してある',
        )

        await step(
          page,
          '予定の取り方に「Google カレンダー」を選び、対象の月に 2026-11 を、実績の CSV に visits_2026-11_utf8.csv を選んで「照合する」を押す',
          async () => {
            await page.getByTestId('receipt-source-calendar').check()
            await page.getByTestId('receipt-month').fill('2026-11')
            await page
              .getByTestId('receipt-visits-file')
              .setInputFiles(RECEIPT_TESTDATA.calendarVisits)
            await page.getByTestId('receipt-check-submit').click()
          },
        )
        await check(
          page,
          '「照合に使わなかった予定」に「2026年11月20日（金） 10:00: タイトルが「【サービス内容】利用者名」の形になっていません。」が出て、API の文（タイトルに【…】の組がない）は出ない',
          async () => {
            await expect(receiptWarningItems(page)).toHaveText([
              '2026年11月20日（金） 10:00: タイトルが「【サービス内容】利用者名」の形になっていません。',
            ])
            await expect(page.getByTestId('receipt-warnings')).not.toContainText('の組がない')
          },
        )
      } finally {
        // 撮り直しても 1 件になるよう、足した予定を録画の外で消す
        await prepareOutsideRecording(browser, { storageState: LOGIN_STATE }, (prep) =>
          deleteGoogleEvent(prep.request, MORI_CALENDAR, event.id),
        )
      }
    })
  })
})
