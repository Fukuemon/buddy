#!/usr/bin/env node
/**
 * ブローカーの画面が読むトークンの CSS（services/broker/internal/login/tokens.css）を作る。
 * ブローカーは Go のサービスで、packages/ui の CSS と web のビルドを読まない。画面が使うトークンだけを、
 * DADS の基本のトークン（@digital-go-jp/design-tokens の dist/tokens.css）と、buddy の意味のトークン
 * （packages/ui/src/tokens/semantic.css）から var() をたどって値に解き、1 つのファイルに書く。
 *
 * 使い方: node scripts/build-broker-tokens.mjs
 * 終了コード: 書けたら 0。元のファイルが読めないか、トークンを値に解けなければ 1。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(join(ROOT, 'packages/ui/package.json'))

/** 画面が使うトークン。足すときは、ブローカーの画面の CSS で使うものだけを足す。 */
const TOKENS = [
  '--buddy-color-surface',
  '--buddy-color-surface-canvas',
  '--buddy-color-text',
  '--buddy-color-text-secondary',
  '--buddy-color-text-inverse',
  '--buddy-color-border',
  '--buddy-color-border-field',
  '--buddy-color-primary',
  '--buddy-color-focus-outline',
  '--buddy-color-focus-halo',
  '--font-family-sans',
  '--font-weight-700',
  '--font-size-14',
  '--font-size-16',
  '--font-size-18',
  '--font-size-20',
  '--line-height-100',
  '--line-height-130',
  '--line-height-150',
  '--line-height-160',
  '--line-height-170',
  '--border-radius-8',
]

const readCustomProperties = (path) =>
  [...readFileSync(path, 'utf8').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [
    name,
    value.trim(),
  ])

const properties = new Map([
  ...readCustomProperties(require.resolve('@digital-go-jp/design-tokens/dist/tokens.css')),
  ...readCustomProperties(join(ROOT, 'packages/ui/src/tokens/semantic.css')),
])

const resolve = (name) => {
  let value = properties.get(name)
  for (let depth = 0; value !== undefined && depth < 10; depth += 1) {
    const reference = /^var\((--[\w-]+)\)$/.exec(value)
    if (reference === null) return value
    value = properties.get(reference[1])
  }
  console.error(`${name} を値に解けない`)
  process.exit(1)
}

const header = `/*
 * 生成物。手で直さない。scripts/build-broker-tokens.mjs が、DADS の基本のトークンと
 * packages/ui/src/tokens/semantic.css から作る。pnpm check:generated が、元と食い違っていないかを確認する。
 */
`
writeFileSync(
  join(ROOT, 'services/broker/internal/login/tokens.css'),
  `${header}\n:root {\n${TOKENS.map((name) => `  ${name}: ${resolve(name)};`).join('\n')}\n}\n`,
)
