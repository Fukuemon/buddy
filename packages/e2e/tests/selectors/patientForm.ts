import type { Page } from '@playwright/test'

/** 利用者の登録の担当の職員の選択肢のうち、職員の名前のもの。選択肢の option には testid が無い。 */
export const patientNewStaffOption = (page: Page, name: string) =>
  page.getByTestId('patient-new-staff').getByRole('option', { name, exact: true })
