import { writeFile } from 'node:fs/promises'

import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { downloadFile } from '../../widgets/download/actions/download'

/**
 * 4 つの区分の行が出る、ダミーの予定の CSV。
 * 利用者A は開始時間が違う不整合、利用者D は提供時間と終了時間が違う整合、利用者E は予定のみである。
 */
const SCHEDULES = [
  '訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者',
  '2024/04/01,利用者A,09:00,09:30,30,訪看I2,職員B',
  '2024/04/01,利用者D,13:00,13:45,45,訪看I3,職員B',
  '2024/04/01,利用者E,14:00,14:30,30,訪看I2,職員B',
  '',
].join('\n')

/** SCHEDULES と対になる、ダミーの実績の CSV。利用者F は実績のみである。 */
const VISITS = [
  '訪問日,利用者名,開始時間,終了時間,提供時間,サービス内容,主訪問者,加算①,加算②,加算③,加算④,加算⑤',
  '2024/04/01,利用者A,9:15,9:44,29,訪看I2,職員B,通常,,,,',
  '2024/04/01,利用者D,13:00,13:50,50,訪看I3,職員B,通常,,,,',
  '2024/04/01,利用者F,15:00,15:29,29,訪看I2,職員B,通常,,,,',
  '',
].join('\n')

const HEADER =
  '区分,訪問日,利用者名,主訪問者,サービス内容_予定,開始時間_予定,終了時間_予定,提供時間_予定,' +
  'サービス内容_実績,開始時間_実績,終了時間_実績,提供時間_実績,加算,確認すること'

const escapeHtml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/**
 * ダウンロードした CSV の行を、そのままの文字列と、列に分けた表で画面に出す。
 * 録画に CSV の中身を映すためである。この結果の値は引用符を含まないので、カンマで分ける。
 * 録画する page のまま開くよう、web の origin の URL を route で返して開く。
 */
const showCsv = async (page: Page, lines: string[], caption: string) => {
  const [header, ...rows] = lines.map((line) => line.split(','))
  const cell = (tag: string, value: string) =>
    `<${tag} style="border:1px solid #999;padding:3px">${escapeHtml(value)}</${tag}>`
  const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;font-size:12px;margin:56px 16px 16px">
<h1 style="font-size:16px">${escapeHtml(caption)}</h1>
<pre style="background:#f4f4f4;padding:8px;white-space:pre-wrap">${escapeHtml(lines.join('\n'))}</pre>
<table style="border-collapse:collapse;width:100%">
<thead><tr>${header.map((value) => cell('th', value)).join('')}</tr></thead>
<tbody>${rows.map((row) => `<tr>${row.map((value) => cell('td', value)).join('')}</tr>`).join('')}</tbody>
</table></body></html>`
  await page.route('**/evidence/receipt-csv', (route) =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }),
  )
  await page.goto('/evidence/receipt-csv')
  await page.unroute('**/evidence/receipt-csv')
}

test.describe('照合の結果', () => {
  test.describe(`結果の CSV（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('receipt-result-csv 結果の CSV をダウンロードした場合、区分と確認することの列を持ち、値に印を混ぜず、区切りの行が無いこと', async ({
      page,
    }, testInfo) => {
      const schedules = testInfo.outputPath('schedules.csv')
      const visits = testInfo.outputPath('visits.csv')
      await writeFile(schedules, SCHEDULES)
      await writeFile(visits, VISITS)
      await page.goto('/receipt')
      await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
      await intro(page, '4 つの区分の行が出る結果の CSV をダウンロードし、中身を開く')

      await step(page, '予定の CSV と実績の CSV を選び、照合する', async () => {
        await page.getByTestId('receipt-source-csv').check()
        await page.getByTestId('receipt-schedules-file').setInputFiles(schedules)
        await page.getByTestId('receipt-visits-file').setInputFiles(visits)
        await page.getByTestId('receipt-check-submit').click()
        await expect(page).toHaveURL(/\/receipt\/result$/)
      })

      let bytes: Buffer = Buffer.alloc(0)
      await step(page, '「CSV をダウンロード」を押す', async () => {
        bytes = await downloadFile(page.getByTestId('receipt-download'))
      })
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      const csv = bytes.subarray(3).toString('utf8')
      const lines = csv.split('\r\n').filter((line) => line !== '')
      const rowOf = (client: string) => lines.find((line) => line.includes(`,${client},`))

      await step(page, 'ダウンロードした CSV の中身を、文字列のままと列に分けた表で開く', () =>
        showCsv(page, lines, 'ダウンロードした CSV（BOM 付きの UTF-8、CRLF）'),
      )
      await check(
        page,
        '1 行目が「区分,訪問日,…,加算,確認すること」で、「---」の区切りの行が無く、値に ❌ と ※ が無い',
        async () => {
          expect(csv).not.toContain('"')
          expect(lines[0]).toBe(HEADER)
          expect(csv).not.toContain('---')
          expect(csv).not.toMatch(/❌|※|データなし/)
        },
      )
      await check(
        page,
        '利用者A の開始時間の列は時刻だけで、確認することは「不一致: 開始時間が予定と違う」で始まる',
        async () => {
          expect(rowOf('利用者A')).toMatch(
            /^不整合データ,2024-04-01,利用者A,職員B,[^,]+,09:00,[^,]+,[^,]+,[^,]+,09:15,[^,]+,[^,]+,通常,不一致: 開始時間が予定と違う( \/ |$)/,
          )
          expect(rowOf('利用者D')).toMatch(/^整合データ,.*,注意: 提供時間が予定と違う/)
        },
      )
      await check(
        page,
        '予定のみの利用者E は、実績の側の欄と加算が空で、確認することは「実績が無い」。実績のみの利用者F は「予定が無い」',
        async () => {
          expect(rowOf('利用者E')).toMatch(
            /^予定のみ,2024-04-01,利用者E,職員B,[^,]+,14:00,[^,]+,[^,]+,,,,,,実績が無い$/,
          )
          expect(rowOf('利用者F')).toMatch(
            /^実績のみ,2024-04-01,利用者F,職員B,,,,,[^,]+,15:00,[^,]+,[^,]+,通常,予定が無い$/,
          )
        },
      )

      const filtered = [lines[0], ...lines.slice(1).filter((line) => line.startsWith('予定のみ,'))]
      await step(page, '区分の列で「予定のみ」の行に絞り込む', () =>
        showCsv(page, filtered, '区分の列が「予定のみ」の行'),
      )
      await check(page, '区分の列で絞り込むと、予定のみの利用者E の行だけが残る', async () => {
        expect(filtered).toHaveLength(2)
      })
    })
  })
})
