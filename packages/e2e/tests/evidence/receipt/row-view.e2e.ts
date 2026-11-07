import { readFile, writeFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'
import { receiptResultRow } from '../../selectors/receipt'

const ACTOR = `${LOGIN_STAFF.name}（マネージャー）`

const signIn = async (page: Page) => {
  await page.goto('/receipt')
  await signInAtBroker(page, LOGIN_EMAIL)
}

const SCHEDULE_HEADER = '訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者'
const VISIT_HEADER =
  '訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者,加算①,加算②,加算③,加算④,加算⑤'

/**
 * 確認が要る行と、注意の無い整合の行が混ざる、ダミーの予定の CSV。
 * 利用者A は開始時間が違う不整合、利用者D は提供時間と終了時間が違う整合、利用者E は予定のみ、利用者G は全てが合う整合である。
 */
const MIXED_SCHEDULES = [
  SCHEDULE_HEADER,
  '2024/04/01,利用者A,09:00,09:30,30,訪看I2,職員B',
  '2024/04/01,利用者D,13:00,13:45,45,訪看I3,職員B',
  '2024/04/01,利用者E,14:00,14:30,30,訪看I2,職員B',
  '2024/04/01,利用者G,16:00,16:30,30,訪看I2,職員B',
  '',
].join('\n')

/** MIXED_SCHEDULES と対になる、ダミーの実績の CSV。 */
const MIXED_VISITS = [
  VISIT_HEADER,
  '2024/04/01,利用者A,9:15,9:44,29,訪看I2,職員B,通常,,,,',
  '2024/04/01,利用者D,13:00,13:50,50,訪看I3,職員B,通常,,,,',
  '2024/04/01,利用者G,16:00,16:29,29,訪看I2,職員B,通常,,,,',
  '',
].join('\n')

/** 全ての行が合う整合で、注意も無い、ダミーの予定の CSV。 */
const CLEAN_SCHEDULES = [
  SCHEDULE_HEADER,
  '2024/04/01,利用者G,16:00,16:30,30,訪看I2,職員B',
  '2024/04/02,利用者H,10:00,10:30,30,訪看I2,職員B',
  '',
].join('\n')

/** CLEAN_SCHEDULES と対になる、ダミーの実績の CSV。 */
const CLEAN_VISITS = [
  VISIT_HEADER,
  '2024/04/01,利用者G,16:00,16:29,29,訪看I2,職員B,通常,,,,',
  '2024/04/02,利用者H,10:00,10:29,29,訪看I2,職員B,通常,,,,',
  '',
].join('\n')

const check = async (page: Page, schedules: string, visits: string) => {
  await page.getByTestId('receipt-source-csv').check()
  await page.getByTestId('receipt-schedules-file').setInputFiles(schedules)
  await page.getByTestId('receipt-visits-file').setInputFiles(visits)
  await page.getByTestId('receipt-check-submit').click()
  await expect(page).toHaveURL(/\/receipt\/result$/)
}

test.describe('照合の結果', () => {
  test.describe('表示する行の切り替え', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''
      const isBefore = variant.name === 'before'

      test(`${prefix}照合の結果の画面を開いた場合、確認が要る行だけが出ること`, async ({
        browser,
      }, testInfo) => {
        const schedules = testInfo.outputPath('schedules.csv')
        const visits = testInfo.outputPath('visits.csv')
        await writeFile(schedules, MIXED_SCHEDULES)
        await writeFile(visits, MIXED_VISITS)
        await recordPrEvidence(
          browser,
          {
            name: 'receipt-row-view-default',
            title: '確認が要る行と、全てが合う整合の行が混ざる結果を開く',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check: shot }) => {
            await page.goto('/receipt')
            await step(
              '照合の画面を開いている。ダミーの CSV の利用者G の行だけは、予定と実績が全て合う',
            )
            await step('予定の CSV と実績の CSV を選び、照合する')
            await check(page, schedules, visits)
            if (isBefore) {
              await expect(receiptResultRow(page, '利用者G')).toBeVisible()
              await shot('全ての行が 1 つの表に並び、全てが合う利用者G の行も出る')
              return
            }
            await expect(page.getByTestId('receipt-row-view-needs')).toBeChecked()
            await expect(page.getByTestId('receipt-row-view')).toHaveText(
              '確認が要る行（3 件）全ての行（4 件）',
            )
            await expect(receiptResultRow(page, '利用者D')).toBeVisible()
            await expect(receiptResultRow(page, '利用者G')).toHaveCount(0)
            await expect(page.getByTestId('receipt-category-visit_only')).toHaveCount(0)
            await expect(page.getByTestId('receipt-category-match')).toHaveText(
              '整合データ（1 件）',
            )
            await shot(
              '「確認が要る行（3 件）」が選ばれ、不整合、予定のみ、注意のある整合の利用者D の行だけが出る。行の無い実績のみの見出しは出ない',
            )
          },
        )
      })

      test(`${prefix}全ての行を押した場合、注意の無い整合の行も出て、区分の見出しの件数が全ての行の数になること`, async ({
        browser,
      }, testInfo) => {
        test.skip(isBefore, '改修前は切り替えが無い')
        const schedules = testInfo.outputPath('schedules.csv')
        const visits = testInfo.outputPath('visits.csv')
        await writeFile(schedules, MIXED_SCHEDULES)
        await writeFile(visits, MIXED_VISITS)
        await recordPrEvidence(
          browser,
          {
            name: 'receipt-row-view-all',
            title: '表示する行を「全ての行」に切り替える',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check: shot }) => {
            await page.goto('/receipt')
            await step('予定の CSV と実績の CSV を選び、照合する')
            await check(page, schedules, visits)
            await expect(receiptResultRow(page, '利用者G')).toHaveCount(0)

            await step('「全ての行（4 件）」を押す')
            await page.getByTestId('receipt-row-view-all').check()
            await expect(receiptResultRow(page, '利用者G')).toBeVisible()
            await expect(page.getByTestId('receipt-category-match')).toHaveText(
              '整合データ（2 件）',
            )
            await expect(page.getByTestId('receipt-category-visit_only')).toHaveText(
              '実績のみ（0 件）',
            )
            await expect(page.getByTestId('receipt-row-count')).toHaveText(
              '4 件の行を表示しています。',
            )
            await shot(
              '全てが合う利用者G の行も出て、見出しは「整合データ（2 件）」になり、行の無い「実績のみ（0 件）」の見出しも出る',
            )
          },
        )
      })

      test(`${prefix}全ての行が整合で注意も無い結果を開いた場合、表の代わりに知らせが出て、全ての行に切り替えると表が出ること`, async ({
        browser,
      }, testInfo) => {
        const schedules = testInfo.outputPath('schedules.csv')
        const visits = testInfo.outputPath('visits.csv')
        await writeFile(schedules, CLEAN_SCHEDULES)
        await writeFile(visits, CLEAN_VISITS)
        await recordPrEvidence(
          browser,
          {
            name: 'receipt-row-view-nothing',
            title: '全ての行が整合で、注意も無い結果を開く',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check: shot }) => {
            await page.goto('/receipt')
            await step('照合の画面を開いている。ダミーの CSV の 2 行は、予定と実績が全て合う')
            await step('予定の CSV と実績の CSV を選び、照合する')
            await check(page, schedules, visits)
            if (isBefore) {
              await expect(page.getByTestId('receipt-category-match')).toHaveText(
                '整合データ（2 件）',
              )
              await shot('確認する行が無くても、全てが合う 2 行の表が出る')
              return
            }
            await expect(page.getByTestId('receipt-result-table')).toHaveCount(0)
            await expect(page.getByTestId('receipt-needs-empty')).toContainText(
              '確認が要る行はありません。全ての行で、予定と実績が規則に合っています。',
            )
            await shot(
              '表の代わりに「確認が要る行はありません。」の知らせと、「全ての行を表示」が出る',
            )

            await step('「全ての行を表示」を押す')
            await page.getByTestId('receipt-row-view-show-all').click()
            await expect(page.getByTestId('receipt-row-view-all')).toBeChecked()
            await expect(page.getByTestId('receipt-category-match')).toHaveText(
              '整合データ（2 件）',
            )
            await shot('「全ての行」が選ばれ、全てが合う 2 行の表が出る')
          },
        )
      })

      test(`${prefix}キーボードで切り替えに移り左右の矢印キーを押した場合、選択肢と表示する行が変わること`, async ({
        browser,
      }, testInfo) => {
        test.skip(isBefore, '改修前は切り替えが無い')
        const schedules = testInfo.outputPath('schedules.csv')
        const visits = testInfo.outputPath('visits.csv')
        await writeFile(schedules, MIXED_SCHEDULES)
        await writeFile(visits, MIXED_VISITS)
        await recordPrEvidence(
          browser,
          {
            name: 'receipt-row-view-keyboard',
            title: 'キーボードで、表示する行を切り替える',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check: shot }) => {
            await page.goto('/receipt')
            await step('予定の CSV と実績の CSV を選び、照合する')
            await check(page, schedules, visits)

            await step('「確認が要る行」の選択肢にフォーカスを移し、→ を押す')
            await page.getByTestId('receipt-row-view-needs').focus()
            await page.keyboard.press('ArrowRight')
            await expect(page.getByTestId('receipt-row-view-all')).toBeChecked()
            await expect(page.getByTestId('receipt-row-view-all')).toBeFocused()
            await expect(receiptResultRow(page, '利用者G')).toBeVisible()
            await shot('「全ての行」が選ばれ、全てが合う利用者G の行が出る')

            await step('← を押す')
            await page.keyboard.press('ArrowLeft')
            await expect(page.getByTestId('receipt-row-view-needs')).toBeChecked()
            await expect(receiptResultRow(page, '利用者G')).toHaveCount(0)
            await shot('「確認が要る行」に戻り、利用者G の行が消える')
          },
        )
      })

      test(`${prefix}切り替えた後に CSV をダウンロードした場合、CSV が全ての行を持つこと`, async ({
        browser,
      }, testInfo) => {
        test.skip(isBefore, '改修前は切り替えが無い')
        const schedules = testInfo.outputPath('schedules.csv')
        const visits = testInfo.outputPath('visits.csv')
        await writeFile(schedules, MIXED_SCHEDULES)
        await writeFile(visits, MIXED_VISITS)
        await recordPrEvidence(
          browser,
          {
            name: 'receipt-row-view-csv',
            title: '「確認が要る行」を出したまま、CSV をダウンロードする',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check: shot }) => {
            await page.goto('/receipt')
            await step('予定の CSV と実績の CSV を選び、照合する')
            await check(page, schedules, visits)
            await expect(page.getByTestId('receipt-row-view-needs')).toBeChecked()
            await expect(receiptResultRow(page, '利用者G')).toHaveCount(0)

            await step('「確認が要る行」を出したまま、「CSV をダウンロード」を押す')
            const download = page.waitForEvent('download')
            await page.getByTestId('receipt-download').click()
            const csv = await readFile(await (await download).path(), 'utf8')
            const rows = csv.split('\r\n').filter((line) => line.includes(',2024-04-01,'))
            expect(rows).toHaveLength(4)
            expect(csv).toContain(',2024-04-01,利用者G,')
            await shot(
              '表に出ていない利用者G の行も含め、CSV は 4 行の結果を持つ（録画に映らないので、本文に値を書く）',
            )
          },
        )
      })
    }
  })
})
