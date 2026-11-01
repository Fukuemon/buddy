import { expect, test, type Page } from '@playwright/test'

import { EVIDENCE_VARIANTS, recordPrEvidence, storyUrl } from '../../fixtures/evidence'

const ACTOR = 'ログインなし（Storybook の story）'
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

const openCreate = async (page: Page) => {
  await page.goto(CREATE_DIALOG)
  await expect(page.getByTestId('patient-new-name')).toBeVisible()
}

/** 編集のダイアログを開き、担当の職員の欄が今の担当を選んだ状態になるまで待つ。 */
const openEditDialog = async (page: Page) => {
  await page.getByTestId('patient-detail-edit').click()
  const dialog = page.getByTestId('patient-detail-edit-dialog')
  await expect(dialog.getByTestId('patient-detail-staff-input')).toHaveValue('staff-1')
  return dialog
}

test.describe('利用者の担当の職員の補足の文', () => {
  for (const variant of EVIDENCE_VARIANTS) {
    const prefix = variant.label ? `${variant.label}: ` : ''

    test(`${prefix}利用者の編集のダイアログを開いた場合、訪問しない職員を含む補足の文が出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'patient-edit-staff-hint',
          title: '利用者の編集のダイアログで、担当の職員の欄の下の補足の文を見る',
          actor: ACTOR,
          variant,
        },
        openDetail,
        async ({ page, step, check }) => {
          await openDetail(page)
          await step(
            '利用者の詳細（Storybook の PatientDetailContainer の NonVisitingStaff）を開いている',
          )

          await step('「編集」を押す')
          const dialog = await openEditDialog(page)
          await expect(
            dialog.getByRole('combobox', { name: '担当の職員' }),
          ).toHaveAccessibleDescription(EDIT_HINT)
          await check(`担当の職員の欄の下に「${EDIT_HINT}」が出る`)
        },
      )
    })

    test(`${prefix}利用者の登録のダイアログを開いた場合、訪問しない職員を含む補足の文が出ること`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'patient-create-staff-hint',
          title: '利用者の登録のダイアログで、担当の職員の欄の下の補足の文を見る',
          actor: ACTOR,
          variant,
        },
        openCreate,
        async ({ page, step, check }) => {
          await openCreate(page)
          await step(
            '利用者の登録のダイアログ（Storybook の PatientCreateDialogContainer の Default）を開いている',
          )
          await expect(
            page.getByRole('combobox', { name: '担当の職員' }),
          ).toHaveAccessibleDescription(CREATE_HINT)
          await check(`担当の職員の欄の下に「${CREATE_HINT}」が出る`)
        },
      )
    })

    test(`${prefix}今の担当が訪問しない職員の利用者を、担当を変えずに保存した場合、保存でき担当が変わらないこと`, async ({
      browser,
    }) => {
      await recordPrEvidence(
        browser,
        {
          name: 'patient-edit-keep-non-visiting-staff',
          title: '今の担当が訪問しない職員の利用者を、担当を変えずに保存する',
          actor: ACTOR,
          variant,
        },
        openDetail,
        async ({ page, step, check }) => {
          await openDetail(page)
          await step(
            '担当の職員が訪問しない青木 一郎の利用者の詳細（Storybook の PatientDetailContainer の NonVisitingStaff）を開いている',
          )

          await step('「編集」を押す')
          const dialog = await openEditDialog(page)
          await expect(dialog.getByTestId('patient-detail-staff-input')).toContainText(
            CURRENT_STAFF,
          )
          await check(`担当の職員の欄に「${CURRENT_STAFF}」が選ばれている`)

          await step('担当の職員を変えずに「保存」を押す')
          await dialog.getByTestId('patient-detail-save').click()
          await expect(dialog).toBeHidden()
          await expect(page.getByTestId('patient-detail-profile')).toContainText('青木 一郎')
          await check('ダイアログが閉じ、詳細の担当の職員は青木 一郎のまま')
        },
      )
    })
  }
})
