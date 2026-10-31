import type { Locator } from '@playwright/test'

/** 予定の作成、編集、詳細のモックのモーダルのタイトル。testid を持たないので、見出しの名前で指す */
export const scheduleModalTitle = (modal: Locator, name: string) =>
  modal.getByRole('heading', { name })
