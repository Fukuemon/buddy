#!/usr/bin/env node
/**
 * 画面仕様書（docs/screens/<画面の ID>.md）の表の構成番号と、ワイヤーフレーム
 * （docs/screens/wireframes/<画面の ID>.html）の data-ref を比べる。
 *
 * - 「構成要素」の節の表の構成番号の集合と、data-ref の集合が一致するかを確かめる。
 * - 「構成要素ごとの活性条件と表示条件」と「インタラクション」の節の表の構成番号が、
 *   「構成要素」の節の表にあるかを確かめる。
 * - 対象は、1 列目の見出しが「番号」の表。セルは「、」で区切り、「なし」は数えない。
 *
 * 使い方: node scripts/check-screen-refs.mjs
 * 終了コード: 食い違いが無ければ 0、あれば 1。食い違いの一覧を標準エラーに出す。
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCREENS_DIR = relative(process.cwd(), join(ROOT, 'docs/screens')) || '.'
const WIREFRAMES_DIR = join(SCREENS_DIR, 'wireframes')
const NOT_SCREENS = new Set(['index.md', 'template.md'])
const COMPONENTS = '構成要素'
const REFERRING = ['構成要素ごとの活性条件と表示条件', 'インタラクション']
const REF = /^\d+(-\d+)*$/

/** 見出し（##）の名前ごとに、その節の表の構成番号の集合を返す。 */
const readSpecRefs = (markdown) => {
  const sections = new Map()
  let section = ''
  let inRefTable = false
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^## (.+)$/)
    if (heading) {
      section = heading[1].trim()
      inRefTable = false
      continue
    }
    if (!line.startsWith('|')) {
      inRefTable = false
      continue
    }
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
    if (cells[0] === '番号') {
      inRefTable = true
      continue
    }
    if (!inRefTable || /^-+$/.test(cells[0])) continue
    const refs = sections.get(section) ?? new Set()
    for (const ref of cells[0].split('、').map((value) => value.trim())) {
      if (ref === 'なし' || ref === '') continue
      refs.add(ref)
    }
    sections.set(section, refs)
  }
  return sections
}

const readWireframeRefs = (html) =>
  new Set([...html.matchAll(/\bdata-ref="([^"]*)"/g)].map((match) => match[1]))

const problems = []
const specs = readdirSync(SCREENS_DIR).filter((name) => name.endsWith('.md') && !NOT_SCREENS.has(name))

for (const spec of specs) {
  const screen = spec.replace(/\.md$/, '')
  const specPath = join(SCREENS_DIR, spec)
  const wireframePath = join(WIREFRAMES_DIR, `${screen}.html`)
  if (!existsSync(wireframePath)) {
    problems.push(`${specPath}: ワイヤーフレーム ${wireframePath} が無い`)
    continue
  }

  const sections = readSpecRefs(readFileSync(specPath, 'utf8'))
  const specRefs = sections.get(COMPONENTS) ?? new Set()
  const wireframeRefs = readWireframeRefs(readFileSync(wireframePath, 'utf8'))

  for (const [section, refs] of sections) {
    for (const ref of refs) {
      if (!REF.test(ref)) problems.push(`${specPath}: 「${section}」の構成番号 ${ref} の形が違う`)
    }
  }
  for (const ref of specRefs) {
    if (!wireframeRefs.has(ref)) problems.push(`${specPath}: 構成番号 ${ref} が ${wireframePath} の data-ref に無い`)
  }
  for (const ref of wireframeRefs) {
    if (!specRefs.has(ref)) problems.push(`${wireframePath}: data-ref ${ref} が ${specPath} の「${COMPONENTS}」の表に無い`)
  }
  for (const section of REFERRING) {
    for (const ref of sections.get(section) ?? []) {
      if (REF.test(ref) && !specRefs.has(ref)) {
        problems.push(`${specPath}: 「${section}」の構成番号 ${ref} が「${COMPONENTS}」の表に無い`)
      }
    }
  }
}

for (const name of readdirSync(WIREFRAMES_DIR)) {
  if (!name.endsWith('.html') || name === 'viewer.html' || name === 'template.html') continue
  const spec = name.replace(/\.html$/, '.md')
  if (!specs.includes(spec)) problems.push(`${join(WIREFRAMES_DIR, name)}: 画面仕様書 ${join(SCREENS_DIR, spec)} が無い`)
}

if (problems.length > 0) {
  console.error(`構成番号の食い違いが ${problems.length} 件ある。`)
  for (const problem of problems) console.error(`- ${problem}`)
  process.exit(1)
}
console.log(`${specs.length} 画面の構成番号に食い違いは無い。`)
