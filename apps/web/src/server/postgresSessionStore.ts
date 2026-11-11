import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

import pg from 'pg'

import type { SessionStore } from './sessionStore'

/** 1 回の掃除で、テーブルごとに消す行の上限。行を長く占有しないよう少しずつ消す。 */
const PURGE_LIMIT = 1000

const IV_BYTES = 12
const TAG_BYTES = 16

/** PostgreSQL に置く SessionStore。期限の切れた行を消す purgeExpired と、接続を閉じる close を足す。 */
export type PostgresSessionStore = SessionStore & {
  /** 期限の切れた値と鍵の行を、テーブルごとに上限まで消し、消した行の数を返す。 */
  purgeExpired(): Promise<number>
  close(): Promise<void>
}

/**
 * 値を暗号化する鍵を、cookie の署名の鍵から HKDF で導く。
 * 新しいシークレットを足さないためである。SESSION_SECRET を替えると、置いた値は全て読めなくなる（ADR-0047）。
 */
const deriveKey = (secret: string): Buffer =>
  Buffer.from(hkdfSync('sha256', secret, '', 'buddy-web-session-store', 32))

/**
 * 値を AES-256-GCM で暗号化し、IV、認証タグ、暗号文の順に並べる。
 * key を追加の認証データに入れ、行の値を別の key の行に写しても復号できないようにする。
 */
const seal = (encKey: Buffer, key: string, value: unknown): Buffer => {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', encKey, iv, { authTagLength: TAG_BYTES })
  cipher.setAAD(Buffer.from(key))
  const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body])
}

/** seal の逆。鍵が違うか値が改ざんされていれば Error を投げる。 */
const open = <T>(encKey: Buffer, key: string, sealed: Buffer): T => {
  const decipher = createDecipheriv('aes-256-gcm', encKey, sealed.subarray(0, IV_BYTES), {
    authTagLength: TAG_BYTES,
  })
  decipher.setAAD(Buffer.from(key))
  decipher.setAuthTag(sealed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
  const body = Buffer.concat([
    decipher.update(sealed.subarray(IV_BYTES + TAG_BYTES)),
    decipher.final(),
  ])
  return JSON.parse(body.toString()) as T
}

/**
 * url（`postgres://...`）の PostgreSQL に置く SessionStore を作る。テーブルは migrate が作る。
 *
 * 値は secret から導いた鍵で暗号化して置く。時刻は全て DB の now() で比べ、web のインスタンスの時計の差に依らない。
 * 接続のプーラーを transaction のモードで通しても動くよう、名前付きの prepared statement と advisory lock を使わない。
 */
export const createPostgresSessionStore = (
  url: string,
  secret: string,
  maxConnections: number,
): PostgresSessionStore => {
  const encKey = deriveKey(secret)
  const pool = new pg.Pool({
    connectionString: url,
    max: maxConnections,
    connectionTimeoutMillis: 2000,
    // 応答の無い DB で、リクエストを長く待たせない。Valkey の commandTimeout と同じ値にする
    query_timeout: 2000,
    // 使っていない接続を 30 秒で閉じ、DB の接続の数の上限を、使っているときだけ使う
    idleTimeoutMillis: 30_000,
  })
  // error を聞かないと、使っていない接続が切れたときに、処理されない例外でプロセスが落ちる
  pool.on('error', () => {})

  const readValue = async <T>(sql: string, key: string): Promise<T | undefined> => {
    const { rows } = await pool.query<{ value: Buffer }>(sql, [key])
    return rows[0] === undefined ? undefined : open<T>(encKey, key, rows[0].value)
  }

  return {
    get: (key) =>
      readValue('SELECT value FROM web_sessions WHERE key = $1 AND expires_at > now()', key),
    set: async (key, value, ttlSeconds) => {
      await pool.query(
        `INSERT INTO web_sessions (key, value, expires_at)
         VALUES ($1, $2, now() + make_interval(secs => $3))
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`,
        [key, seal(encKey, key, value), ttlSeconds],
      )
    },
    replace: async (key, value) => {
      const { rowCount } = await pool.query(
        'UPDATE web_sessions SET value = $2 WHERE key = $1 AND expires_at > now()',
        [key, seal(encKey, key, value)],
      )
      return rowCount === 1
    },
    lock: async (key, ttlMs) => {
      const token = randomBytes(16).toString('base64url')
      // 期限の切れた鍵だけを奪う。1 つの文にして、2 つのリクエストが同時に同じ鍵を取らないようにする
      const { rowCount } = await pool.query(
        `INSERT INTO web_session_locks (key, token, expires_at)
         VALUES ($1, $2, now() + make_interval(secs => $3 / 1000.0))
         ON CONFLICT (key) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at
         WHERE web_session_locks.expires_at <= now()`,
        [key, token, ttlMs],
      )
      return rowCount === 1 ? token : undefined
    },
    unlock: async (key, token) => {
      await pool.query('DELETE FROM web_session_locks WHERE key = $1 AND token = $2', [key, token])
    },
    exists: async (key) => {
      const { rows } = await pool.query<{ found: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM web_sessions WHERE key = $1 AND expires_at > now())
             OR EXISTS (SELECT 1 FROM web_session_locks WHERE key = $1 AND expires_at > now())
             AS found`,
        [key],
      )
      return rows[0]?.found === true
    },
    take: async (key) => {
      const { rows } = await pool.query<{ value: Buffer; live: boolean }>(
        'DELETE FROM web_sessions WHERE key = $1 RETURNING value, expires_at > now() AS live',
        [key],
      )
      const row = rows[0]
      return row === undefined || !row.live ? undefined : open(encKey, key, row.value)
    },
    delete: async (key) => {
      await pool.query('DELETE FROM web_sessions WHERE key = $1', [key])
      await pool.query('DELETE FROM web_session_locks WHERE key = $1', [key])
    },
    ping: async () => {
      await pool.query('SELECT 1')
    },
    purgeExpired: async () => {
      let purged = 0
      for (const table of ['web_sessions', 'web_session_locks'] as const) {
        const { rowCount } = await pool.query(
          // 拾った後に lock が取り直した鍵を消さないよう、消すときも期限を見直す
          `DELETE FROM ${table} WHERE expires_at <= now() AND key IN
             (SELECT key FROM ${table} WHERE expires_at <= now() LIMIT ${PURGE_LIMIT})`,
        )
        purged += rowCount ?? 0
      }
      return purged
    },
    close: () => pool.end(),
  }
}
