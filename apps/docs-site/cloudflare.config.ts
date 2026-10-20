// 文書のサイトと Storybook のカタログを出す Worker。中身は scripts/build-docs-site.mjs が並べた静的なファイルだけで、スクリプトを持たない。
// Worker には Cloudflare の画面で Access を掛けてある（手順は README.md）。名前を変えると、新しい Worker が Access なしで出る。
import { defineConfig } from 'cf/config'

export default defineConfig({
  worker: {
    name: 'buddy-docs',
    compatibilityDate: '2026-10-01',
    // 本番の workers.dev の URL と、pull request ごとのプレビューの URL を出す。どちらも Access で守る
    workersDev: true,
    previewUrls: true,
  },
})
