/**
 * PostgreSQL のセッションの保存先の負荷の検証（ADR-0045）。web の SessionStore の実装を直接呼び、想定の利用を再現する。
 *
 * 使い方: SESSION_STORE_URL=postgres://... node apps/web/scripts/session-load.ts
 * テーブルは先に migrate up で作っておく。結果を 1 行の JSON で標準出力に書く。
 *
 * 環境変数（全て任意）:
 * - LOAD_USERS: 同時にログインしている職員の数。デフォルトは 100
 * - LOAD_INSTANCES: web のインスタンスの数。インスタンスごとに接続のプールを持つ。デフォルトは 2
 * - LOAD_MAX_CONNS: インスタンスごとの接続の数の上限（SESSION_STORE_MAX_CONNS）。デフォルトは 5
 * - LOAD_LOGIN_WINDOW_S: 全員がログインし終えるまでの秒数。デフォルトは 300
 * - LOAD_DURATION_S: 流す秒数。デフォルトは 420
 * - LOAD_READ_INTERVAL_S: 職員 1 人が BFF を呼ぶ平均の間隔。デフォルトは 2
 * - LOAD_REFRESH_INTERVAL_S: 職員 1 人がトークンを更新する間隔。デフォルトは 300
 * - LOAD_DB_CONTAINER: DB の CPU を docker stats で測るコンテナの名前。無ければ CPU を測らない
 */
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { promisify } from 'node:util'

import pg from 'pg'

import { createPostgresSessionStore } from '../src/server/postgresSessionStore.ts'

const num = (name: string, fallback: number) => Number(process.env[name] ?? fallback)
const url = process.env.SESSION_STORE_URL
if (url === undefined) throw new Error('SESSION_STORE_URL が必要です')
const users = num('LOAD_USERS', 100)
const instances = num('LOAD_INSTANCES', 2)
const maxConns = num('LOAD_MAX_CONNS', 5)
const loginWindowMs = num('LOAD_LOGIN_WINDOW_S', 300) * 1000
const durationMs = num('LOAD_DURATION_S', 420) * 1000
const readIntervalMs = num('LOAD_READ_INTERVAL_S', 2) * 1000
const refreshIntervalMs = num('LOAD_REFRESH_INTERVAL_S', 300) * 1000
const dbContainer = process.env.LOAD_DB_CONTAINER

const secret = randomBytes(32).toString('base64url')
const stores = Array.from({ length: instances }, () =>
  createPostgresSessionStore(url, secret, maxConns),
)
const latencies: Record<string, number[]> = { read: [], login: [], refresh: [], logout: [] }
let errors = 0

const timed = async (kind: string, run: () => Promise<unknown>) => {
  const start = performance.now()
  try {
    await run()
    latencies[kind]?.push(performance.now() - start)
  } catch {
    errors += 1
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const startedAt = Date.now()
const running = () => Date.now() - startedAt < durationMs

/** web の auth.ts と同じ大きさのセッションの値。トークンは JWT と同じくらいの長さにする。 */
const sessionValue = () => ({
  accessToken: randomBytes(600).toString('base64url'),
  refreshToken: randomBytes(48).toString('base64url'),
  idToken: randomBytes(700).toString('base64url'),
  expiresAt: Date.now() + 300_000,
  staff: { id: randomBytes(13).toString('hex'), name: '負荷 検証', facilityId: 'f', canManageStaff: true },
})

const user = async (index: number) => {
  await sleep((loginWindowMs / users) * index)
  // リクエストごとに、どのインスタンスが受けるかは決まらない
  const store = () => stores[Math.floor(Math.random() * stores.length)] as (typeof stores)[number]
  const key = `session:${randomBytes(16).toString('base64url')}`
  await timed('login', async () => {
    await store().set(`login:${key}`, { state: 's' }, 600)
    await store().take(`login:${key}`)
    await store().set(key, sessionValue(), 43_200)
  })
  let nextRefresh = Date.now() + refreshIntervalMs
  while (running()) {
    // 間隔に幅を持たせ、全員の読み取りが同じ時刻にそろわないようにする
    await sleep(readIntervalMs * (0.5 + Math.random()))
    await timed('read', () => store().get(key))
    if (Date.now() >= nextRefresh) {
      nextRefresh += refreshIntervalMs
      await timed('refresh', async () => {
        const lockKey = `refresh-lock:${key}`
        const token = await store().lock(lockKey, 10_000)
        if (token === undefined) return
        try {
          await store().get(key)
          await store().replace(key, sessionValue())
        } finally {
          await store().unlock(lockKey, token)
        }
      })
    }
  }
  await timed('logout', () => store().delete(key))
}

/** DB の接続の数と CPU を 5 秒ごとに測る。 */
const sample = async () => {
  const admin = new pg.Client({ connectionString: url })
  await admin.connect()
  const { rows } = await admin.query<{ max: string }>("SELECT setting AS max FROM pg_settings WHERE name = 'max_connections'")
  const result = { maxConnections: Number(rows[0]?.max), connections: [] as number[], cpu: [] as number[] }
  while (running()) {
    const active = await admin.query<{ n: string }>(
      'SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()',
    )
    result.connections.push(Number(active.rows[0]?.n))
    if (dbContainer !== undefined) {
      const { stdout } = await promisify(execFile)('docker', ['stats', '--no-stream', '--format', '{{.CPUPerc}}', dbContainer])
      result.cpu.push(Number.parseFloat(stdout))
    }
    await sleep(5000)
  }
  await admin.end()
  return result
}

const percentile = (values: number[], p: number) => {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]?.toFixed(2))
}

const [samples] = await Promise.all([sample(), ...Array.from({ length: users }, (_, i) => user(i))])
await Promise.all(stores.map((store) => store.close()))

const summary = Object.fromEntries(
  Object.entries(latencies).map(([kind, values]) => [
    kind,
    { count: values.length, p50: percentile(values, 50), p95: percentile(values, 95), p99: percentile(values, 99) },
  ]),
)
console.log(
  JSON.stringify({
    users,
    instances,
    maxConnsPerInstance: maxConns,
    durationS: durationMs / 1000,
    errors,
    latencyMs: summary,
    db: {
      maxConnections: samples.maxConnections,
      peakConnections: Math.max(...samples.connections),
      peakCpuPercent: samples.cpu.length > 0 ? Math.max(...samples.cpu) : undefined,
      meanCpuPercent:
        samples.cpu.length > 0 ? Number((samples.cpu.reduce((a, b) => a + b, 0) / samples.cpu.length).toFixed(1)) : undefined,
    },
  }),
)
