import { writeFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE, RECEIPT_TESTDATA } from '../../fixtures/env'
import { PHONE_VIEWPORT } from '../../fixtures/recording'
import { receiptResultHeaderCells, receiptResultRow } from '../../selectors/receipt'
import { wheel } from '../../widgets/scroll/actions/scroll'

/** 照合の画面で、予定の CSV と実績の CSV を選んで照合し、結果の画面へ移る。 */
const checkWithCsv = async (page: Page, schedules: string, visits: string) => {
  await page.getByTestId('receipt-source-csv').check()
  await page.getByTestId('receipt-schedules-file').setInputFiles(schedules)
  await page.getByTestId('receipt-visits-file').setInputFiles(visits)
  await page.getByTestId('receipt-check-submit').click()
  await expect(page).toHaveURL(/\/receipt\/result$/)
}

/** 提供時間が 0 の行と、開始と終了が同じ時刻の行を持つ、ダミーの予定の CSV。 */
const EDGE_SCHEDULES = [
  '訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者',
  '2024/04/01,利用者A,09:00,09:30,0,訪看I2,職員B',
  '2024/04/01,利用者C,10:00,10:00,60,訪看I3,職員B',
  '',
].join('\n')

/** EDGE_SCHEDULES の 2 行と対になる、ダミーの実績の CSV。 */
const EDGE_VISITS = [
  '訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者,加算①,加算②,加算③,加算④,加算⑤',
  '2024/04/01,利用者A,9:00,9:29,29,訪看I2,職員B,通常,,,,',
  '2024/04/01,利用者C,10:05,10:59,54,訪看I3,職員B,通常,,,,',
  '',
].join('\n')

/** 照合の画面を開き、「照合する」が出るまで待つ。 */
const openReceipt = async (page: Page) => {
  await page.goto('/receipt')
  await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
}

test.describe('照合の結果', () => {
  test.describe(`予定の CSV での照合（${LOGIN_STAFF.name}、マネージャー、スマートフォンの幅）`, () => {
    test.use({ storageState: LOGIN_STATE, viewport: PHONE_VIEWPORT })

    test('receipt-result-table-scroll スマートフォンの幅で結果の表を右へ送った場合、区分の見出しの文字が表の左端に残ること', async ({
      page,
    }) => {
      await openReceipt(page)
      await intro(
        page,
        'スマートフォンの幅で照合の結果の表を右へ送っても、区分の見出しの文字が表の左端に残る\n前提 照合の画面を、幅 390px で開いている',
      )

      await step(page, '予定と実績のダミーの CSV を選び、照合する', () =>
        checkWithCsv(page, RECEIPT_TESTDATA.schedules, RECEIPT_TESTDATA.visits),
      )
      const label = page.getByTestId('receipt-category-label-mismatch')
      await check(page, '結果の表の区分の見出しに「不整合データ（3 件）」が出る', async () => {
        await label.scrollIntoViewIfNeeded()
        await expect(label).toHaveText('不整合データ（3 件）')
      })

      const table = page.getByTestId('receipt-result-table')
      await step(page, '結果の表を右端まで送る', async () => {
        await table.hover()
        await wheel(page, { x: 2000 })
      })
      await check(
        page,
        '表を右へ送っても、「不整合データ（3 件）」の文字が表の左端に残る',
        async () => {
          await expect(label).toBeInViewport()
          const tableBox = await table.boundingBox()
          const labelBox = await label.boundingBox()
          // 文字は、表の箱の左端から、見出しのセルの余白（20px）の位置に残る
          expect((labelBox?.x ?? 0) - (tableBox?.x ?? 0)).toBeGreaterThanOrEqual(0)
          expect((labelBox?.x ?? 0) - (tableBox?.x ?? 0)).toBeLessThan(40)
        },
      )
    })

    test('receipt-result-sticky-columns 結果の表を横に送った場合、訪問日と利用者名の列が左端に残ること', async ({
      page,
    }) => {
      await openReceipt(page)
      await intro(
        page,
        'スマートフォンの幅で照合の結果の表を右端まで送っても、訪問日と利用者名の 2 列が表の左端に残る\n前提 照合の画面を、幅 390px で開いている',
      )

      await step(page, '予定と実績のダミーの CSV を選び、照合する', () =>
        checkWithCsv(page, RECEIPT_TESTDATA.schedules, RECEIPT_TESTDATA.visits),
      )
      const table = page.getByTestId('receipt-result-table')
      const headers = receiptResultHeaderCells(page)
      const date = headers.nth(0)
      const patient = headers.nth(1)
      const staff = headers.nth(2)
      await check(page, '結果の表の左端に、訪問日と利用者名の列がある', async () => {
        await table.scrollIntoViewIfNeeded()
        await expect(date).toHaveText('訪問日')
        await expect(patient).toHaveText('利用者名')
      })

      await step(page, '結果の表を右端まで送る', async () => {
        await table.hover()
        await wheel(page, { x: 2000 })
      })
      await check(
        page,
        '表を右端まで送っても、訪問日と利用者名の 2 列が表の左端に残り、主訪問者から右の列だけが送られる',
        async () => {
          // 送った後も、3 列目（主訪問者）は表の外へ出て、2 列目までは表の左端からの位置を変えない
          await expect(staff).not.toBeInViewport()
          // 訪問日の列の左端と表の左端のずれと、利用者名の列の左端と訪問日の列の右端のずれの大きい方
          await expect
            .poll(async () => {
              const tableBox = await table.boundingBox()
              const dateBox = await date.boundingBox()
              const patientBox = await patient.boundingBox()
              if (tableBox === null || dateBox === null || patientBox === null) {
                return Number.POSITIVE_INFINITY
              }
              return Math.max(
                Math.abs(dateBox.x - tableBox.x),
                Math.abs(patientBox.x - (dateBox.x + dateBox.width)),
              )
            })
            .toBeLessThan(1)
        },
      )
    })
  })

  test.describe(`予定の CSV での照合（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('receipt-one-minute-edge 提供時間 0 の予定と、開始と終了が同じ予定を照合した場合、1 分を引かずに結果に出ること', async ({
      page,
    }, testInfo) => {
      const schedules = testInfo.outputPath('schedules.csv')
      const visits = testInfo.outputPath('visits.csv')
      await writeFile(schedules, EDGE_SCHEDULES)
      await writeFile(visits, EDGE_VISITS)
      await openReceipt(page)
      await intro(
        page,
        '提供時間 0 の予定の行は 0 分のまま、開始と終了が同じ予定の行は終了時間を引かずに結果に出る\n前提 予定の CSV は、利用者A（09:00〜09:30、提供時間 0）と利用者C（10:00〜10:00、提供時間 60）の 2 行である',
      )

      await step(page, '予定の CSV と、同じ 2 人の実績の CSV を選び、照合する', () =>
        checkWithCsv(page, schedules, visits),
      )
      await check(
        page,
        '利用者A の提供時間_予定は 0 のまま（-1 にならない）で、範囲の外れの不一致の印が付く。利用者C の終了時間_予定は開始と同じ 10:00 のまま（09:59 にならない）',
        async () => {
          // 行の文字はセルを続けて読むので、開始時間、終了時間、提供時間の並びで確認する
          await expect(receiptResultRow(page, '利用者A')).toContainText(
            /09:00\s*09:29(（注意）)?\s*0（不一致）/,
          )
          await expect(receiptResultRow(page, '利用者C')).toContainText(
            /10:00（不一致）\s*10:00（不一致）/,
          )
        },
      )
    })
  })
})
