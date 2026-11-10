import { test, type Page } from '@playwright/test'

/** 字幕のバナーの位置。判定する要素にバナーが重なるときは bottom にする */
export type Position = 'top' | 'bottom'

type Kind = { label: string; color: string }

const KINDS: Record<string, Kind> = {
  前提: { label: '前提', color: '#546e7a' },
  もし: { label: '操作', color: '#1565c0' },
  ならば: { label: '判定', color: '#2e7d32' },
}
// 「かつ」「しかし」は同じテストの前の文の種類を引き継ぐ。頭の語が無い文(pull request の観点の文など)は、step なら操作、check なら判定にする
const CONTINUES = ['かつ', 'しかし']
let last = { testId: '', kind: KINDS.前提 }

// 字幕の上の行に出す、どのテストをどのバージョンで撮ったか。バージョンは撮影の config の metadata.variant で、無ければ project の名前にする
const subject = () => {
  const { title, project, config } = test.info()
  return `${title} / ${config.metadata.variant ?? project.name}`
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

const banner = (text: string, position: Position, fallback: Kind) => {
  const { testId } = test.info()
  // 全角の空白で区切っても、頭の語として読む
  const word = text.split(/[ \u3000]/)[0]
  const kind =
    KINDS[word] ?? (CONTINUES.includes(word) && last.testId === testId ? last.kind : fallback)
  last = { testId, kind }
  // 下の画面が見えるよう背景だけを透かし、ぼかして画面の文字が字幕の文字に重ならないようにする。opacity は文字まで薄くするので使わない。
  // 字幕は判定する要素に被せない。被るときは position を変える
  return `<div style="position:absolute;left:0;right:0;${position}:0;display:flex;align-items:stretch;font:18px/1.5 sans-serif;color:#fff;background:rgba(32,33,36,.6);backdrop-filter:blur(6px);text-shadow:0 1px 2px #000">
  <div style="display:flex;align-items:center;padding:0 16px;background:${kind.color};font-weight:bold;text-shadow:none">${kind.label}</div>
  <div style="padding:6px 16px"><div style="font-size:13px;color:#bdc1c6">${escape(subject())}</div><div style="white-space:pre-line">${escape(text)}</div></div>
</div>`
}

/** 撮影の config(metadata.capture)で流すときだけ、step の間 text をバナーに出す。E2E では test.step と同じ */
const captioned = (
  page: Page,
  text: string,
  position: Position,
  fallback: Kind,
  body: () => Promise<void>,
) =>
  test.step(text, async () => {
    if (!test.info().config.metadata.capture) return body()
    const overlay = await page.screencast.showOverlay(banner(text, position, fallback))
    try {
      await body()
    } finally {
      await overlay.dispose()
    }
  })

/**
 * 何を確認する録画かを、画面の中央のカードで ms だけ出す。最初の画面を開いた後に 1 度呼ぶ。
 * 撮影の config で流すときだけ出して止まり、E2E では何もしない
 */
export const intro = async (page: Page, text: string, ms = 4_000) => {
  if (!test.info().config.metadata.capture) return
  const overlay = await page.screencast
    .showOverlay(`<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(32,33,36,.45);backdrop-filter:blur(4px);font-family:sans-serif">
  <div style="max-width:min(760px,80%);background:#fff;color:#202124;border-radius:12px;border-top:8px solid #1565c0;box-shadow:0 12px 40px rgba(0,0,0,.35);padding:28px 36px">
    <div style="font-size:15px;font-weight:bold;color:#1565c0;letter-spacing:.05em">この録画で確認する観点</div>
    <div style="margin-top:12px;font-size:28px;line-height:1.5;font-weight:bold;white-space:pre-line">${escape(text)}</div>
    <div style="margin-top:20px;padding-top:12px;border-top:1px solid #dadce0;font-size:14px;color:#5f6368">${escape(subject())}</div>
  </div>
</div>`)
  await page.waitForTimeout(ms)
  await overlay.dispose()
}

/** 前提と操作の文。操作の前の止めは、撮影の config の show.actions が入れる */
export const step = (
  page: Page,
  text: string,
  body: () => Promise<void>,
  { position = 'top' }: { position?: Position } = {},
) => captioned(page, text, position, KINDS.もし, body)

/**
 * 判定の文。assert が通った後、撮るときだけ字幕を読めるだけ止めて、静止画を「判定: <文>」の名前で report に添付する。
 * 判定の step は操作を持たず、show.actions の止めが入らないため止める。
 * スキルの scripts/collect.mjs が、添付の順に check-<番号>.png としてエビデンスのフォルダに書く。改修前と改修後の同じ番号の静止画を並べて比べられる
 */
export const check = (
  page: Page,
  text: string,
  assert: () => Promise<void>,
  { position = 'top' }: { position?: Position } = {},
) =>
  captioned(page, text, position, KINDS.ならば, async () => {
    await assert()
    const info = test.info()
    if (!info.config.metadata.capture) return
    await page.waitForTimeout(1_500)
    const body = await page.screenshot()
    await info.attach(`判定: ${text}`, { body, contentType: 'image/png' })
  })
