import type { Locator } from '@playwright/test'

/**
 * 役職を変えるダイアログの、今の役職でない最初の役職のラジオボタン。
 * 役職の testid は役職の ID を含み、story のデータで変わるので、選ばれていないことで指す。
 */
export const otherPositionOption = (dialog: Locator) =>
  dialog.locator('[data-testid^="staff-position-option-"]:not(:checked)').first()
