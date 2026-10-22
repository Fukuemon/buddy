import { execFileSync } from 'node:child_process'
import { copyFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { Browser, Page } from '@playwright/test'

import { evidenceName, variants, type Variant } from '../../kit/evidence/index.js'
import { recordEvidence, type Recording } from '../../kit/recording/index.js'
import { BASE_URL } from './env'

const root = fileURLToPath(new URL('../../../..', import.meta.url))

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

/** パソコンの幅の画面と録画の大きさ。pull request のコメントで読める大きさにする */
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

/** 撮った worktree のコミット。未コミットの変更があれば末尾に -dirty が付く。改修前の版は別のコードなので空にする */
const versionOf = (variant: Variant): string =>
  variant.name === 'before'
    ? ''
    : execFileSync('git', ['describe', '--always', '--dirty', '--match=__none__'], {
        cwd: root,
        encoding: 'utf8',
      }).trim()

/**
 * pull request か issue のエビデンスを 1 本撮る。環境変数 EVIDENCE_NO の番号の `.ai-out/evidence/<番号>/` に書き出す。
 * kit の録画は `<番号>/<name>/` に mp4、スクリーンショット、README を書き、添付する mp4 を `<番号>/<name>.mp4` にコピーする。
 * 改修前と改修後を撮るときは、`<name>-before.mp4` と `<name>-after.mp4` にする。
 *
 * @param o.name 観点が分かる英小文字、数字、ハイフンの名前。添付したファイル名として動画の上に出る
 * @param o.title 観点の文。README の見出しになる
 * @param o.actor ログインする職員の名前と役職。画面にログインしないものは「ログインなし」にする
 * @param o.viewport 画面と録画の大きさ。デフォルトは DESKTOP_VIEWPORT
 * @param prepare 録画の外で、ログインとテストデータの確かめを行い、録画する画面の origin を開いたまま返す
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
): Promise<void> => {
  const no = process.env.EVIDENCE_NO
  if (!no || !/^\d+$/.test(no))
    throw new Error(`EVIDENCE_NO に pull request か issue の番号を渡す: ${no ?? ''}`)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(o.name))
    throw new Error(`name は英小文字、数字、ハイフンにする: ${o.name}`)
  const out = path.join(root, '.ai-out/evidence', no)
  const dir = path.join(out, o.name)
  const suffix = o.variant.name === 'single' ? '' : `-${o.variant.name}`
  const attached = path.join(out, `${o.name}${suffix}.mp4`)
  // 撮影が途中で失敗したときに、前の撮影の動画を添付しないよう、先に消す
  rmSync(attached, { force: true })
  await recordEvidence(
    browser,
    {
      dir,
      appName: 'buddy',
      envLabel: 'ローカル環境',
      readVersion: async () => versionOf(o.variant),
      viewport: o.viewport ?? DESKTOP_VIEWPORT,
    },
    {
      scenario: { issue: no, id: `#${no} ${o.name}`, actor: o.actor, no: 0, title: o.title },
      variant: o.variant,
    },
    prepare,
    body,
  )
  copyFileSync(path.join(dir, `${evidenceName(o.variant)}.mp4`), attached)
}
