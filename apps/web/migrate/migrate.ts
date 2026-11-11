#!/usr/bin/env node
/**
 * web のセッションのテーブルを、SESSION_STORE_URL の PostgreSQL に作るマイグレーション（ADR-0047）。
 *
 * `migrate up` で、まだ当てていない版を順に当てて終わる。イメージでは /usr/local/bin/migrate から呼ぶ。
 * 予定の API とブローカーの migrate と同じく、インフラが新しいイメージを起動する前に 1 回流す。
 * 前のバージョンの web が動いたまま当てられる変更だけを足す。
 */
import { migrateUp } from './migrations.ts'

const url = process.env.SESSION_STORE_URL
if (process.argv[2] !== 'up') {
  console.error('使い方: migrate up')
  process.exit(2)
}
if (url === undefined || !/^postgres(ql)?:\/\//.test(url)) {
  console.error('SESSION_STORE_URL に PostgreSQL の URL（postgres://...）が必要です')
  process.exit(2)
}
await migrateUp(url)
