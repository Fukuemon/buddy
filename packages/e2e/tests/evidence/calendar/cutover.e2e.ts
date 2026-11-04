import { expect, test, type Page } from '@playwright/test'

import { ISHIDA } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import {
  createGoogleEvent,
  shiftGoogleEvent,
  type GoogleEvent,
} from '../../fixtures/googleCalendar'
import { signInAtBroker } from '../../screens/login'

const ACTOR = `${ISHIDA.staff.name}（Google カレンダーを正本にする事業所のマネージャー）`
const CUTOVER_URL = '/schedule/link/cutover'

/** 今日の Asia/Tokyo の日付（YYYY-MM-DD）。切り替えの取り込みの期間は今月の初日から先の全てなので、今日に予定を作る。 */
const todayInTokyo = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

/**
 * 録画の外の準備。石田でログインし、Google カレンダーに予定を 1 件作り、切り替えの前の画面を開く。
 * 前の撮影が切り替えを残していれば、やめてから始める。
 */
const prepare = (summary: string) => async (page: Page) => {
  await page.goto('/schedule')
  await signInAtBroker(page, ISHIDA.email)
  const event = await createGoogleEvent(page.request, ISHIDA.calendarId, {
    summary,
    date: todayInTokyo(),
    start: '10:00',
    end: '11:00',
  })
  await page.goto(CUTOVER_URL)
  const start = page.getByTestId('calendar-cutover-start')
  const cancel = page.getByTestId('calendar-cutover-cancel')
  await start.or(cancel).waitFor()
  if (await cancel.isVisible()) {
    await cancel.click()
    await page.getByTestId('calendar-cutover-cancel-confirm-submit').click()
  }
  await start.waitFor()
  return event
}

/** 切り替えの画面から石田の取り込みの画面を開き、プレビューして確定し、切り替えの状況に戻る。 */
const importIshida = async (page: Page, step: (text: string) => Promise<void>) => {
  await step(`「${ISHIDA.staff.name}」の行の「取り込む」を押し、取り込みの画面でプレビューする`)
  await page.getByTestId(`calendar-cutover-open-import-${ISHIDA.staff.id}`).click()
  await expect(page.getByTestId('calendar-import-cutover-range')).toBeVisible()
  await page.getByTestId('calendar-import-preview').click()
  await expect(page.getByTestId('calendar-import-result-preview')).toBeVisible()
  await step('「確定して取り込む」を押し、「切り替えの状況に戻る」を押す')
  await page.getByTestId('calendar-import-submit').click()
  await page.getByTestId('calendar-import-back-to-cutover').click()
  await expect(page.getByTestId('calendar-cutover-open')).toBeVisible()
}

/** 完了するを、同期が取り込みの後に終わって完了するまで押し直す。 */
const completeUntilDone = async (page: Page) => {
  await expect(async () => {
    await page.getByTestId('calendar-cutover-complete').click()
    await expect(page.getByTestId('calendar-cutover-completed')).toBeVisible()
  }).toPass()
}

test.describe('予定の正本の切り替え', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const label = variant.label ? `${variant.label}: ` : ''

    test(`${label}Google カレンダーを正本にする事業所で切り替えを始め、全てのカレンダーを取り込んで完了した場合、事業所が buddy を正本にし、予定のカレンダーで予定を作れること`, async ({
      browser,
    }) => {
      const title = `担当者会議 ${Date.now()}`
      await recordPrEvidence(
        browser,
        {
          name: 'cutover-complete',
          title:
            '切り替えを始め、全てのカレンダーを取り込んで完了すると、事業所が buddy を正本にし、予定のカレンダーで予定を作れる',
          actor: ACTOR,
          variant,
        },
        prepare(title),
        async ({ page, step, check }) => {
          await step(
            '予定の正本の切り替えの画面を開いている。Google カレンダーには、今日の 10:00〜11:00 に予定がある',
          )
          await check(
            '切り替えの前の画面に、手順と、Google カレンダーを変えない案内と、カレンダーの同期が出る',
          )
          await step('「切り替えを始める」を押す')
          await page.getByTestId('calendar-cutover-start').click()
          await expect(page.getByTestId('calendar-cutover-open')).toBeVisible()
          await check('切り替え中になり、取り込みの期間が今月の初日から先の全てになる')
          await importIshida(page, step)
          await check(`「${ISHIDA.staff.name}」の行に、この切り替えの最後の取り込みの時刻が出る`)
          await step('「完了する」を押す（取り込みの後の同期が終わるまで押し直す）')
          await completeUntilDone(page)
          await check('「切り替えを完了しました。この事業所の予定の正本は buddy です。」が出る')
          await step('「予定のカレンダーを開く」を押す')
          await page.getByTestId('calendar-cutover-open-calendar').click()
          await expect(page.getByTestId('schedule-create-open')).toBeVisible()
          await step('今日を日の表示で開く')
          await page.goto(`/schedule?view=day&date=${todayInTokyo()}`)
          const event = page
            .getByTestId(`day-grid-staff-${ISHIDA.staff.id}`)
            .getByTestId(/^schedule-event-/)
            .filter({ hasText: title })
          await expect(event).toBeVisible()
          await expect(page.getByTestId('schedule-calendar-google-primary')).toHaveCount(0)
          await check(
            `取り込んだ「${title}」が buddy の予定として出て、Google カレンダーで管理する案内が消える`,
          )
          await step('「予定を作成」を押す')
          await page.getByTestId('schedule-create-open').click()
          await expect(page.getByTestId('schedule-create-submit')).toBeVisible()
          await check('予定の作成のダイアログが開き、予定を作れる')
        },
      )
    })

    test(`${label}取り込んだ後に Google で予定を変えてから完了しようとした場合、完了が拒まれて変わった予定が一覧に出て、取り込み直すと完了できること`, async ({
      browser,
    }) => {
      const title = `定例訪問の打ち合わせ ${Date.now()}`
      await recordPrEvidence<GoogleEvent>(
        browser,
        {
          name: 'cutover-rejects-changed',
          title:
            '取り込んだ後に Google で予定を変えると完了が拒まれ、変わった予定が一覧に出る。取り込み直すと完了できる',
          actor: ACTOR,
          variant,
        },
        prepare(title),
        async ({ page, step, check }, event) => {
          await step(
            '予定の正本の切り替えの画面を開いている。Google カレンダーには、今日の 10:00〜11:00 に予定がある',
          )
          await step('「切り替えを始める」を押す')
          await page.getByTestId('calendar-cutover-start').click()
          await expect(page.getByTestId('calendar-cutover-open')).toBeVisible()
          await importIshida(page, step)
          await step(
            '（撮影のため、職員が Google カレンダーで予定を直す代わりに、calendarpit の管理の API で予定を 1 時間遅らせる）',
          )
          await shiftGoogleEvent(page.request, ISHIDA.calendarId, event.id)
          await step('「完了する」を押す')
          const changed = page.getByTestId('calendar-cutover-unmet-changed')
          await expect(async () => {
            await page.getByTestId('calendar-cutover-complete').click()
            await expect(changed).toBeVisible()
          }).toPass()
          await expect(changed).toContainText('取り込んだ後に Google で変わった')
          await expect(page.getByTestId('calendar-cutover-open')).toBeVisible()
          await check(
            '完了できず、「完了できません」の一覧に、Google で変わった今日の 11:00〜12:00 の予定が出る。切り替え中のまま',
          )
          await importIshida(page, step)
          await step('「完了する」を押す（取り込み直しの後の同期が終わるまで押し直す）')
          await completeUntilDone(page)
          await check('取り込み直すと、「切り替えを完了しました。」が出る')
        },
      )
    })

    test(`${label}切り替えをやめた場合、取り込んだ予定が消え、事業所は Google カレンダーを正本にしたままになること`, async ({
      browser,
    }) => {
      const title = `研修 ${Date.now()}`
      await recordPrEvidence(
        browser,
        {
          name: 'cutover-cancel',
          title:
            '切り替えをやめると、取り込んだ予定が消え、事業所は Google カレンダーを正本にしたままになる',
          actor: ACTOR,
          variant,
        },
        prepare(title),
        async ({ page, step, check }) => {
          await step(
            '予定の正本の切り替えの画面を開いている。Google カレンダーには、今日の 10:00〜11:00 に予定がある',
          )
          await step('「切り替えを始める」を押す')
          await page.getByTestId('calendar-cutover-start').click()
          await expect(page.getByTestId('calendar-cutover-open')).toBeVisible()
          await importIshida(page, step)
          await step('「切り替えをやめる」を押す')
          await page.getByTestId('calendar-cutover-cancel').click()
          const dialog = page.getByTestId('calendar-cutover-cancel-confirm-dialog')
          await expect(dialog).toContainText('この切り替えで取り込んだ予定を、buddy から消します')
          await check(
            '確認のダイアログに、取り込んだ予定を消し、Google カレンダーで管理したままになることが出る',
          )
          await step('「やめる」を押す')
          await dialog.getByTestId('calendar-cutover-cancel-confirm-submit').click()
          await expect(page.getByTestId('calendar-cutover-start')).toBeVisible()
          await check('切り替えの前の画面に戻る')
          await step('予定のカレンダーを日の表示で開く')
          await page.goto(`/schedule?view=day&date=${todayInTokyo()}`)
          await expect(page.getByTestId('schedule-calendar-google-primary')).toBeVisible()
          await expect(page.getByTestId('schedule-calendar-cutover')).toHaveCount(0)
          await expect(page.getByTestId('schedule-create-open')).toHaveCount(0)
          await check(
            'Google カレンダーで管理する案内が出て、切り替え中の表示と「予定を作成」は出ない',
          )
          await step(
            '切り替えの画面で、もう一度「切り替えを始める」を押し、取り込みの画面でプレビューする',
          )
          await page.goto(CUTOVER_URL)
          await page.getByTestId('calendar-cutover-start').click()
          await page.getByTestId(`calendar-cutover-open-import-${ISHIDA.staff.id}`).click()
          await page.getByTestId('calendar-import-preview').click()
          const preview = page.getByTestId('calendar-import-result-preview')
          await expect(preview.getByTestId('calendar-import-count-import')).toBeVisible()
          await expect(preview.getByTestId('calendar-import-count-already_imported')).toHaveCount(0)
          await check(
            '前の切り替えで取り込んだ予定は残っておらず、取り込み済みの件数が出ずに、全てを取り込む件数に出る',
          )
          // ほかの撮影の前提に戻すため、始め直した切り替えをやめる
          await page.goto(CUTOVER_URL)
          await page.getByTestId('calendar-cutover-cancel').click()
          await page.getByTestId('calendar-cutover-cancel-confirm-submit').click()
          await expect(page.getByTestId('calendar-cutover-start')).toBeVisible()
        },
      )
    })
  }
})
