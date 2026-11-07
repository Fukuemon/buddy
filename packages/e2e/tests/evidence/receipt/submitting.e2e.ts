import { expect, test, type Page, type Route } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF, RECEIPT_TESTDATA } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'

// 照合の API は、compose/receipt-calendars.json の森のカレンダーを calendarpit から読む。
const CALENDAR_MONTH = '2026-11'
const ACTOR = `${LOGIN_STAFF.name}（マネージャー）`
/** web の BFF の server function。照合するの要求は、ブラウザからここへ送る。 */
const SERVER_FN_URL = '**/_serverFn/**'
const RETRY_MESSAGE = '照合できませんでした。時間をおいて、もう一度照合してください。'

const signIn = async (page: Page) => {
  await page.goto('/receipt')
  await signInAtBroker(page, LOGIN_EMAIL)
}

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

test.describe('照合', () => {
  test.describe('送っている途中の入力', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      const isBefore = variant.name === 'before'

      test(`${prefix}照合を送っている途中に実績の CSV を選び直した場合、照合するは押せないままで、送信中の表示が残ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'receipt-submitting-change-visits',
            title: '照合を送っている途中に、実績の CSV を選び直す',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check }) => {
            await page.goto('/receipt')
            await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
            await step('照合の画面を開いている')

            await step('（撮影のため、照合の要求を、実績の CSV を選び直すまで止める）')
            const held = await holdCheck(page, (route) => route.continue())

            await step('対象の月に 2026-11 を入れ、実績の CSV を選び、「照合する」を押す')
            await submit(page)
            const button = page.getByTestId('receipt-check-submit')
            await expect(button).toHaveAttribute('aria-busy', 'true')
            await check('「照合する」に回転するインジケーターが出る')

            await step('照合が終わる前に、実績の CSV を選び直す')
            await page.getByTestId('receipt-visits-file').setInputFiles(RECEIPT_TESTDATA.visits)
            if (isBefore) {
              await expect(button).not.toHaveAttribute('aria-busy')
              await expect(button).not.toHaveAttribute('aria-disabled')
              await check('回転するインジケーターが消え、「照合する」をもう一度押せる')
            } else {
              await expect(button).toHaveAttribute('aria-busy', 'true')
              await check('回転するインジケーターが残り、「照合する」は押せないまま')
            }

            await step('（撮影のため、止めた照合の要求を流す）')
            held.release()
            await expect(page).toHaveURL(/\/receipt\/result$/)
            await expect(page.getByTestId('receipt-result')).toContainText(
              '2026 年 11 月の Google カレンダー',
            )
            await check('先に送った照合が終わり、2026 年 11 月の照合の結果の画面へ移る')
          },
        )
      })

      test(`${prefix}照合を送っている途中に入力を変え、先の照合が失敗した場合、照合の失敗の文を出すこと`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'receipt-submitting-change-visits-error',
            title: '照合を送っている途中に実績の CSV を選び直し、先の照合が失敗する',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check }) => {
            await page.goto('/receipt')
            await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
            await step('照合の画面を開いている')

            await step(
              '（撮影のため、照合の要求を、実績の CSV を選び直すまで止め、500 を返す）',
            )
            const held = await holdCheck(page, (route) =>
              route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
            )

            await step('対象の月に 2026-11 を入れ、実績の CSV を選び、「照合する」を押す')
            await submit(page)
            const button = page.getByTestId('receipt-check-submit')
            await expect(button).toHaveAttribute('aria-busy', 'true')
            await check('「照合する」に回転するインジケーターが出る')

            await step('照合が終わる前に、実績の CSV を選び直す')
            await page.getByTestId('receipt-visits-file').setInputFiles(RECEIPT_TESTDATA.visits)
            if (isBefore) {
              await expect(button).not.toHaveAttribute('aria-busy')
              await check('回転するインジケーターが消え、「照合する」をもう一度押せる')
            } else {
              await expect(button).toHaveAttribute('aria-busy', 'true')
              await check('回転するインジケーターが残り、「照合する」は押せないまま')
            }

            await step('（撮影のため、止めた照合の要求に 500 を返す）')
            held.release()
            await held.answered
            const error = page.getByTestId('receipt-check-error')
            if (isBefore) {
              await expect(button).not.toHaveAttribute('aria-busy')
              await expect(error).toHaveCount(0)
              await check('先に送った照合が失敗しても、照合の失敗の文が出ない')
            } else {
              await expect(error).toHaveText(RETRY_MESSAGE)
              await expect(button).not.toHaveAttribute('aria-busy')
              await check(`先に送った照合が失敗し、「${RETRY_MESSAGE}」が出る`)
            }
          },
        )
      })
    }
  })
})
