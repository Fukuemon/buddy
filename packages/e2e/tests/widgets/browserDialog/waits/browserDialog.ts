import type { Dialog, Page } from '@playwright/test'

/** ページが次に出すブラウザのダイアログ（window.confirm など）を待つ。ダイアログを出す操作の前に呼ぶ。 */
export const waitForBrowserDialog = (page: Page): Promise<Dialog> => page.waitForEvent('dialog')
