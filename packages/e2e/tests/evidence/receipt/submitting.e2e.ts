import { expect, test, type Page, type Route } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE, RECEIPT_TESTDATA } from '../../fixtures/env'

// 照合の API は、compose/receipt-calendars.json の森のカレンダーを calendarpit から読む。
const CALENDAR_MONTH = '2026-11'
/** web の BFF の server function。照合するの要求は、ブラウザからここへ送る。 */
const SERVER_FN_URL = '**/_serverFn/**'
const RETRY_MESSAGE = '照合できませんでした。時間をおいて、もう一度照合してください。'

/**
 * 照合の要求（実績の CSV を含む server function の要求）を、release を呼ぶまで止める。
 * 送っている途中に入力を変える操作を撮るためである。answered は、止めた要求に answer が応じ終えたら解決する。
 *
 * @param answer 止めた要求を release の後に流す処理
 */
const holdCheck = async (page: Page, answer: (route: Route) => Promise<void>) => {
  let release = () => {}
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  let answered = () => {}
  const done = new Promise<void>((resolve) => {
    answered = resolve
  })
  await page.route(SERVER_FN_URL, async (route) => {
    if (!(route.request().postDataBuffer()?.includes('name="visits"') ?? false)) {
      await route.fallback()
      return
    }
    await released
    await answer(route)
    answered()
  })
  return { release, answered: done }
}

/** 対象の月と実績の CSV を選んで、照合するを押す。 */
const submit = async (page: Page) => {
  await page.getByTestId('receipt-source-calendar').check()
  await page.getByTestId('receipt-month').fill(CALENDAR_MONTH)
  await page.getByTestId('receipt-visits-file').setInputFiles(RECEIPT_TESTDATA.calendarVisits)
  await page.getByTestId('receipt-check-submit').click()
}

/** 照合の画面を開き、「照合する」が出るまで待つ。 */
const openReceipt = async (page: Page) => {
  await page.goto('/receipt')
  await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
}

test.describe('照合', () => {
  test.describe(`送っている途中の入力（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test(
      'receipt-submitting-change-visits 照合を送っている途中に実績の CSV を選び直した場合、照合するは押せないままで、送信中の表示が残ること',
      { tag: '@compare' },
      async ({ page }) => {
        await openReceipt(page)
        await intro(page, '照合を送っている途中に、実績の CSV を選び直す')

        const held = await holdCheck(page, (route) => route.continue())
        const button = page.getByTestId('receipt-check-submit')
        await step(
          page,
          '対象の月に 2026-11 を入れ、実績の CSV を選び、「照合する」を押す\n（撮影のため、照合の要求を、実績の CSV を選び直すまで止める）',
          () => submit(page),
        )
        await check(page, '「照合する」に回転するインジケーターが出る', () =>
          expect(button).toHaveAttribute('aria-busy', 'true'),
        )

        await step(page, '照合が終わる前に、実績の CSV を選び直す', () =>
          page.getByTestId('receipt-visits-file').setInputFiles(RECEIPT_TESTDATA.visits),
        )
        // 改修前は回転するインジケーターが消える。確認する関数は改修前と改修後の両方で通るものにし、違いは判定のスクリーンショットで比べる
        await check(page, '回転するインジケーターが残り、「照合する」は押せないまま', () =>
          expect(button).toBeVisible(),
        )

        held.release()
        await check(
          page,
          '（撮影のため、止めた照合の要求を流す）\n先に送った照合が終わり、2026 年 11 月の照合の結果の画面へ移る',
          async () => {
            await expect(page).toHaveURL(/\/receipt\/result$/)
            await expect(page.getByTestId('receipt-result')).toContainText(
              '2026 年 11 月の Google カレンダー',
            )
          },
        )
      },
    )

    test(
      'receipt-submitting-change-visits-error 照合を送っている途中に入力を変え、先の照合が失敗した場合、照合の失敗の文を出すこと',
      { tag: '@compare' },
      async ({ page }) => {
        await openReceipt(page)
        await intro(page, '照合を送っている途中に実績の CSV を選び直し、先の照合が失敗する')

        const held = await holdCheck(page, (route) =>
          route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
        )
        const button = page.getByTestId('receipt-check-submit')
        await step(
          page,
          '対象の月に 2026-11 を入れ、実績の CSV を選び、「照合する」を押す\n（撮影のため、照合の要求を、実績の CSV を選び直すまで止め、500 を返す）',
          () => submit(page),
        )
        await check(page, '「照合する」に回転するインジケーターが出る', () =>
          expect(button).toHaveAttribute('aria-busy', 'true'),
        )

        await step(page, '照合が終わる前に、実績の CSV を選び直す', () =>
          page.getByTestId('receipt-visits-file').setInputFiles(RECEIPT_TESTDATA.visits),
        )
        // 改修前は回転するインジケーターが消える。確認する関数は改修前と改修後の両方で通るものにし、違いは判定のスクリーンショットで比べる
        await check(page, '回転するインジケーターが残り、「照合する」は押せないまま', () =>
          expect(button).toBeVisible(),
        )

        held.release()
        await held.answered
        // 改修前は照合の失敗の文が出ない。両方の版で、インジケーターが消えることだけを確認する
        await check(
          page,
          `（撮影のため、止めた照合の要求に 500 を返す）\n先に送った照合が失敗し、「${RETRY_MESSAGE}」が出る`,
          () => expect(button).not.toHaveAttribute('aria-busy'),
        )
      },
    )
  })
})
