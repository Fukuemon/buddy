import type { Download, Page } from '@playwright/test'

/** ページが次に始めるダウンロードを待つ。ダウンロードを始める操作の前に呼ぶ。 */
export const waitForDownload = (page: Page): Promise<Download> => page.waitForEvent('download')
