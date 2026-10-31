import type { Page } from '@playwright/test'

/**
 * 予定の編集の画面仕様書のモック（10-invalid.html）の、提供時間の欄の下の誤りの文。
 * apps/web の FieldFrame と同じく testid を持たず、入力の欄の aria-describedby が id で指す。
 */
export const serviceTimeErrorInMock = (page: Page) => page.locator('#service-time-error')
