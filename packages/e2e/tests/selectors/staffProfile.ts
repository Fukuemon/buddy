import type { Page } from '@playwright/test'

/**
 * 職員の詳細の基本の情報の、項目の値（dd）。行ごとの testid が無いので、項目の名前（dt）の隣で指す。
 *
 * @param label 項目の名前。例: チーム、部署
 */
export const staffProfileValue = (page: Page, label: string) =>
  page.getByTestId('staff-detail-profile').locator(`dt:text-is("${label}") + dd`)
