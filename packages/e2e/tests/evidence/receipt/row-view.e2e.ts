import { writeFile } from 'node:fs/promises'

import { expect, test, type Page, type TestInfo } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { receiptResultRow } from '../../selectors/receipt'
import { downloadFile } from '../../widgets/download/actions/download'

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

/** 予定と実績の CSV をテストの出力のディレクトリに書き、パスを返す。 */
const writeCsv = async (testInfo: TestInfo, schedules: string, visits: string) => {
  const files = {
    schedules: testInfo.outputPath('schedules.csv'),
    visits: testInfo.outputPath('visits.csv'),
  }
  await writeFile(files.schedules, schedules)
  await writeFile(files.visits, visits)
  return files
}

/** 照合の画面を開き、「照合する」が出るまで待つ。 */
const openReceipt = async (page: Page) => {
  await page.goto('/receipt')
  await expect(page.getByTestId('receipt-check-submit')).toBeVisible()
}

/** 照合の画面で、予定の CSV と実績の CSV を選んで照合し、結果の画面へ移る。 */
const checkWithCsv = async (page: Page, files: { schedules: string; visits: string }) => {
  await page.getByTestId('receipt-source-csv').check()
  await page.getByTestId('receipt-schedules-file').setInputFiles(files.schedules)
  await page.getByTestId('receipt-visits-file').setInputFiles(files.visits)
  await page.getByTestId('receipt-check-submit').click()
  await expect(page).toHaveURL(/\/receipt\/result$/)
}

test.describe('照合の結果', () => {
  test.describe(`表示する行の切り替え（${LOGIN_STAFF.name}、マネージャー）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test(
      'receipt-row-view-default 照合の結果の画面を開いた場合、確認が要る行だけが出ること',
      { tag: '@compare' },
      async ({ page }, testInfo) => {
        const files = await writeCsv(testInfo, MIXED_SCHEDULES, MIXED_VISITS)
        await openReceipt(page)
        await intro(
          page,
          '確認が要る行と、全てが合う整合の行が混ざる結果を開く\n前提 ダミーの CSV の利用者G の行だけは、予定と実績が全て合う',
        )

        await step(page, '予定の CSV と実績の CSV を選び、照合する', () =>
          checkWithCsv(page, files),
        )
        await check(
          page,
          '「確認が要る行（3 件）」が選ばれ、不整合、予定のみ、注意のある整合の利用者D の行だけが出る。行の無い実績のみの見出しは出ない',
          () => expect(receiptResultRow(page, '利用者D')).toBeVisible(),
        )
      },
    )

    test('receipt-row-view-all 全ての行を押した場合、注意の無い整合の行も出て、区分の見出しの件数が全ての行の数になること', async ({
      page,
    }, testInfo) => {
      const files = await writeCsv(testInfo, MIXED_SCHEDULES, MIXED_VISITS)
      await openReceipt(page)
      await intro(page, '表示する行を「全ての行」に切り替える')

      await step(page, '予定の CSV と実績の CSV を選び、照合する', async () => {
        await checkWithCsv(page, files)
        await expect(receiptResultRow(page, '利用者G')).toHaveCount(0)
      })
      await step(page, '「全ての行（4 件）」を押す', () =>
        page.getByTestId('receipt-row-view-all').check(),
      )
      await check(
        page,
        '全てが合う利用者G の行も出て、見出しは「整合データ（2 件）」になり、行の無い「実績のみ（0 件）」の見出しも出る',
        async () => {
          await expect(receiptResultRow(page, '利用者G')).toBeVisible()
          await expect(page.getByTestId('receipt-category-match')).toHaveText('整合データ（2 件）')
          await expect(page.getByTestId('receipt-category-visit_only')).toHaveText(
            '実績のみ（0 件）',
          )
          await expect(page.getByTestId('receipt-row-count')).toHaveText(
            '4 件の行を表示しています。',
          )
        },
      )
    })

    // 改修前は「全ての行を表示」が無く、2 つ目の操作ができないので、改修前とは比べない
    test('receipt-row-view-nothing 全ての行が整合で注意も無い結果を開いた場合、表の代わりに知らせが出て、全ての行に切り替えると表が出ること', async ({
      page,
    }, testInfo) => {
      const files = await writeCsv(testInfo, CLEAN_SCHEDULES, CLEAN_VISITS)
      await openReceipt(page)
      await intro(
        page,
        '全ての行が整合で、注意も無い結果を開く\n前提 ダミーの CSV の 2 行は、予定と実績が全て合う',
      )

      await step(page, '予定の CSV と実績の CSV を選び、照合する', () => checkWithCsv(page, files))
      await check(
        page,
        '表の代わりに「確認が要る行はありません。」の知らせと、「全ての行を表示」が出る',
        async () => {
          await expect(page.getByTestId('receipt-result-table')).toHaveCount(0)
          await expect(page.getByTestId('receipt-needs-empty')).toContainText(
            '確認が要る行はありません。全ての行で、予定と実績が規則に合っています。',
          )
        },
      )

      await step(page, '「全ての行を表示」を押す', () =>
        page.getByTestId('receipt-row-view-show-all').click(),
      )
      await check(page, '「全ての行」が選ばれ、全てが合う 2 行の表が出る', async () => {
        await expect(page.getByTestId('receipt-row-view-all')).toBeChecked()
        await expect(page.getByTestId('receipt-category-match')).toHaveText('整合データ（2 件）')
      })
    })

    test('receipt-row-view-keyboard キーボードで切り替えに移り左右の矢印キーを押した場合、選択肢と表示する行が変わること', async ({
      page,
    }, testInfo) => {
      const files = await writeCsv(testInfo, MIXED_SCHEDULES, MIXED_VISITS)
      await openReceipt(page)
      await intro(page, 'キーボードで、表示する行を切り替える')

      await step(page, '予定の CSV と実績の CSV を選び、照合する', () => checkWithCsv(page, files))

      await step(page, '「確認が要る行」の選択肢にフォーカスを移し、→ を押す', async () => {
        await page.getByTestId('receipt-row-view-needs').focus()
        await page.keyboard.press('ArrowRight')
      })
      await check(page, '「全ての行」が選ばれ、全てが合う利用者G の行が出る', async () => {
        await expect(page.getByTestId('receipt-row-view-all')).toBeChecked()
        await expect(page.getByTestId('receipt-row-view-all')).toBeFocused()
        await expect(receiptResultRow(page, '利用者G')).toBeVisible()
      })

      await step(page, '← を押す', () => page.keyboard.press('ArrowLeft'))
      await check(page, '「確認が要る行」に戻り、利用者G の行が消える', async () => {
        await expect(page.getByTestId('receipt-row-view-needs')).toBeChecked()
        await expect(receiptResultRow(page, '利用者G')).toHaveCount(0)
      })
    })

    test('receipt-row-view-csv 切り替えた後に CSV をダウンロードした場合、CSV が全ての行を持つこと', async ({
      page,
    }, testInfo) => {
      const files = await writeCsv(testInfo, MIXED_SCHEDULES, MIXED_VISITS)
      await openReceipt(page)
      await intro(page, '「確認が要る行」を出したまま、CSV をダウンロードする')

      await step(page, '予定の CSV と実績の CSV を選び、照合する', async () => {
        await checkWithCsv(page, files)
        await expect(page.getByTestId('receipt-row-view-needs')).toBeChecked()
        await expect(receiptResultRow(page, '利用者G')).toHaveCount(0)
      })

      let csv = ''
      await step(page, '「確認が要る行」を出したまま、「CSV をダウンロード」を押す', async () => {
        csv = (await downloadFile(page.getByTestId('receipt-download'))).toString('utf8')
      })
      await check(
        page,
        '表に出ていない利用者G の行も含め、CSV は 4 行の結果を持つ（録画に映らないので、本文に値を書く）',
        async () => {
          const rows = csv.split('\r\n').filter((line) => line.includes(',2024-04-01,'))
          expect(rows).toHaveLength(4)
          expect(csv).toContain(',2024-04-01,利用者G,')
        },
      )
    })
  })
})
