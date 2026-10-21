#!/usr/bin/env node
/**
 * 文書のサイト（Zensical の site/）と、apps/web の Storybook（storybook-static/）と、表の ER 図のサイト（erd/）を、
 * apps/docs-site/public/ に 1 つのサイトとして並べる。/ に文書、/storybook/ にカタログ、/erd/ に ER 図を置く。
 * ER 図のサイトの serve.json と .keep は、Liam ERD の CLI が手元の配信のために置くもので、Worker では使わないので写さない。
 *
 * 使い方: node scripts/build-docs-site.mjs（先に zensical build と build-storybook と pnpm build:erd を流す）
 * 終了コード: 並べられれば 0、どれかの成果物が無ければ 1。
 */
import { cpSync, existsSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
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
  {
    source: join(root, 'erd'),
    target: join(out, 'erd'),
    build: 'pnpm build:erd',
    skip: ['serve.json', '.keep'],
  },
]

for (const { source, build } of parts) {
  if (!existsSync(source)) {
    console.error(`${source} が無い。先に ${build} を流す`)
    process.exit(1)
  }
}
rmSync(out, { recursive: true, force: true })
for (const { source, target, skip = [] } of parts) {
  cpSync(source, target, { recursive: true, filter: (path) => !skip.includes(basename(path)) })
}
console.log(`${out} に文書のサイトと Storybook と ER 図を並べた`)
