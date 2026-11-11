// エビデンスの spec が開く、Storybook の story と画面仕様書のモックの URL。
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../../../..', import.meta.url))

/** Storybook の URL。デフォルトは `pnpm --filter @buddy/web storybook` の開発サーバーである */
export const STORYBOOK_URL = process.env.E2E_STORYBOOK_URL ?? 'http://localhost:6006'

/**
 * Storybook の枠を外して、1 つの story だけを開く URL。
 *
 * @param id story の ID。Storybook の URL の `?path=/story/<id>` の部分
 */
export const storyUrl = (id: string): string =>
  `${STORYBOOK_URL}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`

/**
 * 画面仕様書のモックを、リポジトリのファイルのまま開く URL。
 *
 * @param file `docs/screens/` からの相対パス。例: `schedule-calendar_予定のカレンダー/mocks/03-day.html`
 */
export const mockUrl = (file: string): string =>
  pathToFileURL(path.join(root, 'docs/screens', file)).href
