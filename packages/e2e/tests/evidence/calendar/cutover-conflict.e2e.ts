import { expect, test, type Page } from '@playwright/test'

import { ISHIDA } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { createGoogleEvent } from '../../fixtures/googleCalendar'
import { signInAtBroker } from '../../screens/login'
import { pageBody } from '../../selectors/page'

const ACTOR = `${ISHIDA.staff.name}（Google カレンダーを正本にする事業所のマネージャー）`
const CUTOVER_URL = '/schedule/link/cutover'
const NOT_OPEN_MESSAGE =
  'この切り替えは、ほかの画面で完了したか、やめています。画面を読み直してください。'
const STARTED_MESSAGE =
  'この事業所では、ほかの画面で切り替えを始めています。画面を読み直してください。'

/** 今日の Asia/Tokyo の日付（YYYY-MM-DD）。切り替えの取り込みの期間は今月の初日から先の全てなので、今日に予定を作る。 */
const todayInTokyo = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

/**
 * 録画の外の準備。石田でログインし、切り替えの画面を、切り替えの前（open が false）か切り替え中（true）にして開く。
 * 前の撮影が残した状態は、やめるか始めるかで合わせる。
 * 取り込む予定が無いと完了の撮影で取り込めないので、Google カレンダーの今日に予定を 1 件作る。
 */
const prepare = (open: boolean) => async (page: Page) => {
  await page.goto('/schedule')
  await signInAtBroker(page, ISHIDA.email)
  await createGoogleEvent(page.request, ISHIDA.calendarId, {
    summary: `申し送り ${Date.now()}`,
    date: todayInTokyo(),
    start: '15:00',
    end: '16:00',
  })
  await page.goto(CUTOVER_URL)
  const startButton = page.getByTestId('calendar-cutover-start')
  const cancel = page.getByTestId('calendar-cutover-cancel')
  await startButton.or(cancel).waitFor()
  if (open && (await startButton.isVisible())) {
    await startButton.click()
    await cancel.waitFor()
  }
  if (!open && (await cancel.isVisible())) {
    await cancel.click()
    await page.getByTestId('calendar-cutover-cancel-confirm-submit').click()
    await startButton.waitFor()
  }
}

/** 録画の画面で、切り替えの画面を開き、目印の要素が出るまで待つ。 */
const openCutover = async (page: Page, open: boolean) => {
  await page.goto(CUTOVER_URL)
  await (
    open ? page.getByTestId('calendar-cutover-cancel') : page.getByTestId('calendar-cutover-start')
  ).waitFor()
}

/** 同じ職員が開いた別のタブ。録画には映らない。操作を終えたら閉じる。 */
const inOtherTab = async (page: Page, action: (other: Page) => Promise<void>) => {
  const other = await page.context().newPage()
  await other.goto(CUTOVER_URL)
  await action(other)
  await other.close()
}

/** 別のタブで切り替えをやめる。 */
const cancelInOtherTab = (page: Page) =>
  inOtherTab(page, async (other) => {
    await other.getByTestId('calendar-cutover-cancel').click()
    await other.getByTestId('calendar-cutover-cancel-confirm-submit').click()
    await other.getByTestId('calendar-cutover-start').waitFor()
  })

/**
 * 職員がほかのタブからこの画面のタブに戻ったときの出来事を送り、画面に切り替えの状況を読み直させる。
 * 録画のブラウザはタブを切り替えても戻ったときの出来事を送らないので、撮影のために送る。
 */
const returnToTab = (page: Page) =>
  page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
  })

/** やめる前の確認を開き、別のタブで切り替えをやめてから、確認の「やめる」を押す。 */
const cancelAfterOtherTabCanceled = async (page: Page, step: (text: string) => Promise<void>) => {
  await step('「切り替えをやめる」を押し、やめる前の確認を開く')
  await page.getByTestId('calendar-cutover-cancel').click()
  const dialog = page.getByTestId('calendar-cutover-cancel-confirm-dialog')
  await dialog.waitFor()
  await step('撮影のため、同じ職員が開いた別のタブで、先に切り替えをやめる')
  await cancelInOtherTab(page)
  await step('この画面の確認で「やめる」を押す')
  await dialog.getByTestId('calendar-cutover-cancel-confirm-submit').click()
  return dialog
}

test.describe('予定の正本の切り替えで、ほかの画面で先に操作されたとき', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const label = variant.label ? `${variant.label}: ` : ''
    const isBefore = variant.name === 'before'

    test(`${label}ほかの画面でやめた後に、やめる前の確認でやめるを押した場合、やめるの失敗の文を出すこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'cutover-conflict-cancel',
          title: 'ほかの画面でやめた後に、やめる前の確認でやめるを押すと、やめるの失敗の文を出す',
          actor: ACTOR,
          variant,
        },
        prepare(true),
        async ({ page, step, check }) => {
          await openCutover(page, true)
          await step('予定の正本の切り替えの画面を、切り替え中の状態で開いている')
          const dialog = await cancelAfterOtherTabCanceled(page, step)
          if (isBefore) {
            await expect(dialog).toHaveCount(0)
            await expect(page.getByTestId('calendar-cutover-start')).toBeVisible()
            await check('ダイアログが文を出さずに閉じ、切り替えの前の状態に替わる')
            return
          }
          await expect(dialog).toContainText(NOT_OPEN_MESSAGE)
          await check(`ダイアログのボタンの上に「${NOT_OPEN_MESSAGE}」が出る`)
        },
      )
    })

    test(`${label}ほかの画面でやめた後にやめるを押し、切り替えを始めるを押した場合、やめる前の確認のダイアログを開かないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'cutover-conflict-restart',
          title:
            'ほかの画面でやめた後にやめるを押し、切り替えを始め直すと、やめる前の確認のダイアログを開かない',
          actor: ACTOR,
          variant,
        },
        prepare(true),
        async ({ page, step, check }) => {
          await openCutover(page, true)
          await step('予定の正本の切り替えの画面を、切り替え中の状態で開いている')
          const dialog = await cancelAfterOtherTabCanceled(page, step)
          if (!isBefore) {
            await expect(dialog).toContainText(NOT_OPEN_MESSAGE)
            await step('失敗の文を読み、確認の「キャンセル」を押す')
            await dialog.getByTestId('calendar-cutover-cancel-confirm-cancel').click()
            await step(
              'ほかのタブからこのタブに戻る（撮影のため、戻ったときの出来事を送り、画面に読み直させる）',
            )
            await returnToTab(page)
          }
          await page.getByTestId('calendar-cutover-start').waitFor()
          await step('切り替えの前の状態で、「切り替えを始める」を押す')
          await page.getByTestId('calendar-cutover-start').click()
          await expect(page.getByTestId('calendar-cutover-open')).toBeVisible()
          if (isBefore) {
            await expect(dialog).toBeVisible()
            await check('切り替え中になり、やめる前の確認のダイアログが、押さずに開く')
          } else {
            await expect(dialog).toHaveCount(0)
            await check('切り替え中になり、やめる前の確認のダイアログは開かない')
          }
        },
      )
    })

    test(`${label}ほかの画面で始めた後に、切り替えを始めるを押した場合、始めるの失敗の文を出すこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'cutover-conflict-start',
          title: 'ほかの画面で始めた後に、切り替えを始めるを押すと、始めるの失敗の文を出す',
          actor: ACTOR,
          variant,
        },
        prepare(false),
        async ({ page, step, check }) => {
          await openCutover(page, false)
          await step('予定の正本の切り替えの画面を、切り替えの前の状態で開いている')
          await step('撮影のため、同じ職員が開いた別のタブで、先に切り替えを始める')
          await inOtherTab(page, async (other) => {
            await other.getByTestId('calendar-cutover-start').click()
            await other.getByTestId('calendar-cutover-open').waitFor()
          })
          await step('この画面で「切り替えを始める」を押す')
          await page.getByTestId('calendar-cutover-start').click()
          if (isBefore) {
            await expect(page.getByTestId('calendar-cutover-open')).toBeVisible()
            await expect(page.getByTestId('calendar-cutover-start-error')).toHaveCount(0)
            await check('文を出さずに、切り替え中の状態に替わる')
            return
          }
          await expect(page.getByTestId('calendar-cutover-start-error')).toHaveText(STARTED_MESSAGE)
          await check(`「切り替えを始める」の上に「${STARTED_MESSAGE}」が出る`)
        },
      )
    })

    // 完了すると事業所の正本が buddy に替わり、ほかの撮影の前提に戻せないので、最後に撮る
    test(`${label}ほかの画面で完了した後に、完了するを押した場合、完了の失敗の文を出すこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'cutover-conflict-complete',
          title: 'ほかの画面で完了した後に、完了するを押すと、完了の失敗の文を出す',
          actor: ACTOR,
          variant,
        },
        prepare(true),
        async ({ page, step, check }) => {
          await openCutover(page, true)
          await step('予定の正本の切り替えの画面を、切り替え中の状態で開いている')
          await step('撮影のため、同じ職員が開いた別のタブで、取り込んでから先に切り替えを完了する')
          await inOtherTab(page, async (other) => {
            await other.getByTestId(`calendar-cutover-open-import-${ISHIDA.staff.id}`).click()
            await other.getByTestId('calendar-import-preview').click()
            await other.getByTestId('calendar-import-result-preview').waitFor()
            await other.getByTestId('calendar-import-submit').click()
            await other.getByTestId('calendar-import-back-to-cutover').click()
            await other.getByTestId('calendar-cutover-open').waitFor()
            // 取り込みの後の同期が終わるまで、完了するを押し直す
            await expect(async () => {
              await other.getByTestId('calendar-cutover-complete').click()
              await expect(other.getByTestId('calendar-cutover-completed')).toBeVisible()
            }).toPass()
          })
          await step('この画面で「完了する」を押す')
          await page.getByTestId('calendar-cutover-complete').click()
          if (isBefore) {
            await expect(page.getByTestId('calendar-cutover-buddy-primary')).toBeVisible()
            await expect(pageBody(page)).not.toContainText(NOT_OPEN_MESSAGE)
            await check('文を出さずに、正本が buddy の状態に替わる')
            return
          }
          await expect(pageBody(page)).toContainText(NOT_OPEN_MESSAGE)
          await check(`「完了する」の上に「${NOT_OPEN_MESSAGE}」が出る`)
        },
      )
    })
  }
})
