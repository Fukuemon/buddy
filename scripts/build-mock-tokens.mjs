#!/usr/bin/env node
/**
 * 画面のモックが読むトークンの CSS（docs/screens/_common/tokens.css）を作る。
 * DADS の基本のトークン（@digital-go-jp/design-tokens の dist/tokens.css）と、buddy の意味のトークン
 * （packages/ui/src/tokens/semantic.css）を 1 つのファイルにまとめる。モックは静的な HTML で、
 * パッケージの CSS を import できないためである。
 *
 * 使い方: node scripts/build-mock-tokens.mjs
 * 終了コード: 書けたら 0。元のファイルが読めなければ 1。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(join(ROOT, 'packages/ui/package.json'))
const dads = readFileSync(require.resolve('@digital-go-jp/design-tokens/dist/tokens.css'), 'utf8')
const semantic = readFileSync(join(ROOT, 'packages/ui/src/tokens/semantic.css'), 'utf8').replace(
  /^@import [^;]+;\n/m,
  '',
)

const header = `/*
 * 生成物。手で直さない。scripts/build-mock-tokens.mjs が、DADS の基本のトークンと
 * packages/ui/src/tokens/semantic.css から作る。pnpm check:generated が、元と食い違っていないかを確かめる。
 */
`
writeFileSync(
  join(ROOT, 'docs/screens/_common/tokens.css'),
  `${header}\n${dads.trim()}\n\n${semantic.trim()}\n`,
)
