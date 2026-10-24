import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { Browser, Page } from '@playwright/test'

import { variantsFromEnv, type Variant } from '@fukuemon/e2e-kit/evidence'
import {
  recordPrEvidence as recordKitPrEvidence,
  type Recording,
} from '@fukuemon/e2e-kit/recording'

import { BASE_URL, TIMEZONE_ID } from './env'

const root = fileURLToPath(new URL('../../../..', import.meta.url))

/**
 * 撮る版。デフォルトは E2E_BASE_URL の 1 つの版を撮る。
 * EVIDENCE_BEFORE_URL を渡すと、E2E_BASE_URL を改修後、EVIDENCE_BEFORE_URL を改修前として両方を撮る。
 * EVIDENCE_ONLY に before か after を渡すと、E2E_BASE_URL をその版として 1 つだけ撮る。
 */
export const EVIDENCE_VARIANTS = variantsFromEnv(BASE_URL)

/** パソコンの幅の画面と録画の大きさ。pull request の本文で読める大きさにする */
export const DESKTOP_VIEWPORT = { width: 1280, height: 800 }

/** スマートフォンの幅の画面と録画の大きさ */
export const PHONE_VIEWPORT = { width: 390, height: 844 }

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

/**
 * pull request か issue のエビデンスを 1 本撮る。kit の recordPrEvidence に buddy の値を渡す。
 * 環境変数 EVIDENCE_FOR（`issue-<番号>` か `pr-<番号>`）の `.ai-out/evidence/<EVIDENCE_FOR>/` に書き出す。
 * kit の録画は `<EVIDENCE_FOR>/<name>/` に mp4、スクリーンショット、README を書き、添付する mp4 を `<EVIDENCE_FOR>/<name>.mp4` にコピーする。
 * 改修前と改修後を撮るときは、`<name>-before.mp4` と `<name>-after.mp4` にする。
 *
 * @param o.name 観点が分かる英小文字、数字、ハイフンの名前。添付したファイル名として動画の上に出る
 * @param o.title 観点の文。README の見出しになる
 * @param o.actor ログインする職員の名前と役職。画面にログインしないものは「ログインなし」にする
 * @param o.viewport 画面と録画の大きさ。デフォルトは DESKTOP_VIEWPORT
 * @param prepare 録画の外で、ログインとテストデータの確認を行い、録画する画面の origin を開いたまま返す
 * @param body 録画する操作。step と check で字幕を出してから操作する
 */
export const recordPrEvidence = async <T>(
  browser: Browser,
  o: {
    name: string
    title: string
    actor: string
    variant: Variant
    viewport?: { width: number; height: number }
  },
  prepare: (page: Page) => Promise<T>,
  body: (r: Recording, prepared: T) => Promise<void>,
): Promise<void> =>
  recordKitPrEvidence(
    browser,
    {
      root,
      appName: 'buddy',
      viewport: o.viewport ?? DESKTOP_VIEWPORT,
      timezoneId: TIMEZONE_ID,
    },
    { name: o.name, title: o.title, actor: o.actor, variant: o.variant },
    prepare,
    body,
  )
