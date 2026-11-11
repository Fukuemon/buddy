import { writeFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { showAllReceiptRows } from '../../screens/receipt'
import { receiptCategoryRowCells } from '../../selectors/receipt'

/** 照合の画面で、予定の CSV と実績の CSV を選んで照合し、結果の画面へ移る。 */
const checkWithCsv = async (page: Page, schedules: string, visits: string) => {
  await page.getByTestId('receipt-source-csv').check()
  await page.getByTestId('receipt-schedules-file').setInputFiles(schedules)
  await page.getByTestId('receipt-visits-file').setInputFiles(visits)
  await page.getByTestId('receipt-check-submit').click()
  await expect(page).toHaveURL(/\/receipt\/result$/)
}

/** 開始が 19:00 の予定と 10:00 の予定の、ダミーの予定の CSV。 */
const SCHEDULES = [
  '訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者',
  '2024/04/01,利用者A,19:00,19:30,30,訪看I2,職員B',
  '2024/04/01,利用者C,10:00,10:30,30,訪看I2,職員B',
  '',
].join('\n')

/** SCHEDULES の 2 行と対になり、加算が夜間だけの、ダミーの実績の CSV。 */
const VISITS = [
  '訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者,加算①,加算②,加算③,加算④,加算⑤',
  '2024/04/01,利用者A,19:00,19:29,29,訪看I2,職員B,夜間,,,,',
  '2024/04/01,利用者C,10:00,10:29,29,訪看I2,職員B,夜間,,,,',
  '',
].join('\n')

/** 結果の表の列のうち、加算の列の位置。列の順は画面仕様書の結果の表にある。 */
const ADDITION_COLUMN = 12

/** SCHEDULES と VISITS をテストの出力のディレクトリに書き、照合の画面を開く。書いた 2 つのファイルのパスを返す。 */
const openWithCsv = async (page: Page, outputPath: (name: string) => string) => {
  const schedules = outputPath('schedules.csv')
  const visits = outputPath('visits.csv')
  await writeFile(schedules, SCHEDULES)
  await writeFile(visits, VISITS)
  await page.goto('/receipt')
  await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
  return { schedules, visits }
}

test.describe('照合の結果', () => {
  test.describe(`時間帯の加算（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('receipt-night-addition-match 予定の開始が19時で実績の加算が夜間だけの行を照合した場合、整合に入り加算に印が付かないこと', async ({
      page,
    }, testInfo) => {
      const { schedules, visits } = await openWithCsv(page, (name) => testInfo.outputPath(name))
      await intro(
        page,
        '予定の開始が 19:00 で実績の加算が夜間だけの行は、整合に入り、加算に印が付かない\n前提 利用者A の予定の開始は 19:00、実績の加算は夜間だけである',
      )

      await step(page, '予定と実績のダミーの CSV を選び、照合する', () =>
        checkWithCsv(page, schedules, visits),
      )
      await step(page, '表示する行を「全ての行」に切り替える', () => showAllReceiptRows(page))
      const cells = receiptCategoryRowCells(page, 'match', '2024年4月1日（月）', '利用者A')
      // 送る操作は止めが入らず、step の字幕が読めないので、次の判定の字幕に書く
      await cells.nth(ADDITION_COLUMN).scrollIntoViewIfNeeded()
      await check(
        page,
        '（結果の表を、加算の列が見えるまで右へ送る）\n利用者A の行が整合データに入り、加算は「夜間」で印が付かない',
        async () => {
          await expect(cells.nth(5)).toHaveText('19:00')
          await expect(cells.nth(ADDITION_COLUMN)).toHaveText('夜間')
        },
      )
    })

    test('receipt-night-addition-mismatch 予定の開始が10時で実績の加算が夜間の行を照合した場合、不整合に入り加算に不一致の印が付くこと', async ({
      page,
    }, testInfo) => {
      const { schedules, visits } = await openWithCsv(page, (name) => testInfo.outputPath(name))
      await intro(
        page,
        '予定の開始が 10:00 で実績の加算が夜間の行は、不整合に入り、加算に不一致の印が付く\n前提 利用者C の予定の開始は 10:00、実績の加算は夜間である',
      )

      await step(page, '予定と実績のダミーの CSV を選び、照合する', () =>
        checkWithCsv(page, schedules, visits),
      )
      const cells = receiptCategoryRowCells(page, 'mismatch', '2024年4月1日（月）', '利用者C')
      // 送る操作は止めが入らず、step の字幕が読めないので、次の判定の字幕に書く
      await cells.nth(ADDITION_COLUMN).scrollIntoViewIfNeeded()
      await check(
        page,
        '（結果の表を、加算の列が見えるまで右へ送る）\n利用者C の行が不整合データに入り、加算の「夜間」に不一致の印が付く',
        async () => {
          await expect(cells.nth(5)).toHaveText('10:00')
          await expect(cells.nth(ADDITION_COLUMN)).toHaveText('夜間（不一致）')
        },
      )
    })
  })
})
