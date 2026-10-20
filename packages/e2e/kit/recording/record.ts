import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import type { Browser, Page } from '@playwright/test'
import { evidenceName, type Example, type Scenario, type Variant } from '../evidence/index.js'
import { caption, showCaptionInRecording } from './caption.js'
import { CURSOR_LEGEND, showCursorInRecording } from './cursor.js'
import { clearTake, finishEvidence, RECORDS_DIR, type CaptionAt } from './files.js'

const DEFAULT_VIEWPORT = { width: 1920, height: 1200 }

/** 録画している画面と、字幕の出し方 */
export type Recording = {
  page: Page
  /** 前提と操作の文を字幕に出す */
  step: (text: string) => Promise<void>
  /**
   * 判定の文を字幕に出し、出し終えた時点の画面を静止画にする。その時点の画面で判定できる文に使う。
   * allowed には、検証シナリオの備考で、この静止画で改修前と違ってよいとされた差を書く。README の比較の表に出す
   */
  check: (text: string, allowed?: string) => Promise<void>
}

/** 証跡の置き場と、字幕と README に出すアプリの値。プロダクトのリポジトリが決めて渡す */
export type RecordingTarget = {
  /** 1 つのシナリオの証跡の置き場。evidenceDir で作る */
  dir: string
  /** README に出すアプリの名前 */
  appName: string
  /** 字幕と README に出す、撮った環境の呼び名。例: 検証環境 */
  envLabel: string
  /** ログインした後の画面から、デプロイされたアプリのバージョンを読む。読めなければ空にする */
  readVersion: (page: Page) => Promise<string>
  /** 画面と録画の大きさ。無ければ 1920x1200 にする */
  viewport?: { width: number; height: number }
}

/**
 * 1 つの版と例の行を録画し、証跡の置き場へ mp4、静止画、README を書き出す。
 * 操作が途中で失敗しても、そこまでの録画を書き出してから、例外を投げ直す。何が起きたかを見るため。
 *
 * @param prepare 録画の外で、ログインとデータの確かめを行う。戻り値は body に渡る。録画は、prepare が終えたときの Cookie、localStorage、IndexedDB と、最後に開いた origin の sessionStorage を持ち越して始まる
 * @param body 録画する操作。シナリオの前提と操作の文は step で、判定の文は check で字幕に出してから操作する
 */
export const recordEvidence = async <T>(
  browser: Browser,
  target: RecordingTarget,
  s: { scenario: Scenario; variant: Variant; example?: Example },
  prepare: (page: Page) => Promise<T>,
  body: (r: Recording, prepared: T) => Promise<void>,
): Promise<void> => {
  const { dir, appName, envLabel, viewport = DEFAULT_VIEWPORT } = target
  const name = evidenceName(s.variant, s.example)
  const where = [
    s.scenario.id,
    s.example ? `${s.example.column}=${s.example.value}` : '実施',
    s.variant.label,
  ]
    .filter(Boolean)
    .join(' / ')

  const signIn = await browser.newContext({ baseURL: s.variant.baseUrl, viewport })
  const signInPage = await signIn.newPage()
  let prepared: T,
    version: string,
    storageState: Awaited<ReturnType<typeof signIn.storageState>>,
    session: { origin: string; items: Record<string, string> }
  try {
    prepared = await prepare(signInPage)
    version = await target.readVersion(signInPage)
    storageState = await signIn.storageState({ indexedDB: true })
    session = {
      origin: new URL(signInPage.url()).origin,
      items: await signInPage.evaluate(() => Object.fromEntries(Object.entries(sessionStorage))),
    }
  } finally {
    await signIn.close()
  }
  const header = `${where} / ${envLabel} ${version}`.trim()

  mkdirSync(path.join(dir, RECORDS_DIR), { recursive: true })
  mkdirSync(path.join(dir, 'frames'), { recursive: true })
  clearTake(dir, name)
  const context = await browser.newContext({
    baseURL: s.variant.baseUrl,
    viewport,
    storageState,
    recordVideo: { dir: path.join(dir, RECORDS_DIR, 'raw'), size: viewport },
  })
  // storageState は sessionStorage を持たないので、prepare が最後に開いた origin の分だけを持ち越す。タブで最初に開いたときだけ入れ、画面が書き換えた値を読み直しで戻さない
  await context.addInitScript(({ origin, items }) => {
    if (location.origin !== origin || sessionStorage.getItem('__e2e-session-restored')) return
    for (const [k, v] of Object.entries(items)) sessionStorage.setItem(k, v)
    sessionStorage.setItem('__e2e-session-restored', '1')
  }, session)
  await showCursorInRecording(context)
  await showCaptionInRecording(context, `${header}　(${CURSOR_LEGEND})`)
  const page = await context.newPage()
  const startedAt = Date.now()
  const captions: CaptionAt[] = []
  const show = async (text: string, still: boolean, allowed?: string) => {
    const at = (Date.now() - startedAt) / 1000
    await caption(page, text)
    const frame = still
      ? `frames/${name}-${captions.filter((c) => c.frame).length + 1}.png`
      : undefined
    if (frame) await page.screenshot({ path: path.join(dir, frame) })
    captions.push({ at, text, frame, allowed })
  }

  let failure: unknown
  try {
    await body(
      { page, step: (t) => show(t, false), check: (t, allowed) => show(t, true, allowed) },
      prepared,
    )
  } catch (e) {
    failure = e
  }
  const elapsed = (Date.now() - startedAt) / 1000
  // 操作の失敗で runner が先にコンテキストを閉じていても、録画は残っているので続ける
  await context.close().catch(() => undefined)
  const webm = path.join(dir, RECORDS_DIR, `${name}.webm`)
  await page.video()?.saveAs(webm)
  await page.video()?.delete()
  rmSync(path.join(dir, RECORDS_DIR, 'raw'), { recursive: true, force: true })
  finishEvidence(dir, {
    name,
    header,
    appName,
    envLabel,
    version,
    variant: s.variant,
    example: s.example,
    scenario: s.scenario,
    captions,
    elapsed,
    failure:
      failure === undefined
        ? undefined
        : failure instanceof Error
          ? String(failure)
          : JSON.stringify(failure),
  })
  if (failure !== undefined) throw failure
}
