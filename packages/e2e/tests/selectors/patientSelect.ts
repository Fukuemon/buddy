import type { Page } from '@playwright/test'

/**
 * 予定の作成の利用者の候補のうち、名前で指す候補。
 * 候補の testid は利用者の ID を末尾に持つので、画面で登録して ID を知らない利用者は、候補のラベルの名前で指す。
 */
export const patientOptionByName = (page: Page, name: string) =>
  page.getByRole('radio', { name, exact: true })
