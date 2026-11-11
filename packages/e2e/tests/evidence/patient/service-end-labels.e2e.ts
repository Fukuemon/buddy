import { expect, test, type Browser } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { LOGIN_STAFF, LOGIN_STATE } from '../../fixtures/env'
import { endPatientService, registerPatient } from '../../fixtures/patient'
import { prepareOutsideRecording } from '../../fixtures/recording'
import { issueManagerToken, STAFF_FORM } from '../../fixtures/staff'

/**
 * 録画の外で、マネージャーのトークンで担当を青木 陽菜にした利用者を登録し、名前と ID を返す。
 * ended を渡すと、登録した利用者の利用を API で終了しておく。
 */
const preparePatient = (browser: Browser, name: string, { ended = false } = {}) =>
  prepareOutsideRecording(browser, {}, async (page) => {
    const token = await issueManagerToken()
    const res = await registerPatient(page.request, token, STAFF_FORM.facilityId, {
      name,
      assignedStaffId: LOGIN_STAFF.id,
    })
    expect(res.status()).toBe(201)
    const id = ((await res.json()) as { id: string }).id
    if (ended) expect((await endPatientService(page.request, token, id)).status()).toBe(200)
    return { name, id }
  })

test.describe('利用者の詳細', () => {
  test.describe(`${LOGIN_STAFF.name}（マネージャー、職員の管理の権限あり）`, () => {
    test.use({ storageState: LOGIN_STATE })

    test('patient-end-menu-label 利用中の利用者の詳細で「…」のメニューを開いた場合、「利用を終了する」が出ること', async ({
      browser,
      context,
    }) => {
      const patient = await preparePatient(browser, '見本 夏美')

      const page = await context.newPage()
      await page.goto(`/patients/${patient.id}`)
      await expect(page.getByTestId('patient-detail-name')).toHaveText(patient.name)
      await intro(
        page,
        `利用中の利用者の詳細の「…」のメニューに、「利用を終了する」が出る\n前提 利用中の ${patient.name} の詳細を開いている`,
      )

      await step(page, '「…」を押す', () => page.getByTestId('patient-detail-menu').click())
      await check(page, '「…」のメニューに「利用を終了する」が出る', () =>
        expect(page.getByTestId('patient-detail-end')).toHaveText('利用を終了する'),
      )
    })

    test('patient-end-dialog-text 利用の終了の確認のダイアログを開いた場合、何が起きるかと利用の再開で戻せることが書かれていること', async ({
      browser,
      context,
    }) => {
      const patient = await preparePatient(browser, '見本 秋穂')

      const page = await context.newPage()
      await page.goto(`/patients/${patient.id}`)
      await expect(page.getByTestId('patient-detail-name')).toHaveText(patient.name)
      await intro(
        page,
        `利用の終了の確認のダイアログに、何が起きるかと、利用の再開で戻せることが書かれている\n前提 利用中の ${patient.name} の詳細を開いている`,
      )

      await step(page, '「…」から「利用を終了する」を押す', async () => {
        await page.getByTestId('patient-detail-menu').click()
        await page.getByTestId('patient-detail-end').click()
      })
      const dialog = page.getByTestId('patient-end-dialog')
      await check(
        page,
        '予定の候補と一覧に出なくなること、過去の予定が残ること、利用を再開すると戻せることが書かれ、確定のボタンは「利用を終了する」',
        async () => {
          await expect(dialog.getByTestId('patient-end-schedules')).toHaveText(
            '今日以降の予定は残っていません。',
          )
          await expect(dialog).toContainText(`${patient.name} の利用を終了しますか`)
          await expect(dialog).toContainText(
            `利用を終了すると、${patient.name} は予定の利用者の候補と、利用者の一覧に、ふだんは出なくなります。`,
          )
          await expect(dialog).toContainText(
            '過去の予定は残り、利用を再開すると同じ利用者として戻せます。',
          )
          await expect(dialog.getByTestId('patient-end-submit')).toHaveText('利用を終了する')
        },
      )

      await step(page, '（撮影のため、利用を終了せずに「キャンセル」で閉じる）', async () => {
        await dialog.getByTestId('patient-end-cancel').click()
        await expect(dialog).toHaveCount(0)
      })
    })

    test('patient-resume-menu-label 利用の終了の利用者の詳細で「…」のメニューを開いた場合、「利用を再開する」が出ること', async ({
      browser,
      context,
    }) => {
      const patient = await preparePatient(browser, '見本 冬美', { ended: true })

      const page = await context.newPage()
      await page.goto(`/patients/${patient.id}`)
      await expect(page.getByTestId('patient-detail-status')).toContainText('利用の終了')
      await intro(
        page,
        `利用の終了の利用者の詳細の「…」のメニューに、「利用を再開する」が出る\n前提 利用の終了の ${patient.name} の詳細を開いている（API で利用を終了してある）`,
      )

      await step(page, '「…」を押す', () => page.getByTestId('patient-detail-menu').click())
      await check(page, '「…」のメニューに「利用を再開する」が出る', () =>
        expect(page.getByTestId('patient-detail-resume')).toHaveText('利用を再開する'),
      )
    })
  })
})
