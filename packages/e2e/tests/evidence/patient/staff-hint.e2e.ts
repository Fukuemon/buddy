import { expect, test, type Page } from '@playwright/test'

import { check, intro, step } from '../../fixtures/caption'
import { storyUrl } from '../../fixtures/evidence'

/** 小林 冬馬の詳細。担当の青木 一郎を、訪問しない職員として返す。 */
const NON_VISITING_DETAIL = storyUrl('画面-patient-patientdetailcontainer--non-visiting-staff')
const CREATE_DIALOG = storyUrl('画面-patient-patientcreatedialogcontainer--default')

const EDIT_HINT =
  '休職と退職の職員と、訪問しない職員は新しく選べず、今の担当のままなら保存できます。'
const CREATE_HINT = '休職と退職の職員と、訪問しない職員は選べません。'
const CURRENT_STAFF = '青木 一郎（訪問しない。今の担当）'

const openDetail = async (page: Page) => {
  await page.goto(NON_VISITING_DETAIL)
  await expect(page.getByTestId('patient-detail-profile')).toContainText('青木 一郎')
}

/** 編集のダイアログを開き、担当の職員の欄が今の担当を選んだ状態になるまで待つ。 */
const openEditDialog = async (page: Page) => {
  await page.getByTestId('patient-detail-edit').click()
  await expect(
    page.getByTestId('patient-detail-edit-dialog').getByTestId('patient-detail-staff-input'),
  ).toHaveValue('staff-1')
}

test.describe('利用者の担当の職員の補足の文', () => {
  test.describe('ログインなし（Storybook の story）', () => {
    test('patient-edit-staff-hint 利用者の編集のダイアログを開いた場合、訪問しない職員を含む補足の文が出ること', async ({
      page,
    }) => {
      await openDetail(page)
      await intro(
        page,
        '利用者の編集のダイアログで、担当の職員の欄の下の補足の文を見る\n前提 利用者の詳細（Storybook の PatientDetailContainer の NonVisitingStaff）を開いている',
      )

      await step(page, '「編集」を押す', () => openEditDialog(page))
      await check(page, `担当の職員の欄の下に「${EDIT_HINT}」が出る`, () =>
        expect(
          page.getByTestId('patient-detail-edit-dialog').getByTestId('patient-detail-staff-input'),
        ).toHaveAccessibleDescription(EDIT_HINT),
      )
    })

    test('patient-create-staff-hint 利用者の登録のダイアログを開いた場合、訪問しない職員を含む補足の文が出ること', async ({
      page,
    }) => {
      await page.goto(CREATE_DIALOG)
      await expect(page.getByTestId('patient-new-name')).toBeVisible()
      await intro(
        page,
        '利用者の登録のダイアログで、担当の職員の欄の下の補足の文を見る\n前提 利用者の登録のダイアログ（Storybook の PatientCreateDialogContainer の Default）を開いている',
      )

      await check(page, `担当の職員の欄の下に「${CREATE_HINT}」が出る`, () =>
        expect(page.getByTestId('patient-new-staff')).toHaveAccessibleDescription(CREATE_HINT),
      )
    })

    test('patient-edit-keep-non-visiting-staff 今の担当が訪問しない職員の利用者を、担当を変えずに保存した場合、保存でき担当が変わらないこと', async ({
      page,
    }) => {
      await openDetail(page)
      await intro(
        page,
        '今の担当が訪問しない職員の利用者を、担当を変えずに保存する\n前提 担当の職員が訪問しない青木 一郎の利用者の詳細（Storybook の PatientDetailContainer の NonVisitingStaff）を開いている',
      )

      await step(page, '「編集」を押す', () => openEditDialog(page))
      const dialog = page.getByTestId('patient-detail-edit-dialog')
      await check(page, `担当の職員の欄に「${CURRENT_STAFF}」が選ばれている`, () =>
        expect(dialog.getByTestId('patient-detail-staff-input')).toContainText(CURRENT_STAFF),
      )

      await step(page, '担当の職員を変えずに「保存」を押す', () =>
        dialog.getByTestId('patient-detail-save').click(),
      )
      await check(page, 'ダイアログが閉じ、詳細の担当の職員は青木 一郎のまま', async () => {
        await expect(dialog).toBeHidden()
        await expect(page.getByTestId('patient-detail-profile')).toContainText('青木 一郎')
      })
    })
  })
})
