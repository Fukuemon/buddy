// ドキュメントサイトと Storybook のカタログを出す Worker。中身は scripts/build-docs-site.mjs が並べた静的なファイルだけで、スクリプトを持たない。
// Worker は Cloudflare Access で守らず、誰でも開ける。名前を変えるときは、先に README.md の手順で Worker とトークンを用意する。
import { defineConfig } from 'cf/config'

export default defineConfig({
  worker: {
    name: 'buddy-docs',
    compatibilityDate: '2026-10-01',
    // 本番の workers.dev の URL だけを出す。プレビューは出さない（ADR-0019）ので、プレビューの URL は無効にする
    workersDev: true,
    previewUrls: false,
  },
})
