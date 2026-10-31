import type { Page } from '@playwright/test'

/**
 * カタログ（Storybook）のトークンの色のページの、チームの色のセクション。
 * buddy の画面ではなく、画面仕様書のモックにも無いので testid を付けない。色のユーティリティのクラスで指す。
 */
export const catalogTeamColors = (page: Page) => ({
  /** チームの色の見本の 1 つ目の並びの名前。セクションまで移るのと、見本が出たことの確認に使う */
  palette: page.getByText('team-blue から team-yellow', { exact: true }),
  /** 面の上の点。`surface` は面の名前（`surface`、`surface-canvas` など）、`color` はチームの色の値 */
  dot: (surface: string, color: string) =>
    page.locator(`div.bg-${surface} span.bg-team-${color}`).first(),
  /** 区別の色と並べた例の、チームの点の行。`color` はチームの色の値 */
  categoricalRow: (color: string) => page.getByText(`チーム ${color}`, { exact: true }),
})
