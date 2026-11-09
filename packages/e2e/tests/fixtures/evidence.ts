import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { Browser, Page } from '@playwright/test'

import { prEvidenceDir, variants, type PrViewpoint, type Variant } from '@fukuemon/e2e-kit/evidence'
import {
  recordEvidence,
  worktreeVersion,
  type Recording,
  type Viewport,
} from '@fukuemon/e2e-kit/recording'

import { BASE_URL, TIMEZONE_ID } from './env'

const root = fileURLToPath(new URL('../../../..', import.meta.url))

/**
 * エビデンスの配置先の根。kit の prEvidenceDir に渡す。
 * 入れる先（EVIDENCE_FOR）ごとに、`<入れる先>/evidence/<name>_<title>/` ができる
 */
export const EVIDENCE_ROOT = path.join(root, '.ai-out/evidence')

/**
 * 撮る版。デフォルトは E2E_BASE_URL の 1 つの版を撮る。
 * EVIDENCE_BEFORE_URL を渡すと、E2E_BASE_URL を改修後、EVIDENCE_BEFORE_URL を改修前として両方を撮る。
 * EVIDENCE_ONLY に before か after を渡すと、E2E_BASE_URL をその版として 1 つだけ撮る。
 */
export const EVIDENCE_VARIANTS = variants({
  baseUrl: BASE_URL,
  beforeBaseUrl: process.env.EVIDENCE_BEFORE_URL,
  only: process.env.EVIDENCE_ONLY,
})

/** パソコンの幅の画面と録画の大きさ。pull request の本文で読める大きさにする */
export const DESKTOP_VIEWPORT: Viewport = { width: 1280, height: 800 }

/** スマートフォンの幅の画面と録画の大きさ */
export const PHONE_VIEWPORT: Viewport = { width: 390, height: 844 }

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
 * 環境変数 EVIDENCE_FOR の入れる先（`issue-<番号>` か `pr-<番号>`）。形が違えば例外を投げるので、spec の中で呼ぶ
 */
const evidenceFor = (): string => {
  const value = process.env.EVIDENCE_FOR
  if (!value || !/^(issue|pr)-[1-9]\d*$/.test(value))
    throw new Error(`EVIDENCE_FOR に issue-<番号> か pr-<番号> を渡す: ${value ?? ''}`)
  return value
}

/**
 * pull request か issue のエビデンスを 1 本撮る。kit の recordEvidence に buddy の値を渡す。
 * 観点は、pr を入れる先、no を name、title を title にした PrViewpoint にする。
 * `.ai-out/evidence/<EVIDENCE_FOR>/evidence/<name>_<title>/` に、`<name>_実施.mp4`（改修前と比べるときは `<name>_改修前.mp4` と `<name>_改修後.mp4`）、
 * 判定のスクリーンショット、README を書き出す。
 * actor は、kit の観点がアクターを持たないので、字幕と README には出ない。spec を読む人に、ログインする職員を示す。
 *
 * @param o.name 観点が分かる英小文字、数字、ハイフンの名前。配置先とファイル名の先頭になる
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
    viewport?: Viewport
  },
  prepare: (page: Page) => Promise<T>,
  body: (r: Recording, prepared: T) => Promise<void>,
): Promise<void> => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(o.name))
    throw new Error(`name は英小文字、数字、ハイフンにする: ${o.name}`)
  const viewpoint: PrViewpoint = { pr: evidenceFor(), no: o.name, title: o.title }
  await recordEvidence(
    browser,
    {
      dir: prEvidenceDir({ root: EVIDENCE_ROOT, viewpoint }),
      appName: 'buddy',
      envLabel: 'ローカル環境',
      viewport: o.viewport ?? DESKTOP_VIEWPORT,
      timezoneId: TIMEZONE_ID,
      readVersion: async () => worktreeVersion(root, o.variant),
    },
    { viewpoint, variant: o.variant },
    prepare,
    body,
  )
}
