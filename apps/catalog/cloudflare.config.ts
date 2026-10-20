// Storybook のカタログを出す Worker。中身は apps/web の Storybook の成果物だけで、スクリプトを持たない。
// Worker には Cloudflare の画面で Access を掛けてある（手順は README.md）。名前を変えると、新しい Worker が Access なしで出る。
import { defineConfig } from 'cf/config'

export default defineConfig({
  worker: {
    name: 'buddy-storybook',
    compatibilityDate: '2026-10-01',
    // 本番の workers.dev の URL と、pull request ごとのプレビューの URL を出す。どちらも Access で守る
    workersDev: true,
    previewUrls: true,
  },
})
