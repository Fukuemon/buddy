#!/usr/bin/env node
/**
 * 文書のサイト（Zensical の site/）と、apps/web の Storybook（storybook-static/）を、
 * apps/docs-site/public/ に 1 つのサイトとして並べる。/ に文書、/storybook/ にカタログを置く。
 *
 * 使い方: node scripts/build-docs-site.mjs（先に zensical build と build-storybook を流す）
 * 終了コード: 並べられれば 0、どちらかの成果物が無ければ 1。
 */
import { cpSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = join(root, 'apps/docs-site/public')
const parts = [
  { source: join(root, 'site'), target: out, build: 'uv run zensical build --clean' },
  {
    source: join(root, 'apps/web/storybook-static'),
    target: join(out, 'storybook'),
    build: 'pnpm --filter @buddy/web build-storybook',
  },
]

for (const { source, build } of parts) {
  if (!existsSync(source)) {
    console.error(`${source} が無い。先に ${build} を流す`)
    process.exit(1)
  }
}
rmSync(out, { recursive: true, force: true })
for (const { source, target } of parts) cpSync(source, target, { recursive: true })
console.log(`${out} に文書のサイトと Storybook を並べた`)
