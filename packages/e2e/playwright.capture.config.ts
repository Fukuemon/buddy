import { defineConfig } from '@playwright/test'
import base from './playwright.config'
import { DESKTOP_VIEWPORT } from './tests/fixtures/recording'

// 撮るバージョンの名前。改修前のアプリを撮るときは VARIANT=改修前 を渡す。字幕と、エビデンスのファイルの名前に使う
const VARIANT = process.env.VARIANT ?? '改修後'

// エビデンスを撮るときの config。E2E の config に、録画と字幕と操作ごとの止めを足す。
// 撮るアプリの URL は E2E の config の baseURL が決める。改修前と比べるときは、改修前のアプリの URL を渡して、もう 1 回撮る
export default defineConfig(base, {
  // Playwright がテストごとに書く元の録画と、その一覧の JSON。エビデンスは、スキルの scripts/collect.mjs が JSON を読んで evidence/<テストの名前>/ にまとめる
  outputDir: `evidence/.playwright/${VARIANT}`,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: `evidence/report/${VARIANT}` }],
    ['json', { outputFile: `evidence/.playwright/${VARIANT}.json` }],
  ],
  // E2E の config の metadata は丸ごと置き換わるので、重ねて残す
  metadata: { ...base.metadata, capture: true, variant: VARIANT },
  use: {
    video: {
      mode: 'on',
      // 録画の大きさは、evidence の project の画面の大きさと同じにする。スマートフォンの幅の画面は、左右に余白を付けて縮めずに入る
      size: DESKTOP_VIEWPORT,
      // 字幕は fixtures/caption.ts のバナーで出す。操作の名前(Click getByTestId(...))は人が読む文ではないので消し、押す要素を囲む
      show: {
        actions: {
          duration: 1500,
          style: {
            title: 'display: none',
            point:
              'width: 24px; height: 24px; border-radius: 50%; background: rgba(255, 152, 0, .6)',
            highlight: 'outline: 3px solid #ff9800',
          },
        },
      },
    },
  },
})
