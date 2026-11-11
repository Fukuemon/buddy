// @vitest-environment node
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test'

import { migrateUp } from '../../migrate/migrations.ts'
import { createPostgresSessionStore, type PostgresSessionStore } from './postgresSessionStore'

// CI の typescript のジョブは、PostgreSQL のサービスのコンテナに向けて渡す。ローカルでは compose の web のデータベースに向けて渡す（context/testing.md）
const url = process.env.SESSION_STORE_TEST_URL
const secret = 'x'.repeat(32)

describe.skipIf(url === undefined)('createPostgresSessionStore', () => {
  let store: PostgresSessionStore
  let admin: pg.Client

  beforeAll(async () => {
    await migrateUp(url as string)
    // 2 回流しても、当てた版を当て直さない
    await migrateUp(url as string)
    store = createPostgresSessionStore(url as string, secret, 2)
    admin = new pg.Client({ connectionString: url })
    await admin.connect()
  })
  afterAll(async () => {
    await store?.close()
    await admin?.end()
  })
  beforeEach(async () => {
    await admin.query('TRUNCATE web_sessions, web_session_locks')
  })

  const expire = (table: string, key: string) =>
    admin.query(`UPDATE ${table} SET expires_at = now() - interval '1 second' WHERE key = $1`, [
      key,
    ])

  it('置いた値を読み、期限の切れた値は消す前から読まない', async () => {
    await store.set('session:a', { accessToken: 't' }, 60)
    expect(await store.get('session:a')).toEqual({ accessToken: 't' })
    expect(await store.exists('session:a')).toBe(true)
    await expire('web_sessions', 'session:a')
    expect(await store.get('session:a')).toBeUndefined()
    expect(await store.exists('session:a')).toBe(false)
    expect(await store.replace('session:a', { accessToken: 'u' })).toBe(false)
  })

  it('値を暗号化して置き、別の key の行に写した値は読めない', async () => {
    await store.set('session:a', { accessToken: 'secret-token' }, 60)
    const { rows } = await admin.query<{ value: Buffer }>(
      "SELECT value FROM web_sessions WHERE key = 'session:a'",
    )
    expect(rows[0]?.value.toString()).not.toContain('secret-token')
    await admin.query(
      "INSERT INTO web_sessions SELECT 'session:b', value, expires_at FROM web_sessions WHERE key = 'session:a'",
    )
    await expect(store.get('session:b')).rejects.toThrow('authenticate')
  })

  it('同じ key に置き直すと、値と期限を替える', async () => {
    await store.set('session:a', 1, 1)
    await store.set('session:a', 2, 60)
    const { rows } = await admin.query<{ left: number }>(
      "SELECT extract(epoch FROM expires_at - now()) AS left FROM web_sessions WHERE key = 'session:a'",
    )
    expect(Number(rows[0]?.left)).toBeGreaterThan(50)
    expect(await store.get('session:a')).toBe(2)
  })

  it('replace は今ある値だけを、期限を保って置き換える', async () => {
    expect(await store.replace('session:none', 1)).toBe(false)
    await store.set('session:a', 1, 60)
    const before = await admin.query("SELECT expires_at FROM web_sessions WHERE key = 'session:a'")
    expect(await store.replace('session:a', 2)).toBe(true)
    const after = await admin.query("SELECT expires_at FROM web_sessions WHERE key = 'session:a'")
    expect(after.rows[0]).toEqual(before.rows[0])
    expect(await store.get('session:a')).toBe(2)
  })

  it('鍵は 1 つのリクエストだけが取り、期限が切れたら別のリクエストが取れる', async () => {
    const [first, second] = await Promise.all([
      store.lock('lock:a', 10_000),
      store.lock('lock:a', 10_000),
    ])
    const tokens = [first, second].filter((token) => token !== undefined)
    expect(tokens).toHaveLength(1)
    expect(await store.exists('lock:a')).toBe(true)
    await expire('web_session_locks', 'lock:a')
    const taken = await store.lock('lock:a', 10_000)
    expect(taken).toBeDefined()
    // 期限が切れた後に、前の持ち主が放しても、新しい鍵は残る
    await store.unlock('lock:a', tokens[0] as string)
    expect(await store.exists('lock:a')).toBe(true)
    await store.unlock('lock:a', taken as string)
    expect(await store.exists('lock:a')).toBe(false)
  })

  it('take は値を返して消し、期限の切れた値は返さない', async () => {
    await store.set('login:a', { state: 's' }, 60)
    expect(await store.take('login:a')).toEqual({ state: 's' })
    expect(await store.take('login:a')).toBeUndefined()
    await store.set('login:b', 1, 60)
    await expire('web_sessions', 'login:b')
    expect(await store.take('login:b')).toBeUndefined()
  })

  it('delete は値と鍵を消す', async () => {
    await store.set('session:a', 1, 60)
    await store.delete('session:a')
    expect(await store.get('session:a')).toBeUndefined()
  })

  it('purgeExpired は期限の切れた値と鍵の行だけを消す', async () => {
    await store.set('session:live', 1, 60)
    await store.set('session:old', 1, 60)
    await store.lock('lock:old', 10_000)
    await expire('web_sessions', 'session:old')
    await expire('web_session_locks', 'lock:old')
    expect(await store.purgeExpired()).toBe(2)
    const { rows } = await admin.query<{ key: string }>(
      'SELECT key FROM web_sessions UNION ALL SELECT key FROM web_session_locks',
    )
    expect(rows.map((row) => row.key)).toEqual(['session:live'])
  })

  it('ping は DB に届けば成功する', async () => {
    await expect(store.ping()).resolves.toBeUndefined()
  })
})

describe('createPostgresSessionStore の接続の失敗', () => {
  it('届かない DB では ping が Error を投げる', async () => {
    const unreachable = createPostgresSessionStore('postgres://u:p@127.0.0.1:1/web', secret, 1)
    await expect(unreachable.ping()).rejects.toThrow('ECONNREFUSED')
    await unreachable.close()
  })
})
