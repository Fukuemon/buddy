import { writeFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

import { LOGIN_EMAIL, LOGIN_STAFF, RECEIPT_TESTDATA } from '../../fixtures/env'
import { EVIDENCE_VARIANTS, PHONE_VIEWPORT, recordPrEvidence } from '../../fixtures/evidence'
import { signInAtBroker } from '../../screens/login'
import { receiptResultHeaderCells, receiptResultRow } from '../../selectors/receipt'
import { wheel } from '../../widgets/scroll/actions/scroll'

const ACTOR = `${LOGIN_STAFF.name}（マネージャー）`

const signIn = async (page: Page) => {
  await page.goto('/receipt')
  await signInAtBroker(page, LOGIN_EMAIL)
}

/** 照合の画面で、予定の CSV と実績の CSV を選んで照合し、結果の画面へ移る。 */
const check = async (page: Page, schedules: string, visits: string) => {
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

test.describe('照合の結果', () => {
  test.describe('予定の CSV での照合', () => {
    for (const variant of EVIDENCE_VARIANTS) {
      const prefix = variant.label ? `${variant.label}: ` : ''

      test(`${prefix}スマートフォンの幅で結果の表を右へ送った場合、区分の見出しの文字が表の左端に残ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'receipt-result-table-scroll',
            title:
              'スマートフォンの幅で照合の結果の表を右へ送っても、区分の見出しの文字が表の左端に残る',
            actor: ACTOR,
            variant,
            viewport: PHONE_VIEWPORT,
          },
          signIn,
          async ({ page, step, check: shot }) => {
            await page.goto('/receipt')
            await step('照合の画面を、幅 390px で開いている')

            await step('予定と実績のダミーの CSV を選び、照合する')
            await check(page, RECEIPT_TESTDATA.schedules, RECEIPT_TESTDATA.visits)
            const label = page.getByTestId('receipt-category-label-mismatch')
            await label.scrollIntoViewIfNeeded()
            await expect(label).toHaveText('不整合データ（3 件）')
            await shot('結果の表の区分の見出しに「不整合データ（3 件）」が出る')

            await step('結果の表を右端まで送る')
            const table = page.getByTestId('receipt-result-table')
            await table.hover()
            await wheel(page, { x: 2000 })
            await expect(label).toBeInViewport()
            const tableBox = await table.boundingBox()
            const labelBox = await label.boundingBox()
            // 文字は、表の箱の左端から、見出しのセルの余白（20px）の位置に残る
            expect((labelBox?.x ?? 0) - (tableBox?.x ?? 0)).toBeGreaterThanOrEqual(0)
            expect((labelBox?.x ?? 0) - (tableBox?.x ?? 0)).toBeLessThan(40)
            await shot('表を右へ送っても、「不整合データ（3 件）」の文字が表の左端に残る')
          },
        )
      })

      test(`${prefix}結果の表を横に送った場合、訪問日と利用者名の列が左端に残ること`, async ({
        browser,
      }) => {
        await recordPrEvidence(
          browser,
          {
            name: 'receipt-result-sticky-columns',
            title:
              'スマートフォンの幅で照合の結果の表を右端まで送っても、訪問日と利用者名の 2 列が表の左端に残る',
            actor: ACTOR,
            variant,
            viewport: PHONE_VIEWPORT,
          },
          signIn,
          async ({ page, step, check: shot }) => {
            await page.goto('/receipt')
            await step('照合の画面を、幅 390px で開いている')

            await step('予定と実績のダミーの CSV を選び、照合する')
            await check(page, RECEIPT_TESTDATA.schedules, RECEIPT_TESTDATA.visits)
            const table = page.getByTestId('receipt-result-table')
            const headers = receiptResultHeaderCells(page)
            const date = headers.nth(0)
            const patient = headers.nth(1)
            const staff = headers.nth(2)
            await table.scrollIntoViewIfNeeded()
            await expect(date).toHaveText('訪問日')
            await expect(patient).toHaveText('利用者名')
            await shot('結果の表の左端に、訪問日と利用者名の列がある')

            await step('結果の表を右端まで送る')
            await table.hover()
            await wheel(page, { x: 2000 })
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
            await shot(
              '表を右端まで送っても、訪問日と利用者名の 2 列が表の左端に残り、主訪問者から右の列だけが送られる',
            )
          },
        )
      })

      test(`${prefix}提供時間 0 の予定と、開始と終了が同じ予定を照合した場合、1 分を引かずに結果に出ること`, async ({
        browser,
      }, testInfo) => {
        const schedules = testInfo.outputPath('schedules.csv')
        const visits = testInfo.outputPath('visits.csv')
        await writeFile(schedules, EDGE_SCHEDULES)
        await writeFile(visits, EDGE_VISITS)
        await recordPrEvidence(
          browser,
          {
            name: 'receipt-one-minute-edge',
            title:
              '提供時間 0 の予定の行は 0 分のまま、開始と終了が同じ予定の行は終了時間を引かずに結果に出る',
            actor: ACTOR,
            variant,
          },
          signIn,
          async ({ page, step, check: shot }) => {
            await page.goto('/receipt')
            await step(
              '照合の画面を開いている。予定の CSV は、利用者A（09:00〜09:30、提供時間 0）と利用者C（10:00〜10:00、提供時間 60）の 2 行である',
            )

            await step('予定の CSV と、同じ 2 人の実績の CSV を選び、照合する')
            await check(page, schedules, visits)
            const rowA = receiptResultRow(page, '利用者A')
            const rowC = receiptResultRow(page, '利用者C')
            // 行の文字はセルを続けて読むので、開始時間、終了時間、提供時間の並びで確認する
            await expect(rowA).toContainText(/09:00\s*09:29(（注意）)?\s*0（不一致）/)
            await expect(rowC).toContainText(/10:00（不一致）\s*10:00（不一致）/)
            await shot(
              '利用者A の提供時間_予定は 0 のまま（-1 にならない）で、範囲の外れの不一致の印が付く。利用者C の終了時間_予定は開始と同じ 10:00 のまま（09:59 にならない）',
            )
          },
        )
      })
    }
  })
})
