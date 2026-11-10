#!/usr/bin/env node
/**
 * 画面仕様書（docs/screens/<画面 ID>_<画面の名前>/）を、docs/screens/rules.md の規約で確認する。
 * 見る項目は、規約の「点検」のセクションにある。
 *
 * 引数でディレクトリを渡すと、そのディレクトリだけを見る。省くと docs/screens/ の下の全ての画面を見る。
 *
 * 使い方: node scripts/check-screens.mjs [画面のディレクトリ]...
 * 終了コード: 違反が無ければ 0、あれば 1。違反の一覧を標準エラーに出す。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkApiTables, readTestIdPairs } from './screen-conditions.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCREENS_DIR = relative(process.cwd(), join(ROOT, 'docs/screens')) || '.'
const SCREEN_DIR_NAME = /^([a-z]+-[a-z]+)_(.+)$/
const MOCK_NAME = /^\d{2}-[a-z0-9]+(-[a-z0-9]+)*\.html$/
// デバイスの名前は mock.js の VIEWS だけに書くので、そこから読む
const VIEWS = new Set(
  [
    ...readFileSync(join(SCREENS_DIR, '_common/mock.js'), 'utf8').matchAll(
      /^\s+'?([a-z-]+)'?: \{ label:/gm,
    ),
  ].map((m) => m[1]),
)
const SCRIPTS = ['../../_common/mock.js', '../../_common/interact.js']
const GO_TARGET = /^(\.\.\/\.\.\/[a-z]+-[a-z]+_[^/]+\/mocks\/)?\d{2}-[a-z0-9-]+\.html$/
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

// story の ID は Storybook と同じ関数で作る。storybook は apps/web の依存にある。
// Storybook の内部の API なので、版を上げたら build-storybook の index.json の ID と比べ直す
const { toId, storyNameFromExport } = createRequire(join(ROOT, 'apps/web/package.json'))(
  'storybook/internal/csf',
)
const STORY_DIRS = ['packages/ui/src', 'apps/web/src']
// カタログは本番のドキュメントサイトの /storybook/ にある（apps/docs-site/README.md）
const STORYBOOK_URL =
  /^https:\/\/buddy-docs\.emon-apps\.workers\.dev\/storybook\/\?path=\/(story|docs)\/([^)\s]+)$/
const LINK_TARGET = /\]\(([^)\s]+)\)/g

/** dir の下の、名前が suffix で終わるファイルを全て返す。 */
const filesEndingWith = (dir, suffix) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return filesEndingWith(path, suffix)
    return entry.name.endsWith(suffix) ? [path] : []
  })

/**
 * カタログの story の ID と、mdx の文書のページの ID を返す。文書のページは、story のファイルの隣に同じ名前の .mdx があるものだけである。
 * meta の title を読めない story のファイルは違反にする。
 */
const readCatalogIds = () => {
  const stories = new Set()
  const docs = new Set()
  const files = STORY_DIRS.flatMap((dir) => filesEndingWith(join(ROOT, dir), '.stories.tsx'))
  for (const file of files) {
    const code = readFileSync(file, 'utf8')
    const title = code.match(/^ {2}title: '([^']+)'/m)?.[1]
    if (title === undefined) {
      report(relative(process.cwd(), file), "meta の title を「  title: '…'」の形で書く")
      continue
    }
    for (const match of code.matchAll(/^export const (\w+)/gm))
      stories.add(toId(title, storyNameFromExport(match[1])))
    const mdx = join(dirname(file), `${basename(file, '.stories.tsx')}.mdx`)
    if (existsSync(mdx)) docs.add(toId(title, 'docs'))
  }
  return { stories, docs }
}
let catalogIds = null

/** 仕様書のカタログの欄のリンクが本番のカタログの URL で、その ID が story のファイルにあるかを確認する。 */
/**
 * カタログの欄のリンクを、行の番号と組にして返す。
 * 「**カタログ**:」の後ろが空なら、続く箇条書きの項目からリンクを読む。リンクが 3 つ以上のときの形である
 */
const catalogTargets = (lines, index) => {
  const rest = lines[index].slice('**カタログ**:'.length)
  if (rest.trim() !== '')
    return [...rest.matchAll(LINK_TARGET)].map((m) => ({ target: m[1], line: index + 1 }))
  const targets = []
  for (let i = index + 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '') continue
    if (!/^[-*] /.test(lines[i])) break
    for (const m of lines[i].matchAll(LINK_TARGET)) targets.push({ target: m[1], line: i + 1 })
  }
  return targets
}

/** 仕様書のカタログの欄のリンクが本番のカタログの URL で、その ID が story のファイルにあるかを確認する。 */
const checkCatalogLinks = (markdown, specPath) => {
  catalogIds ??= readCatalogIds()
  // コメントの中の書き方の例を欄として読まないよう、コメントを改行だけ残して消す。行の番号はずらさない
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, '')).split(/\r?\n/)
  lines.forEach((line, index) => {
    if (!line.startsWith('**カタログ**:')) return
    const targets = catalogTargets(lines, index)
    if (targets.length === 0) report(specPath, `カタログの欄にリンクが無い（${index + 1} 行目）`)
    for (const { target, line: at } of targets) {
      const match = target.match(STORYBOOK_URL)
      if (match === null) {
        report(specPath, `カタログの欄のリンク ${target} が本番のカタログの URL でない（${at} 行目）`)
        continue
      }
      let id
      try {
        id = decodeURIComponent(match[2])
      } catch {
        report(specPath, `カタログの欄のリンク ${target} の ID を読めない（${at} 行目）`)
        continue
      }
      const ids = match[1] === 'story' ? catalogIds.stories : catalogIds.docs
      if (!ids.has(id)) report(specPath, `カタログの ${match[1]} の ${id} が無い（${at} 行目）`)
    }
  })
}

const problems = []
/** 全てのモックの data-testid。E2E が使う testid との照合に使う */
const mockTestIds = new Set()
const report = (path, message) => problems.push(`${path}: ${message}`)

/** 1 から欠番なく続く整数の集合かを確認する。 */
const isContiguous = (numbers) => {
  const sorted = [...numbers].map(Number).sort((a, b) => a - b)
  return sorted.every((n, i) => n === i + 1)
}

/** 開始タグの中の属性の値を返す。 */
const attr = (tag, name) => tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1]

/** 「構成」のセクションの状態のタブ（=== "状態"）の中の、iframe の src と構成要素の表の番号を返す。 */
const readStates = (markdown, specPath) => {
  const states = []
  let current = null
  let inComposition = false
  let inTable = false
  const lines = markdown.split(/\r?\n/)
  let inFence = null
  // タブの中身は 4 つの空白で字下げするので、外して読む
  const unindent = (line) => (current !== null ? line.replace(/^ {4}/, '') : line)
  lines.forEach((rawLine, index) => {
    if (current !== null && rawLine.trim() !== '' && !/^( {4}|=== "|## )/.test(rawLine)) {
      report(
        specPath,
        `「${current.name}」のタブの中身を 4 つの空白で字下げする（${index + 1} 行目）`,
      )
    }
    const line = unindent(rawLine)
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
    const heading = rawLine.match(/^=== "(.+)"$/)
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
      const next = unindent(lines[index + 1] ?? '')
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

/** 画面の中の操作の属性を確認する。値が空でないか、data-escape を操作の属性を持つ要素に付けたか、data-go の先がモックとしてあるか、data-open と data-close の先の data-panel があるか */
const checkInteractions = (code, mockPath) => {
  for (const match of code.matchAll(/\sdata-go="([^"]*)"/g)) {
    const target = match[1]
    if (!GO_TARGET.test(target)) {
      report(
        mockPath,
        `data-go="${target}" を <モック>.html か ../../<画面のディレクトリ>/mocks/<モック>.html にする`,
      )
      continue
    }
    if (!existsSync(join(dirname(mockPath), target)))
      report(mockPath, `data-go="${target}" のモックが無い`)
  }
  for (const match of code.matchAll(/\sdata-(go|choice|panel|open|close)(?:=(?:""|'')|(?=[\s/>]))/g))
    report(mockPath, `data-${match[1]} の値が空である`)
  for (const tag of code.matchAll(/<[a-z][^>]*\sdata-escape\b[^>]*>/g)) {
    if (!/\sdata-(go|toggle|choice|open|close)\b/.test(tag[0]))
      report(mockPath, `data-escape を操作の属性の無い要素に付けている: ${tag[0]}`)
  }
  const panels = new Set([...code.matchAll(/\sdata-panel="([^"]*)"/g)].map((m) => m[1]))
  for (const match of code.matchAll(/\sdata-(open|close)="([^"]*)"/g)) {
    if (!panels.has(match[2]))
      report(mockPath, `data-${match[1]}="${match[2]}" の data-panel が無い`)
  }
}

const checkMock = (mockPath, screenId) => {
  const html = readFileSync(mockPath, 'utf8')
  const code = stripComments(html)
  const sheets = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map((m) =>
    attr(m[0], 'href'),
  )
  const expected = [
    '../../_common/mock.css',
    '../../_common/tokens.css',
    '../../_common/wireframe.css',
    `${screenId}.css`,
  ]
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
  const scripts = [...code.matchAll(/<script\b[^>]*>/g)].map((m) => attr(m[0], 'src'))
  if (scripts.join() !== SCRIPTS.join())
    report(mockPath, `script は ${SCRIPTS.join('、')} だけをこの順に読む`)
  checkInteractions(code, mockPath)
  for (const [pattern, label] of FORBIDDEN) {
    if (pattern.test(code)) report(mockPath, `${label}を使わない`)
  }
  if (PLACEHOLDER.test(html)) report(mockPath, `テンプレートの ${html.match(PLACEHOLDER)[0]} が残っている`)
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
    mockTestIds.add(match[1])
    if (!TESTID.test(match[1])) report(mockPath, `data-testid="${match[1]}" の形が規約と違う`)
  }
  return { numbers, pairs: readTestIdPairs(code) }
}

const checkCss = (cssPath) => {
  const raw = readFileSync(cssPath, 'utf8')
  if (PLACEHOLDER.test(raw)) report(cssPath, `テンプレートの ${raw.match(PLACEHOLDER)[0]} が残っている`)
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
    report(apiPath, 'テンプレートの <…> が残っている')
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
    report(specPath, `テンプレートの ${markdown.match(PLACEHOLDER)[0]} が残っている`)
  const prose = markdown
    .replace(/^( {0,4})(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[^\n]*$/gm, '')
    .replace(/(`+)[^`\n][\s\S]*?\1/g, '')
    .replace(/\\</g, '')
  for (const tag of prose.matchAll(/<\/?([a-z][a-z0-9-]*)(?=[\s/>])/gi)) {
    if (!['iframe', 'a'].includes(tag[1].toLowerCase()))
      report(specPath, `生の HTML の <${tag[1]}> を使わない`)
  }

  checkCatalogLinks(markdown, specPath)

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
    const numbers = mocks.get(state.src)?.numbers
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
    if (!embedded.has(src)) report(specPath, `${src} を「構成」のセクションに埋め込んでいない`)
  }

  if (!existsSync(apiPath)) return
  const pairs = new Set([...mocks.values()].flatMap((mock) => [...mock.pairs]))
  for (const { path, message } of checkApiTables(markdown, readFileSync(apiPath, 'utf8'), pairs))
    report(path === 'spec' ? specPath : apiPath, message)
}

const targets =
  process.argv.length > 2
    ? process.argv.slice(2)
    : readdirSync(SCREENS_DIR)
        .filter((entry) => !entry.startsWith('_'))
        .map((entry) => join(SCREENS_DIR, entry))
        .filter((path) => statSync(path).isDirectory())

for (const dir of targets) checkScreen(dir)

/** getByTestId の引数から、照合する値を返す。exact は同じ値、prefix は始まり。読めなければ null */
const readTestIdArg = (arg) => {
  const quoted = arg.match(/^(['"])([^'"]+)\1/)
  if (quoted) return { exact: quoted[2] }
  const template = arg.match(/^`([^`]*)`/)
  if (template) {
    const index = template[1].indexOf('${')
    return index === -1 ? { exact: template[1] } : { prefix: template[1].slice(0, index) }
  }
  const regex = arg.match(/^\/\^((?:[^\\/.*+?()[\]{}|$]|\\.)*)/)
  if (regex) return { prefix: regex[1].replace(/\\(.)/g, '$1') }
  return null
}

/** モックの x-{…} の {…} にはどの値でも入るので、{…} を 1 文字以上の値に置き換えた形で E2E の testid に当てる。 */
const matchesPlaceholder = (testId) =>
  [...mockTestIds].some((id) => {
    if (!id.includes('{')) return false
    const pattern = id
      .split(/\{[^}]*\}/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.+')
    return new RegExp(`^${pattern}$`).test(testId)
  })

// 全ての画面を見るときだけ、E2E が指す testid がどれかのモックにあるかを確認する。
// 文字列の testid は同じ値か、モックの x-{…} の形を、`x-${…}` と /^x-/ は x- で始まる値（モックの x-{…} を含む）を探す
if (process.argv.length <= 2) {
  const E2E_DIR = relative(process.cwd(), join(ROOT, 'packages/e2e/tests')) || '.'
  for (const file of filesEndingWith(E2E_DIR, '.ts')) {
    const code = readFileSync(file, 'utf8')
    for (const match of code.matchAll(/getByTestId\(\s*([^)\n]*)/g)) {
      const target = readTestIdArg(match[1])
      if (target === null || target.prefix === '') {
        report(
          file,
          `getByTestId(${match[1].trim()}) の testid を読めない。文字列か、始まりの付いたテンプレートか /^…/ で書く`,
        )
        continue
      }
      const found =
        target.exact !== undefined
          ? mockTestIds.has(target.exact) || matchesPlaceholder(target.exact)
          : [...mockTestIds].some((id) => id.startsWith(target.prefix))
      if (!found) {
        report(
          file,
          `E2E の testid ${target.exact ?? `${target.prefix}…`} がどのモックの data-testid にも無い`,
        )
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`画面仕様書の規約の違反が ${problems.length} 件ある。`)
  for (const problem of problems) console.error(`- ${problem}`)
  process.exit(1)
}
console.log(`${targets.length} 画面が規約に合っている。`)
