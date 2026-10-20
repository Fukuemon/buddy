#!/usr/bin/env node
/**
 * 新しい形の画面仕様書（docs/screens/<画面 ID>_<画面の名前>/）を、docs/screens/rules.md の規約で確かめる。
 * 見る項目は、規約の「点検」の節にある。
 *
 * 引数でディレクトリを渡すと、そのディレクトリだけを見る。省くと docs/screens/ の下の全ての画面を見る。
 *
 * 使い方: node scripts/check-screens.mjs [画面のディレクトリ]...
 * 終了コード: 違反が無ければ 0、あれば 1。違反の一覧を標準エラーに出す。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCREENS_DIR = relative(process.cwd(), join(ROOT, 'docs/screens')) || '.'
const SCREEN_DIR_NAME = /^([a-z]+-[a-z]+)_(.+)$/
const MOCK_NAME = /^\d{2}-[a-z0-9]+(-[a-z0-9]+)*\.html$/
// 端末の名前は mock.js の VIEWS だけに書くので、そこから読む
const VIEWS = new Set(
  [
    ...readFileSync(join(SCREENS_DIR, '_common/mock.js'), 'utf8').matchAll(
      /^\s+'?([a-z-]+)'?: \{ label:/gm,
    ),
  ].map((m) => m[1]),
)
const TESTID = /^[a-z][a-z0-9]*(-([a-z0-9]+(_[a-z0-9]+)*|\{[^}]+\}))+$/
const TABLE_HEADER = ['番号', '種別', '要素名', '仕様']
const FORBIDDEN = [
  [/https?:\/\//, '外部の URL'],
  [/position:\s*fixed/i, 'position: fixed'],
  [/\d(\.\d+)?(dvh|svh|lvh|vh|dvw|svw|lvw|vw|vmin|vmax)\b/i, 'viewport の単位'],
  [
    /@media[^{]*\b(min-|max-)?(width|height|aspect-ratio|orientation)\b/i,
    'viewport の寸法の @media',
  ],
  [/prefers-color-scheme/i, 'ダークモード'],
]
/** CSS と HTML のコメントを除く。コメントの中の語を禁止の記述として拾わないため */
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
const PLACEHOLDER = /<(画面|要素|操作|状態)[^>]*>/

const problems = []
const report = (path, message) => problems.push(`${path}: ${message}`)

/** 1 から欠番なく続く整数の集合かを確かめる。 */
const isContiguous = (numbers) => {
  const sorted = [...numbers].map(Number).sort((a, b) => a - b)
  return sorted.every((n, i) => n === i + 1)
}

/** 開始タグの中の属性の値を返す。 */
const attr = (tag, name) => tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1]

/** 状態ごとの見出し（###）の下の、iframe の src と構成要素の表の番号を返す。 */
const readStates = (markdown, specPath) => {
  const states = []
  let current = null
  let inComposition = false
  let inTable = false
  const lines = markdown.split(/\r?\n/)
  let inFence = null
  lines.forEach((line, index) => {
    const fence = line.match(/^(`{3,}|~{3,})/)
    if (fence && (inFence === null || fence[1].startsWith(inFence))) {
      inFence = inFence === null ? fence[1][0].repeat(3) : null
      return
    }
    if (inFence !== null) return
    if (/^## /.test(line)) {
      inComposition = line.trim() === '## 構成'
      current = null
      return
    }
    if (!inComposition) return
    const heading = line.match(/^### (.+)$/)
    if (heading) {
      current = {
        name: heading[1].trim(),
        iframe: false,
        src: null,
        numbers: new Set(),
        header: null,
      }
      states.push(current)
      inTable = false
      return
    }
    if (current === null) return
    const iframe = line.match(/^<iframe\b[^>]*>/)
    if (iframe) {
      current.iframe = true
      current.src = attr(iframe[0], 'src') ?? null
      if (current.src === null) report(specPath, `「${current.name}」の iframe に src が無い`)
      if (attr(iframe[0], 'class') !== 'mock')
        report(specPath, `「${current.name}」の iframe に class="mock" が無い`)
      if (!attr(iframe[0], 'title'))
        report(specPath, `「${current.name}」の iframe に title が無い`)
      if (/\s(height|sandbox|loading)=/.test(iframe[0])) {
        report(specPath, `「${current.name}」の iframe に height、sandbox、loading を書かない`)
      }
      const next = lines[index + 1] ?? ''
      const link = next.match(/^<a\b[^>]*>別タブで開く<\/a>$/)
      if (
        !link ||
        attr(link[0], 'class') !== 'mock-open' ||
        attr(link[0], 'href') !== current.src ||
        attr(link[0], 'target') !== '_blank'
      ) {
        report(
          specPath,
          `「${current.name}」の iframe の直後に、同じ src を開く <a class="mock-open" target="_blank"> が無い`,
        )
      }
      return
    }
    if (!line.startsWith('|')) {
      inTable = false
      return
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim())
    if (current.header === null) {
      current.header = cells
      inTable = true
      return
    }
    if (!inTable || cells.every((cell) => /^:?-+:?$/.test(cell))) return
    if (!/^\d+$/.test(cells[0])) {
      report(specPath, `「${current.name}」の表の番号 ${cells[0]} が整数でない`)
      return
    }
    current.numbers.add(cells[0])
  })
  return states
}

const checkMock = (mockPath, screenId) => {
  const html = readFileSync(mockPath, 'utf8')
  const code = stripComments(html)
  const sheets = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map((m) =>
    attr(m[0], 'href'),
  )
  const expected = ['../../_common/mock.css', '../../_common/wireframe.css', `${screenId}.css`]
  if (sheets.join() !== expected.join())
    report(mockPath, `stylesheet を ${expected.join('、')} の順に読む`)
  const body = html.match(/<body\b[^>]*>/)?.[0] ?? ''
  if (!VIEWS.has(attr(body, 'data-view') ?? ''))
    report(mockPath, `body の data-view を ${[...VIEWS].join('、')} のどれかにする`)
  for (const cls of ['stage', 'screen', 'screen-body', 'markers']) {
    if (!new RegExp(`class="(?:[^"]*\\s)?${cls}(?:\\s[^"]*)?"`).test(html))
      report(mockPath, `class="${cls}" の要素が無い`)
  }
  if (!/<div class="markers">\s*<\/div>/.test(html)) report(mockPath, '.markers は空にする')
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1])
  if (scripts[0] !== '../../_common/mock.js') report(mockPath, '../../_common/mock.js を読む')
  for (const [pattern, label] of FORBIDDEN) {
    if (pattern.test(code)) report(mockPath, `${label}を使わない`)
  }
  if (PLACEHOLDER.test(html)) report(mockPath, `雛形の ${html.match(PLACEHOLDER)[0]} が残っている`)
  const numbers = new Set()
  for (const match of code.matchAll(/\sdata-m=["']([^"']*)["']/g)) {
    if (!/^[1-9]\d*$/.test(match[1])) {
      report(mockPath, `data-m="${match[1]}" が整数でない`)
      continue
    }
    numbers.add(match[1])
  }
  if (!isContiguous(numbers))
    report(mockPath, `data-m が 1 から欠番なく続いていない（${[...numbers].join('、')}）`)
  for (const match of html.matchAll(/\bdata-testid="([^"]*)"/g)) {
    if (!TESTID.test(match[1])) report(mockPath, `data-testid="${match[1]}" の形が規約と違う`)
  }
  return numbers
}

const checkCss = (cssPath) => {
  const raw = readFileSync(cssPath, 'utf8')
  if (PLACEHOLDER.test(raw)) report(cssPath, `雛形の ${raw.match(PLACEHOLDER)[0]} が残っている`)
  const css = stripComments(raw)
  for (const [pattern, label] of FORBIDDEN) {
    if (pattern.test(css)) report(cssPath, `${label}を使わない`)
  }
}

const checkScreen = (dir) => {
  const name = basename(dir)
  const match = name.match(SCREEN_DIR_NAME)
  if (!match) {
    report(dir, 'ディレクトリの名前を <画面 ID>_<画面の名前> にする')
    return
  }
  const [, screenId, screenName] = match
  const specPath = join(dir, 'index.md')
  const mocksDir = join(dir, 'mocks')
  if (!existsSync(specPath)) report(dir, 'index.md が無い')
  const apiPath = join(dir, 'api.md')
  if (!existsSync(apiPath)) report(dir, 'api.md が無い')
  else if (PLACEHOLDER.test(readFileSync(apiPath, 'utf8')))
    report(apiPath, '雛形の <…> が残っている')
  if (!existsSync(mocksDir)) {
    report(dir, 'mocks/ が無い')
    return
  }
  const cssPath = join(mocksDir, `${screenId}.css`)
  if (existsSync(cssPath)) checkCss(cssPath)
  else report(mocksDir, `${screenId}.css が無い`)

  const mocks = new Map()
  for (const file of readdirSync(mocksDir)) {
    if (file === `${screenId}.css` || file.startsWith('.')) continue
    if (!MOCK_NAME.test(file)) {
      report(join(mocksDir, file), 'モックの名前を <2 桁の連番>-<状態>.html にする')
      continue
    }
    mocks.set(`mocks/${file}`, checkMock(join(mocksDir, file), screenId))
  }
  if (!existsSync(specPath)) return

  const markdown = readFileSync(specPath, 'utf8')
  const first = markdown.split(/\r?\n/)[0]
  if (first !== `# ${screenId} ${screenName}`)
    report(specPath, `1 行目を「# ${screenId} ${screenName}」にする`)
  if (PLACEHOLDER.test(markdown))
    report(specPath, `雛形の ${markdown.match(PLACEHOLDER)[0]} が残っている`)
  const prose = markdown
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '')
    .replace(/(`+)[^`\n][\s\S]*?\1/g, '')
    .replace(/\\</g, '')
  for (const tag of prose.matchAll(/<\/?([a-z][a-z0-9-]*)(?=[\s/>])/gi)) {
    if (!['iframe', 'a'].includes(tag[1].toLowerCase()))
      report(specPath, `生の HTML の <${tag[1]}> を使わない`)
  }

  const embedded = new Set()
  for (const state of readStates(markdown, specPath)) {
    if (state.src === null) {
      if (!state.iframe) report(specPath, `「${state.name}」にモックの iframe が無い`)
      continue
    }
    embedded.add(state.src)
    if (state.header?.join() !== TABLE_HEADER.join()) {
      report(
        specPath,
        `「${state.name}」の構成要素の表の見出しを ${TABLE_HEADER.join(' | ')} にする`,
      )
    }
    const numbers = mocks.get(state.src)
    if (numbers === undefined) {
      report(specPath, `「${state.name}」の iframe の ${state.src} が無い`)
      continue
    }
    const missing = [...state.numbers].filter((n) => !numbers.has(n))
    const extra = [...numbers].filter((n) => !state.numbers.has(n))
    if (missing.length > 0)
      report(
        specPath,
        `「${state.name}」の番号 ${missing.join('、')} が ${state.src} の data-m に無い`,
      )
    if (extra.length > 0)
      report(specPath, `${state.src} の data-m ${extra.join('、')} が「${state.name}」の表に無い`)
  }
  for (const src of mocks.keys()) {
    if (!embedded.has(src)) report(specPath, `${src} を「構成」の節に埋め込んでいない`)
  }
}

const targets =
  process.argv.length > 2
    ? process.argv.slice(2)
    : readdirSync(SCREENS_DIR)
        .filter((entry) => !entry.startsWith('_') && entry !== 'wireframes')
        .map((entry) => join(SCREENS_DIR, entry))
        .filter((path) => statSync(path).isDirectory())

for (const dir of targets) checkScreen(dir)

if (problems.length > 0) {
  console.error(`画面仕様書の規約の違反が ${problems.length} 件ある。`)
  for (const problem of problems) console.error(`- ${problem}`)
  process.exit(1)
}
console.log(`${targets.length} 画面が規約に合っている。`)
