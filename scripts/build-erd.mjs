#!/usr/bin/env node
/**
 * tbls が出す docs/db/schedule-api/schema.json から、Liam ERD の CLI で ER 図のサイトを erd/ に作り直す。
 * Liam ERD 0.7.24 の tbls の形式の読み込みは、viewpoint の id（tbls 1.96 で足された項目）を知らずに拒むので、
 * id を外したコピーを一時のディレクトリに置いて渡す。
 *
 * 使い方: node scripts/build-erd.mjs（pnpm build:erd が流す）
 * 終了コード: 作れれば 0、Liam ERD の CLI が失敗すればその終了コード。
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const schema = JSON.parse(readFileSync(join(root, 'docs/db/schedule-api/schema.json'), 'utf8'))
for (const viewpoint of schema.viewpoints ?? []) delete viewpoint.id

const dir = mkdtempSync(join(tmpdir(), 'buddy-erd-'))
const input = join(dir, 'schema.json')
writeFileSync(input, JSON.stringify(schema))
const out = join(root, 'erd')
rmSync(out, { recursive: true, force: true })
try {
  execFileSync('pnpm', ['exec', 'liam', 'erd', 'build', '--input', input, '--format', 'tbls', '--output-dir', out], {
    cwd: root,
    stdio: 'inherit',
  })
} catch (error) {
  process.exitCode = error.status ?? 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
