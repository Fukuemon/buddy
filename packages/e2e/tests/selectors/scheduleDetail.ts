import type { Page } from '@playwright/test'

/** 予定の詳細のダイアログの、項目の値（dd）。行ごとの testid が無い。 */
export const scheduleDetailValues = (page: Page) =>
  page.getByTestId('schedule-detail-modal').getByRole('definition')

/** 予定の詳細を読めなかったときの文。読み込みの失敗のモーダルは、文に testid が無い。 */
export const scheduleDetailError = (page: Page) => page.getByRole('dialog').getByRole('alert')

/**
 * 予定の詳細の下端の「予定を削除」のボタン。役割と名前で指す。
 * 改修前（#945 より前）の画面には、ボタンも testid の schedule-detail-delete-schedule も無い。
 * testid で無いことを確認しても、ボタンが無いことにはならないので、改修前と改修後を同じ指し方で比べる。
 */
export const scheduleDetailDeleteButton = (page: Page) =>
  page.getByTestId('schedule-detail-modal').getByRole('button', { name: '予定を削除', exact: true })
