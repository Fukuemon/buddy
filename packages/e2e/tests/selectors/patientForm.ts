import type { Page } from '@playwright/test'

/**
 * 利用者の登録の担当の職員の選択肢。name を渡すと、その名前の選択肢だけを指す。選択肢の option には testid が無い。
 * ネイティブの select の選択肢は録画に映らないので、エビデンスでは選択肢の名前を字幕に書く。
 */
export const patientNewStaffOptions = (page: Page, name?: string) =>
  page
    .getByTestId('patient-new-staff')
    .getByRole('option', name === undefined ? {} : { name, exact: true })
